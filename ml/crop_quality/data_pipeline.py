"""Data Acquisition, Deduplication, and Stratified Manifest Pipeline for AFruitDB.

This module acquires authentic images from the AFruitDB dataset, validates formats,
performs global SHA-256 (exact) and perceptual hash (near-duplicate) filtering,
and builds reproducible, leak-free train/val/test splits without duplicate images.

Attribution:
- Paper: Mojumdar et al. (2025), "AFruitDB: A comprehensive dataset of six commonly
  used Asian fruits for advanced grading and biodiversity insights", Data in Brief, 59, 111380.
- Repository: Mendeley Data, V1 (DOI: 10.17632/bz65dz2pbj.1).
- License: Creative Commons Attribution 4.0 International (CC-BY-4.0).

Disclaimer:
This pipeline constructs a project-specific visual quality grade mapping (1st -> Good,
2nd -> Average, 3rd -> Poor) for external visual sorting. It does not measure food safety,
pathogen contamination, or internal decay.
"""

from __future__ import annotations

import collections
import hashlib
import io
import json
import logging
import os
import random
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from PIL import Image
import pyarrow as pa
import pyarrow.parquet as pq

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Target Produce Types & Label Mapping
SELECTED_PRODUCE = {"apple", "tomatoes", "mango", "papayas"}
LABEL_MAP = {
    0: "Good",       # 1st-grade: Fully fresh, market ready
    1: "Average",    # 2nd-grade: Minor imperfections, fit for use
    2: "Poor",       # 3rd-grade: Highly decayed/damaged
}

TARGET_PER_BUCKET = 60
RANDOM_SEED = 42

PARQUET_REGISTRY = [
    (0, "https://huggingface.co/datasets/Project-AgML/AFruitDB_fruit_grade_classification/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet", 474941035),
    (1, "https://huggingface.co/datasets/Project-AgML/AFruitDB_fruit_grade_classification/resolve/refs%2Fconvert%2Fparquet/default/train/0001.parquet", 478837955),
    (2, "https://huggingface.co/datasets/Project-AgML/AFruitDB_fruit_grade_classification/resolve/refs%2Fconvert%2Fparquet/default/train/0002.parquet", 408026331),
    (3, "https://huggingface.co/datasets/Project-AgML/AFruitDB_fruit_grade_classification/resolve/refs%2Fconvert%2Fparquet/default/train/0003.parquet", 442495278),
    (4, "https://huggingface.co/datasets/Project-AgML/AFruitDB_fruit_grade_classification/resolve/refs%2Fconvert%2Fparquet/default/train/0004.parquet", 421108390),
    (5, "https://huggingface.co/datasets/Project-AgML/AFruitDB_fruit_grade_classification/resolve/refs%2Fconvert%2Fparquet/default/train/0005.parquet", 498451093),
]


class RemoteParquetFile(io.BufferedIOBase):
    """HTTP Range-request backed file-like stream for zero-local-storage Parquet reading."""

    def __init__(self, url: str, size: int) -> None:
        self.url = url
        self.size = size
        self.pos = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def tell(self) -> int:
        return self.pos

    def read(self, size: int = -1) -> bytes:
        if size == -1 or self.pos + size > self.size:
            size = self.size - self.pos
        if size <= 0:
            return b""
        req = urllib.request.Request(
            self.url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Range": f"bytes={self.pos}-{self.pos + size - 1}",
            },
        )
        data = None
        for attempt in range(10):
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    data = resp.read()
                break
            except Exception as exc:
                if attempt == 9:
                    logger.error("Failed range read at pos %d size %d after 10 attempts: %s", self.pos, size, exc)
                    raise
                import time
                wait_time = min(30, 2 * (attempt + 1))
                logger.warning("Range read timeout/error at pos %d (attempt %d/10), retrying in %ds (%s)...", self.pos, attempt + 1, wait_time, exc)
                time.sleep(wait_time)

        self.pos += len(data)
        return data


def compute_ahash(img: Image.Image, size: int = 8) -> int:
    """Compute 64-bit Average Hash (aHash) for near-duplicate detection."""
    gray = img.convert("L").resize((size, size), Image.Resampling.LANCZOS)
    pixels = list(gray.get_flattened_data())
    avg = sum(pixels) / len(pixels)
    return sum(1 << i for i, v in enumerate(pixels) if v > avg)


def hamming_distance(h1: int, h2: int) -> int:
    return bin(h1 ^ h2).count("1")


@dataclass
class ValidatedSample:
    sample_id: str
    parquet_idx: int
    row_group_idx: int
    row_in_rg: int
    fruit_type: str
    original_label: int
    mapped_label: str
    sha256: str
    ahash: int
    width: int
    height: int
    image_bytes: bytes


class CropQualityDataPipeline:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        self.dataset_dir = output_dir / "images"
        self.manifest_path = output_dir / "splits_manifest.json"
        self.global_sha256: set[str] = set()
        self.global_ahashes: list[tuple[int, str]] = []  # (ahash, sample_id)
        self.exclusions: list[dict[str, Any]] = []

    def validate_and_deduplicate(
        self,
        raw_bytes: bytes,
        sample_meta: dict[str, Any],
    ) -> ValidatedSample | None:
        """Validate decode integrity, check exact SHA-256 duplicate and near-duplicate aHash."""
        sample_id = sample_meta["sample_id"]

        # 1. Byte-level exact SHA-256
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        if sha256 in self.global_sha256:
            self.exclusions.append({
                "sample_id": sample_id,
                "reason": "EXACT_DUPLICATE_SHA256",
                "sha256": sha256,
                **sample_meta,
            })
            return None

        # 2. Pillow image decode and integrity verification
        try:
            im = Image.open(io.BytesIO(raw_bytes))
            im.verify()  # Check structure
            # Reopen to load pixels after verify
            im = Image.open(io.BytesIO(raw_bytes))
            im = im.convert("RGB")
            width, height = im.size
        except Exception as exc:
            self.exclusions.append({
                "sample_id": sample_id,
                "reason": f"CORRUPT_OR_UNREADABLE_IMAGE: {exc}",
                "sha256": sha256,
                **sample_meta,
            })
            return None

        # 3. Global near-duplicate check via aHash (Hamming distance <= 3)
        ahash = compute_ahash(im)
        for existing_hash, existing_id in self.global_ahashes:
            dist = hamming_distance(ahash, existing_hash)
            if dist <= 3:
                self.exclusions.append({
                    "sample_id": sample_id,
                    "reason": f"NEAR_DUPLICATE_AHASH (Hamming distance {dist} with {existing_id})",
                    "sha256": sha256,
                    "ahash": hex(ahash),
                    "matched_sample_id": existing_id,
                    **sample_meta,
                })
                return None

        # Accept sample globally
        self.global_sha256.add(sha256)
        self.global_ahashes.append((ahash, sample_id))

        # Standardize resize to 224x224 RGB JPEG
        resized = im.resize((224, 224), Image.Resampling.LANCZOS)
        out_buf = io.BytesIO()
        resized.save(out_buf, format="JPEG", quality=95)

        return ValidatedSample(
            sample_id=sample_id,
            parquet_idx=sample_meta["parquet_idx"],
            row_group_idx=sample_meta["row_group_idx"],
            row_in_rg=sample_meta["row_in_rg"],
            fruit_type=sample_meta["fruit_type"],
            original_label=sample_meta["original_label"],
            mapped_label=sample_meta["mapped_label"],
            sha256=sha256,
            ahash=ahash,
            width=width,
            height=height,
            image_bytes=out_buf.getvalue(),
        )

    def run_acquisition(self) -> dict[str, Any]:
        """Stream row groups, acquire valid samples, and enforce uniform bucket counts."""
        logger.info("Starting AFruitDB streaming acquisition and global deduplication...")
        candidates_by_bucket: dict[tuple[str, int], list[ValidatedSample]] = collections.defaultdict(list)

        for p_idx, url, sz in PARQUET_REGISTRY:
            logger.info("Opening Parquet %d (%s)...", p_idx, Path(url).name)
            remote_file = RemoteParquetFile(url, sz)
            p_file = pq.ParquetFile(remote_file)

            for rg_idx in range(p_file.num_row_groups):
                # Inspect lightweight schema and types first
                meta_rg = p_file.metadata.row_group(rg_idx)
                rg_summary = p_file.read_row_group(rg_idx, columns=["fruit_type", "label"])
                fruits = rg_summary["fruit_type"].to_pylist()
                labels = rg_summary["label"].to_pylist()

                relevant_indices = [
                    i for i, (f, l) in enumerate(zip(fruits, labels))
                    if f in SELECTED_PRODUCE and l in LABEL_MAP
                ]
                if not relevant_indices:
                    continue

                needed_indices = [
                    i for i in relevant_indices
                    if len(candidates_by_bucket[(fruits[i], labels[i])]) < TARGET_PER_BUCKET + 15
                ]
                if not needed_indices:
                    logger.info("Parquet %d RG %d: All relevant buckets already satisfied. Skipping image download.", p_idx, rg_idx)
                    continue

                logger.info(
                    "Parquet %d RG %d: Found %d needed candidates (%d total relevant). Streaming image bytes...",
                    p_idx, rg_idx, len(needed_indices), len(relevant_indices)
                )

                # Fetch full row group with images
                rg_full = p_file.read_row_group(rg_idx, columns=["image", "fruit_type", "label"])
                img_col = rg_full["image"]

                for i in needed_indices:
                    f = fruits[i]
                    l = labels[i]
                    bucket_key = (f, l)

                    if len(candidates_by_bucket[bucket_key]) >= TARGET_PER_BUCKET + 15:
                        continue

                    img_struct = img_col[i].as_py()
                    raw_bytes = img_struct.get("bytes")
                    if not raw_bytes:
                        continue

                    sample_meta = {
                        "sample_id": f"P{p_idx}_RG{rg_idx}_R{i}_{f}_L{l}",
                        "parquet_idx": p_idx,
                        "row_group_idx": rg_idx,
                        "row_in_rg": i,
                        "fruit_type": f,
                        "original_label": l,
                        "mapped_label": LABEL_MAP[l],
                    }

                    validated = self.validate_and_deduplicate(raw_bytes, sample_meta)
                    if validated is not None:
                        candidates_by_bucket[bucket_key].append(validated)

        # Audit bucket counts
        logger.info("--- CANDIDATE POOL SUMMARY AFTER DEDUPLICATION ---")
        min_bucket_count = min(len(samples) for samples in candidates_by_bucket.values()) if candidates_by_bucket else 0
        for (f, l), samples in sorted(candidates_by_bucket.items()):
            logger.info("Bucket (%s, Grade %d -> %s): %d unique valid images", f, l, LABEL_MAP[l], len(samples))

        # Determine uniform target count: min(60, min_bucket_count)
        final_per_bucket = min(TARGET_PER_BUCKET, min_bucket_count)
        logger.info(
            "Selected uniform per-bucket sample size: %d (Target: %d, Shortest bucket: %d)",
            final_per_bucket, TARGET_PER_BUCKET, min_bucket_count
        )

        # Deterministic sampling and split partition (70% train, 15% val, 15% test)
        rng = random.Random(RANDOM_SEED)
        final_samples: list[dict[str, Any]] = []
        train_count = int(round(final_per_bucket * 0.70))
        val_count = int(round(final_per_bucket * 0.15))
        test_count = final_per_bucket - train_count - val_count

        logger.info(
            "Per-bucket split: Train=%d, Val=%d, Test=%d (Total per bucket=%d)",
            train_count, val_count, test_count, final_per_bucket
        )

        os.makedirs(self.dataset_dir, exist_ok=True)
        for split in ["train", "val", "test"]:
            for grade_label in ["Good", "Average", "Poor"]:
                os.makedirs(self.dataset_dir / split / grade_label, exist_ok=True)

        split_summary = collections.Counter()
        class_summary = collections.Counter()
        fruit_summary = collections.Counter()

        for (f, l), samples in sorted(candidates_by_bucket.items()):
            # Deterministic shuffle
            rng.shuffle(samples)
            selected = samples[:final_per_bucket]

            for idx, sample in enumerate(selected):
                if idx < train_count:
                    split = "train"
                elif idx < train_count + val_count:
                    split = "val"
                else:
                    split = "test"

                # Save file to disk
                mapped_grade = sample.mapped_label
                filename = f"{sample.sample_id}_{sample.sha256[:8]}.jpg"
                rel_path = f"{split}/{mapped_grade}/{filename}"
                full_path = self.dataset_dir / rel_path

                with open(full_path, "wb") as f_out:
                    f_out.write(sample.image_bytes)

                sample_dict = {
                    "sample_id": sample.sample_id,
                    "split": split,
                    "rel_path": rel_path,
                    "fruit_type": sample.fruit_type,
                    "original_grade": sample.original_label,
                    "mapped_grade": mapped_grade,
                    "sha256": sample.sha256,
                    "ahash": hex(sample.ahash),
                    "original_dimensions": [sample.width, sample.height],
                    "resized_dimensions": [224, 224],
                    "source": {
                        "parquet_idx": sample.parquet_idx,
                        "row_group_idx": sample.row_group_idx,
                        "row_in_rg": sample.row_in_rg,
                    },
                }
                final_samples.append(sample_dict)
                split_summary[split] += 1
                class_summary[mapped_grade] += 1
                fruit_summary[sample.fruit_type] += 1

        # Manifest construction
        manifest = {
            "dataset_name": "AFruitDB_Subsample_KisanDirect",
            "citation": "Mojumdar et al. (2025), Data in Brief, 59, 111380",
            "mendeley_doi": "10.17632/bz65dz2pbj.1",
            "license": "CC-BY-4.0",
            "random_seed": RANDOM_SEED,
            "target_per_bucket": final_per_bucket,
            "total_samples": len(final_samples),
            "split_distribution": dict(split_summary),
            "class_distribution": dict(class_summary),
            "fruit_distribution": dict(fruit_summary),
            "total_exclusions": len(self.exclusions),
            "exclusions_summary": dict(collections.Counter(e["reason"].split(":")[0] for e in self.exclusions)),
            "samples": final_samples,
            "exclusions": self.exclusions,
        }

        with open(self.manifest_path, "w", encoding="utf-8") as f_manifest:
            json.dump(manifest, f_manifest, indent=2)

        logger.info("Manifest saved to %s", self.manifest_path)
        logger.info("Acquisition complete! Total images: %d, Total exclusions: %d", len(final_samples), len(self.exclusions))

        return manifest


if __name__ == "__main__":
    pipeline = CropQualityDataPipeline(Path("d:/KisanDirect-AI/ml/datasets/crop_quality"))
    pipeline.run_acquisition()

