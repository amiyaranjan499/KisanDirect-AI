from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from ml.crop_quality.model_metadata import (
    IDX_TO_CLASS,
    MODEL_NAME,
    MODEL_STATUS,
    MODEL_VERSION,
    SUPPORTED_CLASSES,
    SUPPORTED_CROPS,
)
from ml.crop_quality.preprocessing import CropQualityPreprocessor

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "model_artifacts" / "crop_quality_mobilenet_v2.onnx"


@dataclass(frozen=True)
class QualityPrediction:
    quality_label: str | None
    confidence: float | None
    model_name: str
    model_version: str
    prediction_status: str
    metadata: dict[str, Any]


class CropQualityInference:
    """Inference engine using ONNX Runtime CPU for crop visual quality classification."""

    _cached_sessions: dict[Path, Any] = {}

    def __init__(self, model_path: Path | str | None = None) -> None:
        self.model_path = Path(model_path) if model_path is not None else DEFAULT_MODEL_PATH
        self.session = None
        self.init_error: str | None = None
        self._load_session()

    def _load_session(self) -> None:
        if not self.model_path.is_file():
            self.init_error = f"Model artifact not found at {self.model_path}"
            self.session = None
            return

        if self.model_path in CropQualityInference._cached_sessions:
            self.session = CropQualityInference._cached_sessions[self.model_path]
            return

        try:
            import onnxruntime as ort

            # Use CPU execution provider deterministically
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            opts.inter_op_num_threads = 1
            session = ort.InferenceSession(
                str(self.model_path),
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            CropQualityInference._cached_sessions[self.model_path] = session
            self.session = session
            self.init_error = None
        except Exception as exc:
            self.session = None
            self.init_error = f"Failed to initialize ONNX Runtime session: {exc}"

    @staticmethod
    def is_supported_crop(crop_name: str | None) -> bool:
        """Check if the provided crop name matches supported produce types."""
        if not crop_name:
            return False
        normalized = crop_name.strip().lower()
        return any(supported in normalized for supported in SUPPORTED_CROPS)

    def predict(self, image: Any, crop_name: str | None = None) -> QualityPrediction:
        """Run classification on preprocessed input or return clear status fallback."""
        # 1. Guard unsupported crop types first — an unsupported crop should be
        #    rejected regardless of whether the model artifact is available.
        if not self.is_supported_crop(crop_name):
            return QualityPrediction(
                quality_label=None,
                confidence=None,
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="UNSUPPORTED_CROP",
                metadata={
                    "supported_classes": list(SUPPORTED_CLASSES),
                    "supported_crops": list(SUPPORTED_CROPS),
                    "crop_name": crop_name,
                    "reason": (
                        f"Crop '{crop_name}' is not supported by the crop quality model. "
                        f"Supported crops: {', '.join(SUPPORTED_CROPS)}."
                    ),
                },
            )

        # 2. Fallback if model artifact is unavailable or session failed to initialize
        if self.session is None:
            return QualityPrediction(
                quality_label=None,
                confidence=None,
                model_name=MODEL_NAME,
                model_version="unavailable",
                prediction_status=MODEL_STATUS,
                metadata={
                    "supported_classes": list(SUPPORTED_CLASSES),
                    "supported_crops": list(SUPPORTED_CROPS),
                    "reason": self.init_error or "Model artifact is unavailable",
                },
            )

        # 3. Format input into expected NCHW float32 tensor
        try:
            if isinstance(image, np.ndarray):
                tensor = image.astype(np.float32)
                if tensor.ndim == 3:
                    tensor = np.expand_dims(tensor, axis=0)
            elif isinstance(image, Image.Image):
                tensor = CropQualityPreprocessor().to_normalized_tensor(image)
            elif isinstance(image, (bytes, bytearray)):
                tensor = CropQualityPreprocessor().preprocess(image)
            else:
                raise ValueError(f"Unsupported image type: {type(image)}")

            input_name = self.session.get_inputs()[0].name
            output_name = self.session.get_outputs()[0].name
            outputs = self.session.run([output_name], {input_name: tensor})
            logits = outputs[0][0]

            # Numerically stable softmax
            exp_logits = np.exp(logits - np.max(logits))
            probs = exp_logits / np.sum(exp_logits)
            pred_idx = int(np.argmax(probs))

            quality_label = IDX_TO_CLASS[pred_idx]
            confidence = round(float(probs[pred_idx]), 4)
            class_probs = {
                IDX_TO_CLASS[i]: round(float(probs[i]), 4)
                for i in range(len(probs))
            }

            grade_map = {"Good": "Grade A", "Average": "Grade B", "Poor": "Grade C"}
            desc_map = {
                "Good": "Produce displays vibrant color, optimal firmness, and uniform shape with negligible blemishes. Meets Grade A premium market specifications.",
                "Average": "Produce shows moderate visual appeal with minor cosmetic variations or slight surface imperfections. Meets Grade B standard market specifications.",
                "Poor": "Produce exhibits noticeable surface blemishes, discoloration, or bruising. Commercial grade suitable for processing or discount sorting.",
            }
            grade = grade_map.get(quality_label, "Grade A")
            desc = desc_map.get(quality_label, "")

            return QualityPrediction(
                quality_label=quality_label,
                confidence=confidence,
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="COMPLETED",
                metadata={
                    "supported_classes": list(SUPPORTED_CLASSES),
                    "supported_crops": list(SUPPORTED_CROPS),
                    "crop_name": crop_name,
                    "class_probabilities": class_probs,
                    "grade": grade,
                    "quality_description": desc,
                    "reason": f"Classified as {grade} ({quality_label}) with {round(confidence * 100, 1)}% model confidence. {desc}",
                    "architecture": "mobilenet_v2",
                },
            )
        except Exception as exc:
            return QualityPrediction(
                quality_label=None,
                confidence=None,
                model_name=MODEL_NAME,
                model_version="unavailable",
                prediction_status=MODEL_STATUS,
                metadata={
                    "supported_classes": list(SUPPORTED_CLASSES),
                    "supported_crops": list(SUPPORTED_CROPS),
                    "crop_name": crop_name,
                    "reason": f"Inference execution failed: {exc}",
                },
            )
