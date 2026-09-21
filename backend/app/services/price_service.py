from uuid import UUID

from backend.app.repositories.price_repository import PriceRepository
from backend.app.schemas.price import PricePredictionQuery, PricePredictionResponse
from ml.price_prediction.feature_engineering import build_price_features
from ml.price_prediction.inference import FairPriceInference


class PriceService:
    def __init__(self, repository: PriceRepository, inference: FairPriceInference | None = None) -> None:
        self.repository = repository
        self.inference = inference or FairPriceInference()

    async def predict(
        self,
        user_id: UUID,
        listing_id: UUID,
        query: PricePredictionQuery,
    ) -> PricePredictionResponse:
        listing = await self.repository.get_owned_listing(listing_id, user_id)
        if listing is None:
            raise LookupError("Crop listing not found")
        features = build_price_features(listing, query.quality_grade)
        result = self.inference.predict(features.as_dict())
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
                "input_features": features.as_dict(),
                "result_metadata": result.metadata,
            }
        )
        return PricePredictionResponse.model_validate(prediction)

    async def get_prediction(self, user_id: UUID, prediction_id: UUID) -> PricePredictionResponse:
        prediction = await self.repository.get_prediction(prediction_id, user_id)
        if prediction is None:
            raise LookupError("Price prediction not found")
        return PricePredictionResponse.model_validate(prediction)
