from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import AIQualityPrediction, CropImage, CropListing, Farmer


class QualityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_owned_image(self, image_id: UUID, user_id: UUID) -> CropImage | None:
        result = await self.session.execute(
            select(CropImage)
            .join(CropImage.listing)
            .join(CropListing.farmer)
            .where(CropImage.id == image_id, Farmer.user_id == user_id)
            .options(selectinload(CropImage.listing))
        )
        return result.scalar_one_or_none()

    async def create_prediction(self, values: dict) -> AIQualityPrediction:
        prediction = AIQualityPrediction(**values)
        self.session.add(prediction)
        await self.session.commit()
        await self.session.refresh(prediction)
        return prediction

    async def get_prediction(self, prediction_id: UUID, user_id: UUID) -> AIQualityPrediction | None:
        result = await self.session.execute(
            select(AIQualityPrediction)
            .join(AIQualityPrediction.listing)
            .join(CropListing.farmer)
            .where(AIQualityPrediction.id == prediction_id, Farmer.user_id == user_id)
        )
        return result.scalar_one_or_none()
