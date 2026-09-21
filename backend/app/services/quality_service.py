from pathlib import Path
from uuid import UUID

from backend.app.repositories.quality_repository import QualityRepository
from backend.app.schemas.quality import QualityPredictionResponse
from ml.crop_quality.inference import CropQualityInference
from ml.crop_quality.preprocessing import CropQualityPreprocessor, InvalidCropImageError


class QualityService:
    def __init__(
        self,
        repository: QualityRepository,
        upload_root: Path,
        preprocessor: CropQualityPreprocessor | None = None,
        inference: CropQualityInference | None = None,
    ) -> None:
        self.repository = repository
        self.upload_root = upload_root
        self.preprocessor = preprocessor or CropQualityPreprocessor()
        self.inference = inference or CropQualityInference()

    async def predict(self, user_id: UUID, image_id: UUID) -> QualityPredictionResponse:
        image = await self.repository.get_owned_image(image_id, user_id)
        if image is None:
            raise LookupError("Crop image not found")
        source = self.upload_root / image.storage_url
        try:
            processed = self.preprocessor.preprocess(source.read_bytes())
        except (OSError, InvalidCropImageError) as exc:
            raise ValueError("Stored crop image is invalid or unavailable") from exc
        result = self.inference.predict(processed)
        prediction = await self.repository.create_prediction(
            {
                "listing_id": image.listing_id,
                "image_id": image.id,
                "quality_label": result.quality_label,
                "model_name": result.model_name,
                "model_version": result.model_version,
                "prediction_status": result.prediction_status,
                "confidence": result.confidence,
                "result_metadata": result.metadata,
            }
        )
        return QualityPredictionResponse.model_validate(prediction)

    async def get_prediction(self, user_id: UUID, prediction_id: UUID) -> QualityPredictionResponse:
        prediction = await self.repository.get_prediction(prediction_id, user_id)
        if prediction is None:
            raise LookupError("Quality prediction not found")
        return QualityPredictionResponse.model_validate(prediction)
