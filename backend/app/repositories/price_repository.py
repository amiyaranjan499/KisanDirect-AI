from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import AIPricePrediction, CropListing, Farmer


class PriceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_owned_listing(self, listing_id: UUID, user_id: UUID) -> CropListing | None:
        result = await self.session.execute(
            select(CropListing)
            .join(CropListing.farmer)
            .where(CropListing.id == listing_id, Farmer.user_id == user_id)
            .options(selectinload(CropListing.crop), selectinload(CropListing.farmer))
        )
        return result.scalar_one_or_none()

    async def get_prediction(self, prediction_id: UUID, user_id: UUID) -> AIPricePrediction | None:
        result = await self.session.execute(
            select(AIPricePrediction)
            .join(AIPricePrediction.listing)
            .join(CropListing.farmer)
            .where(AIPricePrediction.id == prediction_id, Farmer.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_prediction(self, values: dict) -> AIPricePrediction:
        prediction = AIPricePrediction(**values)
        self.session.add(prediction)
        await self.session.commit()
        await self.session.refresh(prediction)
        return prediction
