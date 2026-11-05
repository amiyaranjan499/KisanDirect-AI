"""Inference engine for 10-Crop Species Classification using MobileNetV2."""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from ml.crop_classification.model_metadata import (
    CENTROID_SIMILARITY_THRESHOLD,
    CLASS_DISPLAY_NAMES,
    CLASS_TO_CATEGORY,
    CLASSES,
    CONFIDENCE_THRESHOLD,
    IDX_TO_CLASS,
    MARGIN_THRESHOLD,
    MODEL_NAME,
    MODEL_STATUS,
    MODEL_VERSION,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "model_artifacts" / "crop_classifier_mobilenet_v2.keras"
DEFAULT_CENTROIDS_PATH = Path(__file__).resolve().parent / "model_artifacts" / "class_centroids.npy"


@dataclass(frozen=True)
class CropClassificationResult:
    crop_name: str | None
    category: str | None
    source: str
    prediction_status: str
    confidence: float | None
    probabilities: dict[str, float]
    model_name: str
    model_version: str
    metadata: dict[str, Any]


class CropClassifierInference:
    """Inference engine using trained MobileNetV2 transfer learning model."""

    _cached_models: dict[Path, Any] = {}

    def __init__(self, model_path: Path | str | None = None, centroids_path: Path | str | None = None) -> None:
        self.model_path = Path(model_path) if model_path is not None else DEFAULT_MODEL_PATH
        self.centroids_path = Path(centroids_path) if centroids_path is not None else DEFAULT_CENTROIDS_PATH
        self.model = None
        self.feature_model = None
        self.centroids: np.ndarray | None = None
        self.init_error: str | None = None
        self._load_model()

    def _load_model(self) -> None:
        if not self.model_path.is_file():
            self.init_error = f"Model artifact not found at {self.model_path}"
            self.model = None
            return

        if self.centroids_path.is_file():
            try:
                self.centroids = np.load(str(self.centroids_path))
            except Exception as exc:
                logger.warning("Could not load class centroids: %s", exc)
                self.centroids = None

        if self.model_path in CropClassifierInference._cached_models:
            self.model = CropClassifierInference._cached_models[self.model_path]
            try:
                import keras
                self.feature_model = keras.Model(inputs=self.model.input, outputs=self.model.get_layer("fc_dense").output)
            except Exception:
                self.feature_model = None
            return

        try:
            os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
            import keras

            logger.info("Loading crop classifier artifact from %s", self.model_path)
            self.model = keras.models.load_model(str(self.model_path), compile=False)
            try:
                self.feature_model = keras.Model(inputs=self.model.input, outputs=self.model.get_layer("fc_dense").output)
            except Exception as f_err:
                logger.warning("Could not create feature model: %s", f_err)
                self.feature_model = None

            CropClassifierInference._cached_models[self.model_path] = self.model
            self.init_error = None
        except Exception as exc:
            logger.error("Failed to load crop classifier artifact: %s", exc)
            self.init_error = str(exc)
            self.model = None

    def predict(self, image_data: Image.Image | bytes | np.ndarray) -> CropClassificationResult:
        """Run crop species inference on a PIL image, bytes, or numpy array."""
        if self.model is None:
            return CropClassificationResult(
                crop_name=None,
                category=None,
                source="local",
                prediction_status="MODEL_UNAVAILABLE",
                confidence=None,
                probabilities={},
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                metadata={"reason": self.init_error or "Model artifact not loaded"},
            )

        try:
            # Handle input types
            if isinstance(image_data, bytes):
                pil_img = Image.open(io.BytesIO(image_data)).convert("RGB")
            elif isinstance(image_data, Image.Image):
                pil_img = image_data.convert("RGB")
            elif isinstance(image_data, np.ndarray):
                pil_img = Image.fromarray(image_data).convert("RGB")
            else:
                raise ValueError(f"Unsupported image input type: {type(image_data)}")

            # Resize to MobileNetV2 input size (224, 224)
            resized = pil_img.resize((224, 224), Image.Resampling.BILINEAR)
            arr = np.array(resized, dtype=np.float32)

            # MobileNetV2 preprocessing: scale pixels to [-1, 1]
            from keras.applications.mobilenet_v2 import preprocess_input

            batch = np.expand_dims(arr, axis=0)
            preprocessed = preprocess_input(batch)

            # Predict
            probs = self.model.predict(preprocessed, verbose=0)[0]
            sorted_probs = np.sort(probs)[::-1]
            top_idx = int(np.argmax(probs))
            top_prob = float(probs[top_idx])
            second_prob = float(sorted_probs[1]) if len(sorted_probs) > 1 else 0.0
            prob_margin = top_prob - second_prob
            raw_crop = IDX_TO_CLASS[top_idx]
            display_name = CLASS_DISPLAY_NAMES.get(raw_crop, raw_crop.capitalize())
            category = CLASS_TO_CATEGORY.get(raw_crop, "Vegetables")

            all_probs = {IDX_TO_CLASS[i]: round(float(probs[i]), 4) for i in range(len(CLASSES))}

            # Centroid similarity & OOD evaluation
            top_sim_class = None
            top_sim_val = 0.0
            is_consistent = True

            if self.feature_model is not None and self.centroids is not None:
                feat = self.feature_model.predict(preprocessed, verbose=0)[0]
                norm = float(np.linalg.norm(feat))
                if norm > 0:
                    feat = feat / norm
                    sims = np.dot(self.centroids, feat)
                    top_sim_idx = int(np.argmax(sims))
                    top_sim_class = CLASSES[top_sim_idx]
                    top_sim_val = float(sims[top_sim_idx])
                    is_consistent = (top_idx == top_sim_idx)

            # Dual-gate reliability check
            is_reliable = False
            if top_prob >= 0.84:
                if is_consistent and top_sim_val >= 0.80:
                    is_reliable = True
                elif top_prob >= 0.95:
                    is_reliable = True
            elif top_prob >= CONFIDENCE_THRESHOLD and prob_margin >= MARGIN_THRESHOLD:
                if is_consistent and top_sim_val >= 0.82:
                    is_reliable = True

            if not is_reliable:
                return CropClassificationResult(
                    crop_name=None,
                    category=None,
                    source="local",
                    confidence=round(top_prob, 4),
                    probabilities=all_probs,
                    model_name=MODEL_NAME,
                    model_version=MODEL_VERSION,
                    prediction_status="UNKNOWN_CROP",
                    metadata={
                        "reason": f"Crop prediction confidence ({top_prob:.2%}) or representation consistency is below reliable identification threshold.",
                        "top_candidate": display_name,
                        "confidence": round(top_prob, 4),
                        "centroid_similarity": round(top_sim_val, 4),
                        "consistent": is_consistent,
                    },
                )

            return CropClassificationResult(
                crop_name=display_name,
                category=category,
                source="local",
                confidence=round(top_prob, 4),
                probabilities=all_probs,
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="COMPLETED",
                metadata={
                    "supported_crops": list(CLASSES),
                    "reason": f"Identified as {display_name} ({category}) with local model.",
                    "top_candidate": display_name,
                },
            )

        except Exception as exc:
            logger.error("Crop classification inference failure: %s", exc)
            return CropClassificationResult(
                crop_name=None,
                category=None,
                source="local",
                confidence=None,
                probabilities={},
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="FAILED",
                metadata={"reason": f"Inference error: {exc}"},
            )
