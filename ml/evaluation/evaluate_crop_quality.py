"""Evaluation of Exported ONNX Crop Quality Model on the Held-Out Test Split.

This script loads the exported ONNX artifact ('crop_quality_mobilenet_v2.onnx')
and evaluates it strictly on the held-out test split (108 images) that was
never seen during training or validation/checkpoint selection.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

NUM_CLASSES = 3
CLASS_TO_IDX = {"Good": 0, "Average": 1, "Poor": 2}
IDX_TO_CLASS = {0: "Good", 1: "Average", 2: "Poor"}

PROJECT_ROOT = Path("d:/KisanDirect-AI")
MANIFEST_PATH = PROJECT_ROOT / "ml/datasets/crop_quality/splits_manifest.json"
DATASET_DIR = PROJECT_ROOT / "ml/datasets/crop_quality/images"
ONNX_PATH = PROJECT_ROOT / "ml/crop_quality/model_artifacts/crop_quality_mobilenet_v2.onnx"


def preprocess_image(image_path: Path) -> np.ndarray:
    """Preprocess image to normalized NCHW Float32 array for MobileNetV2 ONNX model."""
    imagenet_mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
    imagenet_std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

    with Image.open(image_path) as im:
        rgb = im.convert("RGB").resize((224, 224), Image.Resampling.LANCZOS)

    arr = np.array(rgb, dtype=np.float32) / 255.0  # HWC
    chw = np.transpose(arr, (2, 0, 1))             # CHW
    norm = (chw - imagenet_mean) / imagenet_std    # Normalize
    nchw = np.expand_dims(norm, axis=0)            # 1CHW
    return nchw.astype(np.float32)


def evaluate_onnx_test_set() -> dict[str, Any]:
    logger.info("Loading manifest from %s...", MANIFEST_PATH)
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    test_samples = [s for s in manifest["samples"] if s["split"] == "test"]
    logger.info("Loaded %d held-out test samples.", len(test_samples))

    logger.info("Initializing ONNX Runtime session with %s...", ONNX_PATH)
    session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name

    y_true: list[int] = []
    y_pred: list[int] = []
    pred_probabilities: list[list[float]] = []

    for s in test_samples:
        img_path = DATASET_DIR / s["rel_path"]
        inp = preprocess_image(img_path)
        logits = session.run([output_name], {input_name: inp})[0][0]

        # Softmax probabilities
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)

        predicted_idx = int(np.argmax(probs))
        true_idx = CLASS_TO_IDX[s["mapped_grade"]]

        y_true.append(true_idx)
        y_pred.append(predicted_idx)
        pred_probabilities.append([float(p) for p in probs])

    # Confusion matrix
    confusion = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=int)
    for t, p in zip(y_true, y_pred, strict=True):
        confusion[t, p] += 1

    total = len(y_true)
    accuracy = float(np.trace(confusion)) / total

    precisions = []
    recalls = []
    f1s = []

    for c in range(NUM_CLASSES):
        tp = confusion[c, c]
        fp = np.sum(confusion[:, c]) - tp
        fn = np.sum(confusion[c, :]) - tp

        p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * p * r) / (p + r) if (p + r) > 0 else 0.0

        precisions.append(p)
        recalls.append(r)
        f1s.append(f1)

    macro_f1 = float(np.mean(f1s))

    results = {
        "model_artifact": str(ONNX_PATH.name),
        "total_test_samples": total,
        "overall_accuracy": accuracy,
        "macro_f1": macro_f1,
        "classes": [IDX_TO_CLASS[c] for c in range(NUM_CLASSES)],
        "per_class_metrics": {
            IDX_TO_CLASS[c]: {
                "precision": round(float(precisions[c]), 4),
                "recall": round(float(recalls[c]), 4),
                "f1_score": round(float(f1s[c]), 4),
                "support": int(np.sum(confusion[c, :])),
            }
            for c in range(NUM_CLASSES)
        },
        "confusion_matrix": {
            "labels": [IDX_TO_CLASS[c] for c in range(NUM_CLASSES)],
            "matrix": confusion.tolist(),
        },
    }

    print("\n" + "="*50)
    print("HELD-OUT TEST SET EVALUATION REPORT (ONNX RUNTIME)")
    print("="*50)
    print(f"Overall Accuracy : {accuracy:.4f} ({np.trace(confusion)}/{total})")
    print(f"Macro F1-Score   : {macro_f1:.4f}")
    print("\nPer-Class Breakdown:")
    for cls_name, m in results["per_class_metrics"].items():
        print(f"  {cls_name:10s} - Precision: {m['precision']:.4f}, Recall: {m['recall']:.4f}, F1: {m['f1_score']:.4f} (Support: {m['support']})")

    print("\nConfusion Matrix (Rows: Ground Truth, Cols: Prediction):")
    header = "          " + "".join(f"{c:>10s}" for c in results["classes"])
    print(header)
    for c_idx, c_name in enumerate(results["classes"]):
        row_str = f"{c_name:10s}" + "".join(f"{confusion[c_idx, j]:10d}" for j in range(NUM_CLASSES))
        print(row_str)
    print("="*50 + "\n")

    return results


if __name__ == "__main__":
    evaluate_onnx_test_set()
