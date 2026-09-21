from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import CropListing, Order, OrderItem, Review


class ReviewsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_order_for_consumer(self, order_id: UUID, consumer_id: UUID) -> Order | None:
        result = await self.session.execute(
            select(Order)
            .where(Order.id == order_id, Order.consumer_id == consumer_id)
            .options(
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer),
            )
        )
        return result.scalar_one_or_none()

    async def get_order_item_for_listing(self, order_id: UUID, listing_id: UUID) -> OrderItem | None:
        result = await self.session.execute(
            select(OrderItem)
            .where(OrderItem.order_id == order_id, OrderItem.listing_id == listing_id)
            .options(
                selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(OrderItem.listing).selectinload(CropListing.farmer),
            )
        )
        return result.scalar_one_or_none()

    async def review_exists(self, consumer_id: UUID, order_id: UUID, listing_id: UUID) -> bool:
        result = await self.session.execute(
            select(Review.id).where(Review.consumer_id == consumer_id, Review.order_id == order_id, Review.listing_id == listing_id)
        )
        return result.scalar_one_or_none() is not None

    async def create(self, review: Review) -> Review:
        self.session.add(review)
        await self.session.commit()
        await self.session.refresh(review)
        return review

    async def update(self, review: Review) -> Review:
        await self.session.commit()
        await self.session.refresh(review)
        return review

    async def get_review(self, review_id: UUID) -> Review | None:
        result = await self.session.execute(
            select(Review)
            .where(Review.id == review_id)
            .options(
                selectinload(Review.consumer),
                selectinload(Review.listing).selectinload(CropListing.crop),
                selectinload(Review.listing).selectinload(CropListing.farmer),
                selectinload(Review.order),
            )
        )
        return result.scalar_one_or_none()

    async def get_review_for_consumer(self, review_id: UUID, consumer_id: UUID) -> Review | None:
        result = await self.session.execute(
            select(Review)
            .where(Review.id == review_id, Review.consumer_id == consumer_id)
            .options(
                selectinload(Review.consumer),
                selectinload(Review.listing).selectinload(CropListing.crop),
                selectinload(Review.listing).selectinload(CropListing.farmer),
                selectinload(Review.order),
            )
        )
        return result.scalar_one_or_none()

    async def list_for_listing(self, listing_id: UUID) -> list[Review]:
        result = await self.session.execute(
            select(Review)
            .where(Review.listing_id == listing_id)
            .order_by(Review.created_at.desc())
            .options(
                selectinload(Review.consumer),
                selectinload(Review.listing).selectinload(CropListing.crop),
                selectinload(Review.listing).selectinload(CropListing.farmer),
                selectinload(Review.order),
            )
        )
        return list(result.scalars().all())

    async def list_for_farmer(self, farmer_id: UUID) -> list[Review]:
        result = await self.session.execute(
            select(Review)
            .join(Review.listing)
            .where(CropListing.farmer_id == farmer_id)
            .order_by(Review.created_at.desc())
            .options(
                selectinload(Review.consumer),
                selectinload(Review.listing).selectinload(CropListing.crop),
                selectinload(Review.listing).selectinload(CropListing.farmer),
                selectinload(Review.order),
            )
        )
        return list(result.scalars().all())

    async def get_rating_summary(self, farmer_id: UUID) -> tuple[float | None, int]:
        summary = await self.session.execute(
            select(
                func.avg(Review.rating).label("average_rating"),
                func.count(Review.id).label("review_count"),
            )
            .join(Review.listing)
            .where(CropListing.farmer_id == farmer_id)
        )
        row = summary.one_or_none()
        if row is None:
            return None, 0
        return float(row.average_rating) if row.average_rating is not None else None, int(row.review_count or 0)

    async def delete(self, review: Review) -> None:
        await self.session.delete(review)
        await self.session.commit()
