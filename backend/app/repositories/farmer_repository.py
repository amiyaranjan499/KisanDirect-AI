from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    Crop,
    CropImage,
    CropListing,
    Farmer,
    Notification,
    Order,
    OrderItem,
    Review,
)


class FarmerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_profile(self, user_id: UUID) -> Farmer | None:
        result = await self.session.execute(select(Farmer).where(Farmer.user_id == user_id))
        return result.scalar_one_or_none()

    async def create_profile(self, user_id: UUID, values: dict) -> Farmer:
        farmer = Farmer(user_id=user_id, **values)
        self.session.add(farmer)
        await self.session.commit()
        await self.session.refresh(farmer)
        return farmer

    async def update_profile(self, farmer: Farmer, values: dict) -> Farmer:
        for key, value in values.items():
            setattr(farmer, key, value)
        await self.session.commit()
        await self.session.refresh(farmer)
        return farmer

    async def get_coordinates(self, table_name: str, record_id: UUID) -> tuple[float, float] | None:
        if table_name not in {"farmers", "crop_listings"}:
            raise ValueError("Unsupported location table")
        result = await self.session.execute(
            text(f"SELECT ST_Y(location::geometry), ST_X(location::geometry) FROM {table_name} WHERE id = :record_id"),
            {"record_id": record_id},
        )
        row = result.one_or_none()
        return (float(row[0]), float(row[1])) if row and row[0] is not None else None

    async def get_listing(self, listing_id: UUID, farmer_id: UUID) -> CropListing | None:
        result = await self.session.execute(
            select(CropListing)
            .where(CropListing.id == listing_id, CropListing.farmer_id == farmer_id)
            .options(selectinload(CropListing.crop), selectinload(CropListing.images))
        )
        return result.scalar_one_or_none()

    async def list_listings(self, farmer_id: UUID) -> list[CropListing]:
        result = await self.session.execute(
            select(CropListing)
            .where(CropListing.farmer_id == farmer_id)
            .order_by(CropListing.created_at.desc())
            .options(selectinload(CropListing.crop), selectinload(CropListing.images))
        )
        return list(result.scalars().unique().all())

    async def list_listings_for_dashboard(self, farmer_id: UUID) -> list[CropListing]:
        result = await self.session.execute(
            select(CropListing)
            .where(CropListing.farmer_id == farmer_id)
            .order_by(CropListing.created_at.desc())
            .options(
                selectinload(CropListing.crop),
                selectinload(CropListing.images),
                selectinload(CropListing.quality_predictions),
                selectinload(CropListing.price_predictions),
            )
        )
        return list(result.scalars().unique().all())

    async def list_orders_for_dashboard(self, farmer_user_id: UUID) -> list[Order]:
        result = await self.session.execute(
            select(Order)
            .join(Order.items)
            .join(OrderItem.listing)
            .join(CropListing.farmer)
            .where(Farmer.user_id == farmer_user_id)
            .distinct()
            .order_by(Order.created_at.desc())
            .options(
                selectinload(Order.consumer),
                selectinload(Order.payment),
                selectinload(Order.delivery),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer),
            )
        )
        return list(result.unique().scalars().all())

    async def count_unread_notifications(self, user_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(Notification.id)).where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
        return int(result.scalar_one() or 0)

    async def list_reviews_for_farmer(self, farmer_id: UUID) -> list[Review]:
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

    async def get_dashboard_review_summary(self, farmer_id: UUID) -> tuple[float | None, int]:
        result = await self.session.execute(
            select(
                func.avg(Review.rating).label("average_rating"),
                func.count(Review.id).label("review_count"),
            )
            .join(Review.listing)
            .where(CropListing.farmer_id == farmer_id)
        )
        row = result.one_or_none()
        if row is None or row.average_rating is None:
            return None, 0
        return float(row.average_rating), int(row.review_count or 0)

    async def get_or_create_crop(self, name: str, category: str | None) -> Crop:
        result = await self.session.execute(select(Crop).where(Crop.name == name))
        crop = result.scalar_one_or_none()
        if crop is None:
            crop = Crop(name=name, category=category)
            self.session.add(crop)
            await self.session.flush()
        elif category is not None and crop.category != category:
            crop.category = category
        return crop

    async def create_listing(self, farmer_id: UUID, values: dict) -> CropListing:
        crop = await self.get_or_create_crop(values.pop("crop_name"), values.pop("crop_category", None))
        listing = CropListing(farmer_id=farmer_id, crop=crop, **values)
        self.session.add(listing)
        await self.session.commit()
        await self.session.refresh(listing)
        await self.session.refresh(crop)
        return listing

    async def update_listing(self, listing: CropListing, values: dict) -> CropListing:
        if "crop_name" in values:
            listing.crop = await self.get_or_create_crop(values.pop("crop_name"), values.pop("crop_category", None))
        elif "crop_category" in values:
            listing.crop.category = values.pop("crop_category")
        for key, value in values.items():
            setattr(listing, key, value)
        await self.session.commit()
        await self.session.refresh(listing)
        return listing

    async def add_image(self, listing_id: UUID, storage_url: str, content_type: str) -> CropImage:
        image = CropImage(listing_id=listing_id, storage_url=storage_url, content_type=content_type)
        self.session.add(image)
        await self.session.commit()
        await self.session.refresh(image)
        return image
