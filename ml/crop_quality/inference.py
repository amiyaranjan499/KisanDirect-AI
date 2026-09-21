from dataclasses import dataclass
from typing import Any

from ml.crop_quality.model_metadata import MODEL_NAME, MODEL_STATUS, MODEL_VERSION, SUPPORTED_CLASSES


@dataclass(frozen=True)
class QualityPrediction:
    quality_label: str | None
    confidence: float | None
    model_name: str
    model_version: str
    prediction_status: str
    metadata: dict[str, Any]


class CropQualityInference:
    """Inference boundary for a future trained CNN or transfer-learning artifact."""

    def predict(self, image: Any) -> QualityPrediction:
        del image
        return QualityPrediction(
            quality_label=None,
            confidence=None,
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            prediction_status=MODEL_STATUS,
            metadata={
                "supported_classes": list(SUPPORTED_CLASSES),
                "reason": "No trained crop-quality model artifact is configured",
            },
        )
