from decimal import Decimal
from uuid import UUID

from backend.app.repositories.price_repository import PriceRepository
from backend.app.schemas.price import (
    PriceEstimateRequest,
    PriceEstimateResponse,
    PricePredictionQuery,
    PricePredictionResponse,
)
from ml.price_prediction.feature_engineering import build_price_features
from ml.price_prediction.inference import FairPriceInference


class PriceService:
    def __init__(self, repository: PriceRepository | None = None, inference: FairPriceInference | None = None) -> None:
        self.repository = repository
        self.inference = inference or FairPriceInference()

    async def predict(
        self,
        user_id: UUID,
        listing_id: UUID,
        query: PricePredictionQuery,
    ) -> PricePredictionResponse:
        if self.repository is None:
            raise RuntimeError("Repository is required for listing-bound price prediction")
        listing = await self.repository.get_owned_listing(listing_id, user_id)
        if listing is None:
            raise LookupError("Crop listing not found")
        features = build_price_features(listing, query.quality_grade)
        features_dict = features.as_dict()
        if query.crop_name:
            features_dict["crop_name"] = query.crop_name
        if query.quantity is not None and query.quantity > 0:
            features_dict["quantity"] = str(query.quantity)
        if query.market_price is not None and query.market_price > 0:
            features_dict["market_price"] = str(query.market_price)
        if query.state:
            features_dict["state"] = query.state
        if query.district:
            features_dict["district"] = query.district
        if query.harvest_date:
            features_dict["harvest_date"] = query.harvest_date

        result = self.inference.predict(features_dict)
        prediction = await self.repository.create_prediction(
            {
                "listing_id": listing.id,
                "predicted_price": result.predicted_price,
                "currency": result.currency,
                "unit": result.unit or listing.unit,
                "model_name": result.model_name,
                "model_version": result.model_version,
                "prediction_status": result.prediction_status,
                "confidence": result.confidence,
                "input_features": features_dict,
                "result_metadata": result.metadata,
            }
        )
        return PricePredictionResponse.model_validate(prediction)

    def estimate(self, request: PriceEstimateRequest) -> PriceEstimateResponse:
        features_dict = {
            "crop_name": request.crop_name,
            "quality_grade": request.quality_grade,
            "quantity": str(request.quantity),
            "unit": request.unit,
            "market_price": str(request.market_price) if request.market_price is not None else None,
            "state": request.state,
            "district": request.district,
            "harvest_date": request.harvest_date,
        }
        result = self.inference.predict(features_dict)
        total_val = None
        if result.predicted_price is not None:
            total_val = Decimal(str(round(result.predicted_price * request.quantity, 2)))

        return PriceEstimateResponse(
            crop_name=request.crop_name,
            predicted_price=result.predicted_price,
            currency=result.currency,
            unit=request.unit,
            model_name=result.model_name,
            model_version=result.model_version,
            prediction_status=result.prediction_status,
            confidence=result.confidence,
            total_estimated_value=total_val,
            result_metadata=result.metadata,
        )

    async def get_prediction(self, user_id: UUID, prediction_id: UUID) -> PricePredictionResponse:
        if self.repository is None:
            raise RuntimeError("Repository is required for prediction retrieval")
        prediction = await self.repository.get_prediction(prediction_id, user_id)
        if prediction is None:
            raise LookupError("Price prediction not found")
        return PricePredictionResponse.model_validate(prediction)
