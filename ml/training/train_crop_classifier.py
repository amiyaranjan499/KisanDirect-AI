"""Training script for 10-Crop Species Classifier using MobileNetV2 Transfer Learning.

Supported Crops (10 classes):
1. Potato
2. Tomato
3. Onion
4. Apple
5. Mango
6. Banana
7. Orange
8. Carrot
9. Brinjal (Eggplant)
10. Cabbage
"""

from __future__ import annotations

import json
import logging
import os
import random
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
from PIL import Image

# Suppress verbose TF logs
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
import keras
from keras import layers
from keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input
from sklearn.metrics import classification_report, confusion_matrix

from ml.crop_classification.model_metadata import (
    CLASS_DISPLAY_NAMES,
    CLASS_TO_IDX,
    CLASSES,
    CONFIDENCE_THRESHOLD,
    IDX_TO_CLASS,
    MODEL_NAME,
    MODEL_VERSION,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Constants
RANDOM_SEED = 42
TARGET_SIZE = (224, 224)
BATCH_SIZE = 32
INITIAL_EPOCHS = 10
FINE_TUNE_EPOCHS = 8
LEARNING_RATE = 5e-4
FINE_TUNE_LR = 5e-5

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_ROOT = PROJECT_ROOT / "ml" / "datasets" / "ten_crops"
DEMO_DIR = DATASET_ROOT / "demo_test_images"
OUTPUT_DIR = PROJECT_ROOT / "ml" / "crop_classification" / "model_artifacts"
MODEL_SAVE_PATH = OUTPUT_DIR / "crop_classifier_mobilenet_v2.keras"
METRICS_SAVE_PATH = OUTPUT_DIR / "training_report.json"
METADATA_SAVE_PATH = OUTPUT_DIR / "model_metadata.json"


def set_seed(seed: int = RANDOM_SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    keras.utils.set_random_seed(seed)


def load_split_images(split_name: str) -> tuple[np.ndarray, np.ndarray, list[str]]:
    split_dir = DATASET_ROOT / split_name
    X_list: list[np.ndarray] = []
    y_list: list[int] = []
    paths_list: list[str] = []

    for crop_name in CLASSES:
        crop_dir = split_dir / crop_name
        if not crop_dir.exists():
            continue
        cls_idx = CLASS_TO_IDX[crop_name]
        for img_path in sorted(crop_dir.glob("*.jpg")):
            try:
                with Image.open(img_path) as img:
                    rgb = img.convert("RGB").resize(TARGET_SIZE, Image.Resampling.BILINEAR)
                    X_list.append(np.array(rgb, dtype=np.float32))
                    y_list.append(cls_idx)
                    paths_list.append(str(img_path))
            except Exception as exc:
                logger.warning("Error reading %s: %s", img_path, exc)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)
    # Scale to [-1, 1] using MobileNetV2 preprocessing
    X = preprocess_input(X)
    return X, y, paths_list


def build_crop_classifier() -> tuple[keras.Model, keras.Model]:
    """Build MobileNetV2 transfer learning model with data augmentation and dense head."""
    data_augmentation = keras.Sequential(
        [
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.15),
            layers.RandomZoom(0.15),
            layers.RandomContrast(0.15),
        ],
        name="data_augmentation",
    )

    base_model = MobileNetV2(
        weights="imagenet",
        include_top=False,
        input_shape=(224, 224, 3),
        pooling="avg",
    )
    base_model.trainable = False

    inputs = keras.Input(shape=(224, 224, 3), name="crop_image_input")
    augmented = data_augmentation(inputs)
    x = base_model(augmented, training=False)
    x = layers.Dense(128, activation="relu", name="fc_dense")(x)
    x = layers.Dropout(0.3, name="fc_dropout")(x)
    outputs = layers.Dense(len(CLASSES), activation="softmax", name="crop_probabilities")(x)

    model = keras.Model(inputs=inputs, outputs=outputs, name="crop_species_classifier")
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model, base_model


def train_and_evaluate() -> dict[str, Any]:
    set_seed(RANDOM_SEED)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading 10-crop train, val, and test splits...")
    X_train, y_train, _ = load_split_images("train")
    X_val, y_val, _ = load_split_images("val")
    X_test, y_test, test_paths = load_split_images("test")

    logger.info("Dataset loaded: Train=%d, Val=%d, Test=%d", len(y_train), len(y_val), len(y_test))
    logger.info("Class distribution in Test: %s", {c: int((y_test == i).sum()) for c, i in CLASS_TO_IDX.items()})

    model, base_model = build_crop_classifier()

    # Phase 1: Train classification head with frozen backbone
    logger.info("Phase 1: Training dense classification head for %d epochs...", INITIAL_EPOCHS)
    model.fit(
        X_train,
        y_train,
        validation_data=(X_val, y_val),
        epochs=INITIAL_EPOCHS,
        batch_size=BATCH_SIZE,
        verbose=1,
    )

    # Phase 2: Fine-tune top layers of MobileNetV2 backbone
    logger.info("Phase 2: Fine-tuning top backbone layers for %d epochs...", FINE_TUNE_EPOCHS)
    base_model.trainable = True
    fine_tune_at = 115
    for layer in base_model.layers[:fine_tune_at]:
        layer.trainable = False

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=FINE_TUNE_LR),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    model.fit(
        X_train,
        y_train,
        validation_data=(X_val, y_val),
        epochs=FINE_TUNE_EPOCHS,
        batch_size=BATCH_SIZE,
        verbose=1,
    )

    # Evaluate on held-out TEST set
    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    logger.info("Held-out Test Loss: %.4f, Overall Accuracy: %.4f", test_loss, test_acc)

    test_preds = model.predict(X_test, verbose=0)
    test_pred_labels = np.argmax(test_preds, axis=1)

    report_dict = classification_report(
        y_test, test_pred_labels, target_names=CLASSES, output_dict=True
    )
    report_str = classification_report(
        y_test, test_pred_labels, target_names=CLASSES, output_dict=False
    )
    cm = confusion_matrix(y_test, test_pred_labels).tolist()

    logger.info("\n--- HELD-OUT TEST EVALUATION REPORT ---\n%s", report_str)

    # Evaluate on 10 dedicated DEMO images
    logger.info("Evaluating 10 dedicated DEMO images...")
    demo_results = {}
    demo_correct_count = 0

    for crop_name in CLASSES:
        demo_img_path = DEMO_DIR / f"{crop_name}.jpg"
        if not demo_img_path.exists():
            demo_results[crop_name] = {"status": "FILE_MISSING"}
            continue

        with Image.open(demo_img_path) as img:
            arr = np.array(img.convert("RGB").resize(TARGET_SIZE, Image.Resampling.BILINEAR), dtype=np.float32)
            input_tensor = preprocess_input(np.expand_dims(arr, axis=0))
            pred_probs = model.predict(input_tensor, verbose=0)[0]
            pred_idx = int(np.argmax(pred_probs))
            pred_crop = IDX_TO_CLASS[pred_idx]
            conf = float(pred_probs[pred_idx])

            is_correct = (pred_crop == crop_name)
            if is_correct:
                demo_correct_count += 1

            demo_results[crop_name] = {
                "expected": crop_name,
                "predicted": pred_crop,
                "confidence": round(conf, 4),
                "is_correct": is_correct,
            }
            logger.info("Demo %-10s -> Predicted: %-10s (conf: %.2f) [%s]",
                        crop_name, pred_crop, conf, "PASS" if is_correct else "FAIL")

    demo_score = f"{demo_correct_count}/{len(CLASSES)}"
    logger.info("Demo Target Result: %s correct", demo_score)

    # Save model artifact
    logger.info("Saving trained Keras model artifact to %s", MODEL_SAVE_PATH)
    model.save(MODEL_SAVE_PATH)

    # Save training report
    metrics_data = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "overall_test_accuracy": float(test_acc),
        "overall_test_loss": float(test_loss),
        "macro_f1": float(report_dict["macro avg"]["f1-score"]),
        "weighted_f1": float(report_dict["weighted avg"]["f1-score"]),
        "classification_report": report_dict,
        "confusion_matrix": cm,
        "classes": CLASSES,
        "demo_results": demo_results,
        "demo_score": demo_score,
        "demo_pass": (demo_correct_count == len(CLASSES)),
    }
    with open(METRICS_SAVE_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)

    metadata_data = {
        "model_file": str(MODEL_SAVE_PATH.name),
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "classes": CLASSES,
        "class_to_idx": CLASS_TO_IDX,
        "idx_to_class": {str(k): v for k, v in IDX_TO_CLASS.items()},
        "input_size": list(TARGET_SIZE) + [3],
        "preprocessing": "mobilenet_v2_preprocess_input_scaling_[-1,1]",
        "training_dataset": "ml/datasets/ten_crops",
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "metrics": {
            "test_accuracy": round(float(test_acc), 4),
            "macro_f1": round(float(report_dict["macro avg"]["f1-score"]), 4),
        },
    }
    with open(METADATA_SAVE_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata_data, f, indent=2)

    logger.info("Model artifacts and metadata saved successfully.")
    return metrics_data


if __name__ == "__main__":
    train_and_evaluate()
