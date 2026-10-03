from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Notification,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    Review,
    User,
    UserRole,
)


class AdminRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def count_users(self) -> int:
        result = await self.session.execute(select(func.count(User.id)))
        return int(result.scalar_one() or 0)

    async def count_active_users(self) -> int:
        result = await self.session.execute(select(func.count(User.id)).where(User.is_active.is_(True)))
        return int(result.scalar_one() or 0)

    async def count_users_by_role(self, role: UserRole) -> int:
        result = await self.session.execute(select(func.count(User.id)).where(User.role == role))
        return int(result.scalar_one() or 0)

    async def count_listings(self) -> int:
        result = await self.session.execute(select(func.count(CropListing.id)))
        return int(result.scalar_one() or 0)

    async def count_listings_by_status(self, status: AvailabilityStatus) -> int:
        result = await self.session.execute(
            select(func.count(CropListing.id)).where(CropListing.availability_status == status)
        )
        return int(result.scalar_one() or 0)

    async def count_orders(self) -> int:
        result = await self.session.execute(select(func.count(Order.id)))
        return int(result.scalar_one() or 0)

    async def count_orders_by_status(self, status: OrderStatus) -> int:
        result = await self.session.execute(select(func.count(Order.id)).where(Order.status == status))
        return int(result.scalar_one() or 0)

    async def count_users_in_range(self, start: datetime, end: datetime) -> int:
        result = await self.session.execute(
            select(func.count(User.id)).where(User.created_at >= start, User.created_at < end)
        )
        return int(result.scalar_one() or 0)

    async def count_active_users_in_range(self, start: datetime, end: datetime) -> int:
        result = await self.session.execute(
            select(func.count(User.id)).where(User.created_at >= start, User.created_at < end, User.is_active.is_(True))
        )
        return int(result.scalar_one() or 0)

    async def list_orders_for_range(self, start: datetime, end: datetime) -> list[Order]:
        result = await self.session.execute(
            select(Order)
            .options(
                selectinload(Order.consumer).selectinload(Consumer.user),
                selectinload(Order.payment),
                selectinload(Order.delivery),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
            )
            .where(Order.created_at >= start, Order.created_at < end)
            .order_by(Order.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def total_payment_volume(self) -> Decimal:
        result = await self.session.execute(select(func.coalesce(func.sum(Order.total_amount), Decimal("0.00"))))
        value = result.scalar_one() or Decimal("0.00")
        return value.quantize(Decimal("0.01"))

    async def count_reviews(self) -> int:
        result = await self.session.execute(select(func.count(Review.id)))
        return int(result.scalar_one() or 0)

    async def count_notifications(self) -> int:
        result = await self.session.execute(select(func.count(Notification.id)))
        return int(result.scalar_one() or 0)

    async def count_unread_notifications(self) -> int:
        result = await self.session.execute(
            select(func.count(Notification.id)).where(Notification.is_read.is_(False))
        )
        return int(result.scalar_one() or 0)

    async def count_orders_for_farmer(self, farmer_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(func.distinct(Order.id)))
            .join(Order.items)
            .join(OrderItem.listing)
            .join(CropListing.farmer)
            .where(CropListing.farmer_id == farmer_id)
        )
        return int(result.scalar_one() or 0)

    async def total_sales_for_farmer(self, farmer_id: UUID) -> Decimal:
        result = await self.session.execute(
            select(func.coalesce(func.sum(OrderItem.subtotal), Decimal("0.00")))
            .join(OrderItem.order)
            .join(OrderItem.listing)
            .where(CropListing.farmer_id == farmer_id)
        )
        value = result.scalar_one() or Decimal("0.00")
        return value.quantize(Decimal("0.01"))

    async def count_orders_for_consumer(self, consumer_id: UUID) -> int:
        result = await self.session.execute(select(func.count(Order.id)).where(Order.consumer_id == consumer_id))
        return int(result.scalar_one() or 0)

    async def total_spend_for_consumer(self, consumer_id: UUID) -> Decimal:
        result = await self.session.execute(
            select(func.coalesce(func.sum(Order.total_amount), Decimal("0.00"))).where(Order.consumer_id == consumer_id)
        )
        value = result.scalar_one() or Decimal("0.00")
        return value.quantize(Decimal("0.01"))

    async def count_reviews_for_consumer(self, consumer_id: UUID) -> int:
        result = await self.session.execute(select(func.count(Review.id)).where(Review.consumer_id == consumer_id))
        return int(result.scalar_one() or 0)

    async def list_farmers(self) -> list[Farmer]:
        result = await self.session.execute(
            select(Farmer)
            .options(
                selectinload(Farmer.user),
                selectinload(Farmer.listings).selectinload(CropListing.crop),
            )
            .order_by(Farmer.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_consumers(self) -> list[Consumer]:
        result = await self.session.execute(
            select(Consumer)
            .options(
                selectinload(Consumer.user),
            )
            .order_by(Consumer.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_listings(self) -> list[CropListing]:
        result = await self.session.execute(
            select(CropListing)
            .options(
                selectinload(CropListing.crop),
                selectinload(CropListing.farmer).selectinload(Farmer.user),
                selectinload(CropListing.quality_predictions),
                selectinload(CropListing.price_predictions),
            )
            .order_by(CropListing.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_orders(self) -> list[Order]:
        result = await self.session.execute(
            select(Order)
            .options(
                selectinload(Order.consumer).selectinload(Consumer.user),
                selectinload(Order.payment),
                selectinload(Order.delivery),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer).selectinload(Farmer.user),
            )
            .order_by(Order.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_payments(self) -> list[Payment]:
        result = await self.session.execute(
            select(Payment)
            .options(
                selectinload(Payment.order).selectinload(Order.consumer).selectinload(Consumer.user),
            )
            .order_by(Payment.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_reviews(self) -> list[Review]:
        result = await self.session.execute(
            select(Review)
            .options(
                selectinload(Review.consumer).selectinload(Consumer.user),
                selectinload(Review.listing).selectinload(CropListing.crop),
                selectinload(Review.listing).selectinload(CropListing.farmer).selectinload(Farmer.user),
                selectinload(Review.order),
            )
            .order_by(Review.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_notifications(self) -> list[Notification]:
        result = await self.session.execute(
            select(Notification)
            .options(selectinload(Notification.user))
            .order_by(Notification.created_at.desc())
        )
        return list(result.scalars().unique().all())

    async def list_categories(self) -> list[tuple[str | None, int, int, Decimal | None]]:
        statement = (
            select(
                Crop.category.label("category"),
                func.count(CropListing.id).label("listing_count"),
                func.sum(case((CropListing.availability_status == AvailabilityStatus.AVAILABLE, 1), else_=0)).label("active_listing_count"),
                func.avg(CropListing.asking_price).label("average_price"),
            )
            .join(CropListing, CropListing.crop_id == Crop.id)
            .group_by(Crop.category)
            .order_by(Crop.category.asc().nullslast())
        )
        result = await self.session.execute(statement)
        rows = []
        for category, listing_count, active_listing_count, average_price in result.all():
            rows.append((category, int(listing_count or 0), int(active_listing_count or 0), average_price))
        return rows

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def set_user_active_state(self, user: User, is_active: bool) -> User:
        user.is_active = is_active
        await self.session.commit()
        await self.session.refresh(user)
        return user
