from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from ml.price_prediction.model_metadata import ARCHITECTURE, MODEL_NAME, MODEL_STATUS, MODEL_VERSION


@dataclass(frozen=True)
class PricePrediction:
    predicted_price: Decimal | None
    currency: str
    unit: str | None
    model_name: str
    model_version: str
    prediction_status: str
    confidence: float | None
    metadata: dict[str, Any]


class FairPriceInference:
    """Inference boundary for a future trained RandomForestRegressor artifact."""

    def predict(self, features: dict[str, Any]) -> PricePrediction:
        del features
        return PricePrediction(
            predicted_price=None,
            currency="INR",
            unit=None,
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            prediction_status=MODEL_STATUS,
            confidence=None,
            metadata={
                "architecture": ARCHITECTURE,
                "reason": "No trained and evaluated price model artifact is configured",
            },
        )
