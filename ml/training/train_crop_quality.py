"""Training and ONNX Export Pipeline for Crop Quality Classification.

This script trains a MobileNetV2 classification head for Good / Average / Poor
produce grading using the verified AFruitDB subsample dataset.
- Training split: 504 images
- Validation split: 108 images (used exclusively for checkpoint selection)
- Held-out Test split: 108 images (strictly untouched during training)

Attribution:
- Dataset: Mojumdar et al. (2025), Data in Brief, 59, 111380.
- License: CC-BY-4.0
"""

from __future__ import annotations

import json
import logging
import os
import random
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Constants
RANDOM_SEED = 42
NUM_CLASSES = 3
BATCH_SIZE = 16
NUM_EPOCHS = 15
LEARNING_RATE = 1e-4

CLASS_TO_IDX = {"Good": 0, "Average": 1, "Poor": 2}
IDX_TO_CLASS = {0: "Good", 1: "Average", 2: "Poor"}

PROJECT_ROOT = Path("d:/KisanDirect-AI")
MANIFEST_PATH = PROJECT_ROOT / "ml/datasets/crop_quality/splits_manifest.json"
DATASET_DIR = PROJECT_ROOT / "ml/datasets/crop_quality/images"
OUTPUT_DIR = PROJECT_ROOT / "ml/crop_quality/model_artifacts"
ONNX_EXPORT_PATH = OUTPUT_DIR / "crop_quality_mobilenet_v2.onnx"


def set_seed(seed: int = RANDOM_SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


class CropQualityDataset(Dataset):
    """PyTorch Dataset loading images using the verified manifest."""

    def __init__(self, manifest_samples: list[dict[str, Any]], base_dir: Path, transform=None) -> None:
        self.samples = manifest_samples
        self.base_dir = base_dir
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        sample = self.samples[idx]
        image_path = self.base_dir / sample["rel_path"]
        with Image.open(image_path) as im:
            image = im.convert("RGB")

        if self.transform is not None:
            tensor = self.transform(image)
        else:
            tensor = transforms.ToTensor()(image)

        label_idx = CLASS_TO_IDX[sample["mapped_grade"]]
        return tensor, label_idx


def build_transforms() -> tuple[transforms.Compose, transforms.Compose]:
    """Build data augmentation for training and deterministic normalization for eval."""
    imagenet_mean = [0.485, 0.456, 0.406]
    imagenet_std = [0.229, 0.224, 0.225]

    train_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=imagenet_mean, std=imagenet_std),
    ])

    eval_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=imagenet_mean, std=imagenet_std),
    ])

    return train_transform, eval_transform


def build_model() -> nn.Module:
    """Instantiate MobileNetV2 with frozen backbone and trained classification head."""
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)

    # Freeze feature extractor layers
    for param in model.features.parameters():
        param.requires_grad = False

    # Replace classifier with custom head
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.2),
        nn.Linear(in_features, NUM_CLASSES),
    )
    return model


def compute_metrics(y_true: list[int], y_pred: list[int]) -> dict[str, Any]:
    """Compute accuracy, per-class precision, recall, and macro-F1."""
    confusion = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=int)
    for t, p in zip(y_true, y_pred, strict=True):
        confusion[t, p] += 1

    total = len(y_true)
    accuracy = float(np.trace(confusion)) / total if total > 0 else 0.0

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

    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "per_class": {
            IDX_TO_CLASS[c]: {
                "precision": float(precisions[c]),
                "recall": float(recalls[c]),
                "f1": float(f1s[c]),
            }
            for c in range(NUM_CLASSES)
        },
        "confusion_matrix": confusion.tolist(),
    }


def evaluate(model: nn.Module, loader: DataLoader, criterion: nn.Module) -> tuple[float, dict[str, Any]]:
    """Evaluate model on a dataloader without gradients."""
    model.eval()
    total_loss = 0.0
    y_true: list[int] = []
    y_pred: list[int] = []

    with torch.no_grad():
        for inputs, targets in loader:
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            total_loss += loss.item() * inputs.size(0)

            preds = torch.argmax(outputs, dim=1).cpu().tolist()
            y_pred.extend(preds)
            y_true.extend(targets.cpu().tolist())

    avg_loss = total_loss / len(loader.dataset)
    metrics = compute_metrics(y_true, y_pred)
    return avg_loss, metrics


def train_and_export() -> dict[str, Any]:
    set_seed(RANDOM_SEED)

    logger.info("Loading dataset manifest from %s...", MANIFEST_PATH)
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    samples = manifest["samples"]
    train_samples = [s for s in samples if s["split"] == "train"]
    val_samples = [s for s in samples if s["split"] == "val"]
    test_samples = [s for s in samples if s["split"] == "test"]

    logger.info(
        "Split sizes: Train=%d, Val=%d, Test=%d (Total=%d)",
        len(train_samples), len(val_samples), len(test_samples), len(samples)
    )

    train_tf, eval_tf = build_transforms()

    train_ds = CropQualityDataset(train_samples, DATASET_DIR, transform=train_tf)
    val_ds = CropQualityDataset(val_samples, DATASET_DIR, transform=eval_tf)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    model = build_model()
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.classifier.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)

    best_val_macro_f1 = -1.0
    best_model_weights = None
    best_epoch = 0

    logger.info("Starting training loop (%d epochs, lr=%s)...", NUM_EPOCHS, LEARNING_RATE)

    for epoch in range(1, NUM_EPOCHS + 1):
        model.train()
        running_loss = 0.0
        train_y_true = []
        train_y_pred = []

        for inputs, targets in train_loader:
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            preds = torch.argmax(outputs, dim=1).cpu().tolist()
            train_y_pred.extend(preds)
            train_y_true.extend(targets.cpu().tolist())

        train_loss = running_loss / len(train_ds)
        train_metrics = compute_metrics(train_y_true, train_y_pred)

        val_loss, val_metrics = evaluate(model, val_loader, criterion)

        logger.info(
            "Epoch %2d/%2d - Train Loss: %.4f Acc: %.3f F1: %.3f | Val Loss: %.4f Acc: %.3f F1: %.3f",
            epoch, NUM_EPOCHS, train_loss, train_metrics["accuracy"], train_metrics["macro_f1"],
            val_loss, val_metrics["accuracy"], val_metrics["macro_f1"]
        )

        # Checkpoint selection strictly on Validation Macro F1
        if val_metrics["macro_f1"] > best_val_macro_f1:
            best_val_macro_f1 = val_metrics["macro_f1"]
            best_model_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            best_epoch = epoch

    logger.info("Best model selected at Epoch %d with Val Macro F1: %.4f", best_epoch, best_val_macro_f1)

    # Load best checkpoint
    model.load_state_dict(best_model_weights)
    model.eval()

    # Export to ONNX
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    logger.info("Exporting best model to ONNX: %s...", ONNX_EXPORT_PATH)
    dummy_input = torch.randn(1, 3, 224, 224, requires_grad=False)

    torch.onnx.export(
        model,
        dummy_input,
        str(ONNX_EXPORT_PATH),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"},
        },
    )

    # Validate ONNX graph integrity
    logger.info("Validating ONNX graph integrity with onnx.checker...")
    onnx_model = onnx.load(str(ONNX_EXPORT_PATH))
    onnx.checker.check_model(onnx_model)
    logger.info("ONNX graph successfully verified!")

    return {
        "best_epoch": best_epoch,
        "best_val_macro_f1": best_val_macro_f1,
        "onnx_export_path": str(ONNX_EXPORT_PATH),
        "onnx_size_bytes": os.path.getsize(ONNX_EXPORT_PATH),
    }


if __name__ == "__main__":
    train_and_export()
