from __future__ import annotations

import datetime
import logging
import threading
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.price_prediction.model_metadata import (
    ARCHITECTURE,
    MODEL_NAME,
    MODEL_STATUS,
    MODEL_VERSION,
    SUPPORTED_CROPS,
    SUPPORTED_GRADES,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "model_artifacts" / "fair_price_model.joblib"


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
    """Inference engine using trained RandomForestRegressor pipeline for fair produce pricing."""

    _cached_pipeline = None
    _lock = threading.Lock()

    def __init__(self, model_path: Path | str | None = None) -> None:
        self.model_path = Path(model_path) if model_path is not None else DEFAULT_MODEL_PATH
        self.pipeline = None
        self.init_error: str | None = None
        self._load_pipeline()

    def _load_pipeline(self) -> None:
        if FairPriceInference._cached_pipeline is not None:
            self.pipeline = FairPriceInference._cached_pipeline
            return

        with FairPriceInference._lock:
            if FairPriceInference._cached_pipeline is not None:
                self.pipeline = FairPriceInference._cached_pipeline
                return

            if not self.model_path.is_file():
                self.init_error = f"Model artifact not found at {self.model_path}"
                return

            try:
                self.pipeline = joblib.load(self.model_path)
                FairPriceInference._cached_pipeline = self.pipeline
                self.init_error = None
            except Exception as exc:
                logger.error("Failed loading fair price pipeline artifact: %s", exc)
                self.init_error = str(exc)
                self.pipeline = None

    def predict(self, features: dict[str, Any]) -> PricePrediction:
        if self.pipeline is None:
            return PricePrediction(
                predicted_price=None,
                currency="INR",
                unit=features.get("unit", "kg"),
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="MODEL_UNAVAILABLE",
                confidence=None,
                metadata={
                    "architecture": ARCHITECTURE,
                    "reason": self.init_error or "Trained price model artifact is not configured",
                },
            )

        raw_crop = str(features.get("crop_name") or "").strip().lower()
        if not raw_crop or "unavailable" in raw_crop or "not detected" in raw_crop:
            return PricePrediction(
                predicted_price=None,
                currency="INR",
                unit=features.get("unit", "kg"),
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="MODEL_UNAVAILABLE",
                confidence=None,
                metadata={
                    "architecture": ARCHITECTURE,
                    "reason": "Crop name is missing or crop identification is unavailable.",
                },
            )

        # Normalize crop name
        alias_map = {
            "potatoes": "potato",
            "potao": "potato",
            "tomatoes": "tomato",
            "onions": "onion",
            "apples": "apple",
            "mangoes": "mango",
            "papayas": "papaya",
            "bananas": "banana",
            "carrots": "carrot",
            "oranges": "orange",
            "brinjals": "brinjal",
            "eggplant": "brinjal",
            "eggplants": "brinjal",
            "cabbages": "cabbage",
            "dragonfruit": "dragon fruit",
        }
        norm_crop = alias_map.get(raw_crop, raw_crop)

        # Map to pipeline recognized crop
        if norm_crop not in SUPPORTED_CROPS:
            return PricePrediction(
                predicted_price=None,
                currency="INR",
                unit=features.get("unit", "kg"),
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="MODEL_UNAVAILABLE",
                confidence=None,
                metadata={
                    "architecture": ARCHITECTURE,
                    "reason": f"Crop '{raw_crop}' is not supported by the trained fair price model.",
                },
            )
        pipeline_crop = norm_crop

        # Normalize quality grade
        raw_grade = str(features.get("quality_grade") or "").strip()
        grade_map = {
            "Good": "Grade A",
            "Average": "Grade B",
            "Poor": "Grade C",
            "Grade A": "Grade A",
            "Grade B": "Grade B",
            "Grade C": "Grade C",
        }
        quality_grade = grade_map.get(raw_grade, "Grade B")

        # Resolve quantity
        try:
            quantity = float(features.get("quantity", 10.0))
            if quantity <= 0:
                quantity = 10.0
        except (ValueError, TypeError):
            quantity = 10.0

        # Resolve harvest month
        month = datetime.datetime.now().month
        harvest_date_str = features.get("harvest_date")
        if harvest_date_str:
            try:
                dt = datetime.datetime.fromisoformat(harvest_date_str.replace("Z", "+00:00"))
                month = dt.month
            except (ValueError, TypeError):
                pass

        # Resolve state and district
        state = str(features.get("state") or "Maharashtra").strip()
        district = str(features.get("district") or "Pune").strip()

        # Resolve benchmark market price
        market_price = features.get("market_price")
        if market_price is None or float(market_price) <= 0:
            from backend.app.services.market_price_service import MarketPriceService
            mkt_svc = MarketPriceService()
            mkt_res = mkt_svc.get_market_price(norm_crop, state=state, district=district)
            if mkt_res.market_price:
                market_price = float(mkt_res.market_price)
            else:
                market_price = 25.0
        else:
            market_price = float(market_price)

        try:
            df_input = pd.DataFrame(
                [
                    {
                        "crop_name": pipeline_crop if pipeline_crop in SUPPORTED_CROPS else "potato",
                        "quality_grade": quality_grade,
                        "state": state,
                        "district": district,
                        "market_price": market_price,
                        "quantity": quantity,
                        "harvest_month": month,
                    }
                ]
            )

            predicted_val = float(self.pipeline.predict(df_input)[0])

            # Calculate prediction confidence across trees
            regressor = self.pipeline.named_steps.get("regressor")
            preprocessor = self.pipeline.named_steps.get("preprocessor")
            if regressor and preprocessor and hasattr(regressor, "estimators_"):
                X_trans = preprocessor.transform(df_input)
                # If sparse matrix, convert to dense if needed
                if hasattr(X_trans, "toarray"):
                    X_trans = X_trans.toarray()
                tree_preds = np.array([tree.predict(X_trans)[0] for tree in regressor.estimators_])
                std = float(np.std(tree_preds))
                mean = float(np.mean(tree_preds))
                cv = std / max(mean, 1.0)
                confidence = float(np.clip(1.0 - cv, 0.75, 0.98))
            else:
                confidence = 0.90

            rounded_price = Decimal(str(round(max(predicted_val, 1.0), 2)))

            return PricePrediction(
                predicted_price=rounded_price,
                currency="INR",
                unit=features.get("unit", "kg"),
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="COMPLETED",
                confidence=round(confidence, 4),
                metadata={
                    "architecture": ARCHITECTURE,
                    "market_price_benchmark": market_price,
                    "quality_grade": quality_grade,
                    "quantity_kg": quantity,
                    "harvest_month": month,
                    "state": state,
                    "district": district,
                    "reason": f"Predicted fair price of ₹{rounded_price}/kg based on {quality_grade} quality, APMC benchmark ₹{market_price:.2f}, and volume of {quantity:.0f} kg.",
                },
            )

        except Exception as exc:
            logger.error("Price prediction inference failed: %s", exc)
            return PricePrediction(
                predicted_price=None,
                currency="INR",
                unit=features.get("unit", "kg"),
                model_name=MODEL_NAME,
                model_version=MODEL_VERSION,
                prediction_status="FAILED",
                confidence=None,
                metadata={"reason": f"Inference execution error: {exc}"},
            )
