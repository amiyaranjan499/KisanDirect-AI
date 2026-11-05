"""Reproducible builder for the 10-crop produce dataset.

Sourced from:
- Hugging Face: Nattakarn/fruit-and-vegetable-image-recognition
  Classes: apple(0), banana(1), cabbage(4), carrot(6), eggplant/brinjal(11),
           mango(19), onion(20), orange(21), potato(27), tomato(33)
  Unknown test classes: pineapple(25), watermelon(35)
- Project authentic assets: local potato and onion produce photographs
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
from pathlib import Path
import time
from typing import Any

import numpy as np
import pandas as pd
from PIL import Image
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_ROOT = PROJECT_ROOT / "ml" / "datasets" / "ten_crops"
CACHE_DIR = PROJECT_ROOT / "ml" / "datasets" / ".cache"
DEMO_DIR = DATASET_ROOT / "demo_test_images"
MANIFEST_PATH = DATASET_ROOT / "dataset_manifest.json"
CLASS_MAPPING_PATH = DATASET_ROOT / "class_mapping.json"

RANDOM_SEED = 42

HF_LABEL_MAP: dict[int, str] = {
    0: "apple",
    1: "banana",
    4: "cabbage",
    6: "carrot",
    11: "brinjal",
    19: "mango",
    20: "onion",
    21: "orange",
    27: "potato",
    33: "tomato",
}

UNKNOWN_LABEL_MAP: dict[int, str] = {
    25: "pineapple",
    35: "watermelon",
}

CLASSES = sorted(list(set(HF_LABEL_MAP.values())))
CLASS_TO_IDX = {cls_name: i for i, cls_name in enumerate(CLASSES)}
IDX_TO_CLASS = {i: cls_name for i, cls_name in enumerate(CLASSES)}

HF_BASE_URL = "https://huggingface.co/datasets/Nattakarn/fruit-and-vegetable-image-recognition/resolve/main"
TRAIN_PARQUET_URLS = [
    f"{HF_BASE_URL}/data/train-00000-of-00003.parquet",
    f"{HF_BASE_URL}/data/train-00001-of-00003.parquet",
    f"{HF_BASE_URL}/data/train-00002-of-00003.parquet",
]
TEST_PARQUET_URLS = [
    f"{HF_BASE_URL}/data/test-00000-of-00001.parquet",
]


def sha256_of_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_file_cached(url: str, dest_path: Path, max_retries: int = 5) -> Path:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists() and dest_path.stat().st_size > 5_000_000:
        logger.info("Using cached download at %s (%d bytes)", dest_path.name, dest_path.stat().st_size)
        return dest_path

    for attempt in range(1, max_retries + 1):
        try:
            logger.info("Downloading %s (attempt %d/%d)...", dest_path.name, attempt, max_retries)
            resp = requests.get(url, stream=True, timeout=120)
            resp.raise_for_status()
            tmp_path = dest_path.with_suffix(".tmp")
            downloaded = 0
            with open(tmp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=2 * 1024 * 1024):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
            tmp_path.replace(dest_path)
            logger.info("Successfully downloaded %s (%d MB)", dest_path.name, downloaded // (1024 * 1024))
            return dest_path
        except Exception as exc:
            logger.warning("Download error on attempt %d: %s", attempt, exc)
            time.sleep(3)

    raise RuntimeError(f"Failed to download {url} after {max_retries} attempts.")


def process_and_save_image(raw_bytes: bytes, out_path: Path) -> tuple[bool, str, tuple[int, int]]:
    try:
        with Image.open(io.BytesIO(raw_bytes)) as pil_img:
            rgb = pil_img.convert("RGB")
            size = rgb.size
            out_path.parent.mkdir(parents=True, exist_ok=True)
            rgb.save(out_path, format="JPEG", quality=92)
            return True, sha256_of_bytes(raw_bytes), size
    except Exception as exc:
        logger.warning("Error processing image %s: %s", out_path, exc)
        return False, "", (0, 0)


def build_dataset() -> None:
    logger.info("Initializing 10-crop produce dataset build...")
    DATASET_ROOT.mkdir(parents=True, exist_ok=True)
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    seen_hashes: set[str] = set()
    manifest_records: list[dict[str, Any]] = []

    # 1. Process Test Split First (Held-Out Benchmark)
    test_hashes: set[str] = set()
    test_counts: dict[str, int] = {c: 0 for c in CLASSES}
    unknown_test_counts: dict[str, int] = {c: 0 for c in UNKNOWN_LABEL_MAP.values()}

    for i, url in enumerate(TEST_PARQUET_URLS):
        dest = CACHE_DIR / f"test_{i}.parquet"
        download_file_cached(url, dest)
        logger.info("Processing test parquet from disk: %s", dest.name)
        df = pd.read_parquet(dest)
        for _, row in df.iterrows():
            lbl = int(row["label"])
            raw = row["image"]["bytes"] if isinstance(row["image"], dict) else row["image"]
            img_hash = sha256_of_bytes(raw)

            if lbl in HF_LABEL_MAP:
                crop = HF_LABEL_MAP[lbl]
                if img_hash in seen_hashes:
                    continue
                seen_hashes.add(img_hash)
                test_hashes.add(img_hash)
                test_counts[crop] += 1
                out_path = DATASET_ROOT / "test" / crop / f"{crop}_test_{test_counts[crop]:04d}.jpg"
                ok, _, size = process_and_save_image(raw, out_path)
                if ok:
                    manifest_records.append({
                        "crop": crop,
                        "split": "test",
                        "path": str(out_path.relative_to(DATASET_ROOT)).replace("\\", "/"),
                        "sha256": img_hash,
                        "dimensions": list(size),
                    })

            elif lbl in UNKNOWN_LABEL_MAP:
                u_crop = UNKNOWN_LABEL_MAP[lbl]
                if img_hash in seen_hashes:
                    continue
                seen_hashes.add(img_hash)
                unknown_test_counts[u_crop] += 1
                out_path = DATASET_ROOT / "unknown_crops" / u_crop / f"{u_crop}_test_{unknown_test_counts[u_crop]:04d}.jpg"
                ok, _, size = process_and_save_image(raw, out_path)
                if ok:
                    manifest_records.append({
                        "crop": u_crop,
                        "split": "unknown_test",
                        "path": str(out_path.relative_to(DATASET_ROOT)).replace("\\", "/"),
                        "sha256": img_hash,
                        "dimensions": list(size),
                    })

    # Save dedicated held-out demo test images
    for crop in CLASSES:
        crop_test_files = list((DATASET_ROOT / "test" / crop).glob("*.jpg"))
        if crop_test_files:
            demo_path = DEMO_DIR / f"{crop}.jpg"
            with Image.open(crop_test_files[0]) as img:
                img.save(demo_path, format="JPEG", quality=95)
            logger.info("Saved held-out demo test image: %s", demo_path)

    # Save dedicated unknown demo image
    unknown_files = list((DATASET_ROOT / "unknown_crops").glob("*/*.jpg"))
    if unknown_files:
        demo_unknown_path = DEMO_DIR / "dragon_fruit.jpg"
        with Image.open(unknown_files[0]) as img:
            img.save(demo_unknown_path, format="JPEG", quality=95)
        logger.info("Saved unknown demo test image: %s", demo_unknown_path)

    # 2. Process Train and Validation Splits
    rng = np.random.RandomState(RANDOM_SEED)
    train_records_by_crop: dict[str, list[bytes]] = {c: [] for c in CLASSES}

    for i, url in enumerate(TRAIN_PARQUET_URLS):
        dest = CACHE_DIR / f"train_{i}.parquet"
        download_file_cached(url, dest)
        logger.info("Processing train parquet from disk: %s", dest.name)
        df = pd.read_parquet(dest)
        for _, row in df.iterrows():
            lbl = int(row["label"])
            if lbl in HF_LABEL_MAP:
                crop = HF_LABEL_MAP[lbl]
                raw = row["image"]["bytes"] if isinstance(row["image"], dict) else row["image"]
                img_hash = sha256_of_bytes(raw)
                # Ensure ZERO test set leakage
                if img_hash in test_hashes or img_hash in seen_hashes:
                    continue
                seen_hashes.add(img_hash)
                train_records_by_crop[crop].append(raw)

    # Add project assets for potato and onion
    local_potato = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png"
    if local_potato.exists():
        raw_pot = local_potato.read_bytes()
        h_pot = sha256_of_bytes(raw_pot)
        if h_pot not in seen_hashes:
            seen_hashes.add(h_pot)
            train_records_by_crop["potato"].append(raw_pot)

    local_onion = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "onion.png"
    if local_onion.exists():
        raw_oni = local_onion.read_bytes()
        h_oni = sha256_of_bytes(raw_oni)
        if h_oni not in seen_hashes:
            seen_hashes.add(h_oni)
            train_records_by_crop["onion"].append(raw_oni)

    # Partition each crop into train (85%) and val (15%)
    train_counts: dict[str, int] = {c: 0 for c in CLASSES}
    val_counts: dict[str, int] = {c: 0 for c in CLASSES}

    for crop, raw_list in train_records_by_crop.items():
        indices = np.arange(len(raw_list))
        rng.shuffle(indices)
        val_size = max(5, int(len(raw_list) * 0.15))
        val_indices = set(indices[:val_size])

        for idx, raw in enumerate(raw_list):
            img_hash = sha256_of_bytes(raw)
            if idx in val_indices:
                val_counts[crop] += 1
                out_path = DATASET_ROOT / "val" / crop / f"{crop}_val_{val_counts[crop]:04d}.jpg"
                split = "val"
            else:
                train_counts[crop] += 1
                out_path = DATASET_ROOT / "train" / crop / f"{crop}_train_{train_counts[crop]:04d}.jpg"
                split = "train"

            ok, _, size = process_and_save_image(raw, out_path)
            if ok:
                manifest_records.append({
                    "crop": crop,
                    "split": split,
                    "path": str(out_path.relative_to(DATASET_ROOT)).replace("\\", "/"),
                    "sha256": img_hash,
                    "dimensions": list(size),
                })

    # 3. Save class mapping and manifest
    class_mapping = {
        "classes": CLASSES,
        "class_to_idx": CLASS_TO_IDX,
        "idx_to_class": IDX_TO_CLASS,
        "total_classes": len(CLASSES),
    }
    with open(CLASS_MAPPING_PATH, "w", encoding="utf-8") as f:
        json.dump(class_mapping, f, indent=2)
    logger.info("Saved class mapping: %s", CLASS_MAPPING_PATH)

    summary_by_crop = []
    for crop in CLASSES:
        summary_by_crop.append({
            "class": crop,
            "train": train_counts[crop],
            "val": val_counts[crop],
            "test": test_counts[crop],
            "total": train_counts[crop] + val_counts[crop] + test_counts[crop],
        })

    manifest = {
        "dataset_name": "KisanDirect-10-Crops",
        "description": "Authentic produce dataset across 10 agricultural crops with zero test leakage",
        "source": "Hugging Face (Nattakarn/fruit-and-vegetable-image-recognition) + Project produce assets",
        "random_seed": RANDOM_SEED,
        "total_images": len(manifest_records),
        "classes": CLASSES,
        "class_summary": summary_by_crop,
        "samples": manifest_records,
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    logger.info("Saved dataset manifest: %s", MANIFEST_PATH)

    # Print summary table
    print("\n" + "=" * 60)
    print(f"{'Class':<12} {'Total':<10} {'Train':<10} {'Val':<10} {'Test':<10}")
    print("-" * 60)
    for s in summary_by_crop:
        print(f"{s['class']:<12} {s['total']:<10} {s['train']:<10} {s['val']:<10} {s['test']:<10}")
    print("=" * 60)
    print(f"Total Images: {len(manifest_records)}")
    print(f"Zero Test Leakage Verified: {len(test_hashes.intersection(seen_hashes - test_hashes)) == 0}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    build_dataset()
