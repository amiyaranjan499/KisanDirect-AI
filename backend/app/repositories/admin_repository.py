from datetime import datetime
from decimal import Decimal
from uuid import UUID

from geoalchemy2 import Geometry
from sqlalchemy import case, cast, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    AdminAuditEvent,
    AIPricePrediction,
    AIQualityPrediction,
    AvailabilityStatus,
    CartItem,
    Consumer,
    Crop,
    CropImage,
    CropListing,
    Delivery,
    Farmer,
    FarmerHiddenOrder,
    FarmerWithdrawal,
    Hub,
    HubStaff,
    HubStock,
    HubStockDelivery,
    Notification,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Payment,
    Review,
    Rider,
    RiderLocation,
    RiderOffer,
    Shipment,
    ShipmentStatus,
    StockReservation,
    User,
    UserRole,
)
from backend.app.services.order_lifecycle_service import LifecycleConflict


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

    async def count_genuine_farmers(self) -> int:
        result = await self.session.execute(
            select(func.count(func.distinct(Farmer.user_id)))
            .join(User, User.id == Farmer.user_id)
            .where(User.is_active.is_(True), User.role == UserRole.FARMER)
        )
        return int(result.scalar_one() or 0)

    async def count_genuine_consumers(self) -> int:
        result = await self.session.execute(
            select(func.count(func.distinct(Consumer.user_id)))
            .join(User, User.id == Consumer.user_id)
            .where(User.is_active.is_(True), User.role == UserRole.CONSUMER)
        )
        return int(result.scalar_one() or 0)

    async def count_listings(self) -> int:
        result = await self.session.execute(
            select(func.count(CropListing.id))
            .join(Farmer, Farmer.id == CropListing.farmer_id)
            .join(User, User.id == Farmer.user_id)
            .where(
                CropListing.availability_status != AvailabilityStatus.UNAVAILABLE,
                User.is_active.is_(True),
            )
        )
        return int(result.scalar_one() or 0)

    async def count_listings_by_status(self, status: AvailabilityStatus) -> int:
        result = await self.session.execute(
            select(func.count(CropListing.id))
            .join(Farmer, Farmer.id == CropListing.farmer_id)
            .join(User, User.id == Farmer.user_id)
            .where(
                CropListing.availability_status == status,
                User.is_active.is_(True),
            )
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
        await self.session.flush()
        return user

    async def delivery_metrics(self, start: datetime, end: datetime) -> dict[str, int | float | None]:
        active_statuses = (
            ShipmentStatus.PACKING,
            ShipmentStatus.READY_FOR_PICKUP,
            ShipmentStatus.RIDER_ASSIGNED,
            ShipmentStatus.PICKED_UP,
            ShipmentStatus.OUT_FOR_DELIVERY,
            ShipmentStatus.ARRIVED,
        )
        active = await self.session.scalar(
            select(func.count(Shipment.id)).where(
                Shipment.status.in_(active_statuses),
                Shipment.created_at >= start,
                Shipment.created_at < end,
            )
        )

        placed = (
            select(
                OrderEvent.order_id.label("order_id"),
                func.min(OrderEvent.created_at).label("placed_at"),
            )
            .where(OrderEvent.to_status == OrderStatus.PENDING.value)
            .group_by(OrderEvent.order_id)
            .subquery()
        )
        delivered = (
            select(
                OrderEvent.order_id.label("order_id"),
                func.min(OrderEvent.created_at).label("delivered_at"),
            )
            .where(OrderEvent.to_status == ShipmentStatus.DELIVERED.value)
            .group_by(OrderEvent.order_id)
            .subquery()
        )
        average_minutes = await self.session.scalar(
            select(
                func.avg(
                    func.extract("epoch", delivered.c.delivered_at - placed.c.placed_at)
                    / 60.0
                )
            )
            .join(placed, placed.c.order_id == delivered.c.order_id)
            .where(delivered.c.delivered_at >= start, delivered.c.delivered_at < end)
        )
        failed = await self.session.scalar(
            select(func.count(OrderEvent.id)).where(
                OrderEvent.to_status == "FAILED_DELIVERY",
                OrderEvent.created_at >= start,
                OrderEvent.created_at < end,
            )
        )
        return {
            "active_shipments": int(active or 0),
            "average_placed_to_delivered_minutes": (
                float(average_minutes) if average_minutes is not None else None
            ),
            "failed_deliveries": int(failed or 0),
        }

    async def list_riders(self) -> list[tuple[Rider, int, int]]:
        active = (
            select(func.count(Shipment.id))
            .where(
                Shipment.rider_id == Rider.id,
                Shipment.status.not_in(
                    (ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED, ShipmentStatus.RETURNED)
                ),
            )
            .correlate(Rider)
            .scalar_subquery()
        )
        completed = (
            select(func.count(Shipment.id))
            .where(
                Shipment.rider_id == Rider.id,
                Shipment.status == ShipmentStatus.DELIVERED,
            )
            .correlate(Rider)
            .scalar_subquery()
        )
        result = await self.session.execute(
            select(Rider, active, completed)
            .options(selectinload(Rider.user))
            .order_by(Rider.created_at.desc(), Rider.id)
        )
        return [(rider, int(active_count or 0), int(done_count or 0)) for rider, active_count, done_count in result.all()]

    async def get_rider_for_update(self, rider_id: UUID) -> Rider | None:
        result = await self.session.execute(
            select(Rider)
            .options(selectinload(Rider.user))
            .where(Rider.id == rider_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def count_active_shipments_for_rider(self, rider_id: UUID) -> int:
        return int(
            await self.session.scalar(
                select(func.count(Shipment.id)).where(
                    Shipment.rider_id == rider_id,
                    Shipment.status.not_in(
                        (
                            ShipmentStatus.DELIVERED,
                            ShipmentStatus.CANCELLED,
                            ShipmentStatus.RETURNED,
                        )
                    ),
                )
            )
            or 0
        )

    async def list_hubs(self) -> list[tuple[Hub, float, float]]:
        result = await self.session.execute(
            select(
                Hub,
                func.ST_Y(cast(Hub.location, Geometry)).label("latitude"),
                func.ST_X(cast(Hub.location, Geometry)).label("longitude"),
            ).order_by(Hub.name, Hub.id)
        )
        return [
            (hub, float(latitude), float(longitude))
            for hub, latitude, longitude in result.all()
        ]

    async def get_hub_for_update(self, hub_id: UUID) -> Hub | None:
        result = await self.session.execute(
            select(Hub).where(Hub.id == hub_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def hub_coordinates(self, hub_id: UUID) -> tuple[float, float]:
        result = await self.session.execute(
            select(
                func.ST_Y(cast(Hub.location, Geometry)),
                func.ST_X(cast(Hub.location, Geometry)),
            ).where(Hub.id == hub_id)
        )
        latitude, longitude = result.one()
        return float(latitude), float(longitude)

    async def hub_stock_rows(self) -> list[tuple[HubStock, str, str]]:
        result = await self.session.execute(
            select(HubStock, Crop.name, CropListing.unit)
            .join(CropListing, CropListing.id == HubStock.listing_id)
            .join(Crop, Crop.id == CropListing.crop_id)
            .order_by(HubStock.hub_id, Crop.name)
        )
        return list(result.all())

    async def hub_delivery_rows(self) -> list[tuple[HubStockDelivery, str, str]]:
        result = await self.session.execute(
            select(HubStockDelivery, Crop.name, func.coalesce(Farmer.name, User.email))
            .join(CropListing, CropListing.id == HubStockDelivery.listing_id)
            .join(Crop, Crop.id == CropListing.crop_id)
            .outerjoin(Farmer, Farmer.user_id == HubStockDelivery.farmer_user_id)
            .join(User, User.id == HubStockDelivery.farmer_user_id)
            .order_by(HubStockDelivery.created_at.desc())
        )
        return list(result.all())

    async def list_hub_staff(self) -> list[tuple[User, UUID | None, str | None]]:
        result = await self.session.execute(
            select(User, HubStaff.hub_id, Hub.name)
            .outerjoin(HubStaff, HubStaff.user_id == User.id)
            .outerjoin(Hub, Hub.id == HubStaff.hub_id)
            .where(User.role == UserRole.HUB_STAFF)
            .order_by(User.email, Hub.name)
        )
        return list(result.all())

    async def get_hub_staff_user(self, user_id: UUID) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id, User.role == UserRole.HUB_STAFF).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_hub_staff_assignment(self, user_id: UUID, hub_id: UUID) -> HubStaff | None:
        result = await self.session.execute(
            select(HubStaff)
            .where(HubStaff.user_id == user_id, HubStaff.hub_id == hub_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def list_shipments(self) -> list[Shipment]:
        result = await self.session.execute(
            select(Shipment)
            .options(
                selectinload(Shipment.hub),
                selectinload(Shipment.rider).selectinload(Rider.user),
                selectinload(Shipment.order).selectinload(Order.consumer).selectinload(Consumer.user),
            )
            .order_by(Shipment.created_at.desc(), Shipment.id)
        )
        return list(result.scalars().unique().all())

    async def get_user_by_id_for_update(self, user_id: UUID) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def delete_order(self, order_id: UUID) -> bool:
        async with self.session.begin_nested():
            order = await self.session.get(Order, order_id, with_for_update=True)
            if order is None:
                return False

            shipments_res = await self.session.execute(
                select(Shipment.id).where(Shipment.order_id == order_id)
            )
            shipment_ids = list(shipments_res.scalars().all())
            if shipment_ids:
                await self.session.execute(
                    delete(RiderOffer).where(RiderOffer.shipment_id.in_(shipment_ids))
                )
                await self.session.execute(
                    update(OrderEvent)
                    .where(OrderEvent.shipment_id.in_(shipment_ids))
                    .values(shipment_id=None)
                )
                await self.session.execute(
                    delete(Shipment).where(Shipment.id.in_(shipment_ids))
                )

            await self.session.execute(
                delete(StockReservation).where(StockReservation.order_id == order_id)
            )
            await self.session.execute(
                delete(OrderItem).where(OrderItem.order_id == order_id)
            )
            await self.session.execute(
                delete(Payment).where(Payment.order_id == order_id)
            )
            await self.session.execute(
                delete(Delivery).where(Delivery.order_id == order_id)
            )
            await self.session.execute(
                delete(Review).where(Review.order_id == order_id)
            )
            await self.session.execute(
                delete(FarmerHiddenOrder).where(FarmerHiddenOrder.order_id == order_id)
            )
            await self.session.execute(
                delete(OrderEvent).where(OrderEvent.order_id == order_id)
            )
            await self.session.execute(
                delete(AdminAuditEvent).where(
                    AdminAuditEvent.entity_type == "order",
                    AdminAuditEvent.entity_id == order_id,
                )
            )

            await self.session.delete(order)
            await self.session.flush()
            return True

    async def delete_listing(self, listing_id: UUID) -> bool:
        async with self.session.begin_nested():
            listing = await self.session.get(CropListing, listing_id, with_for_update=True)
            if listing is None:
                return False

            stock_res = await self.session.execute(
                select(HubStock.id).where(HubStock.listing_id == listing_id)
            )
            stock_ids = list(stock_res.scalars().all())
            if stock_ids:
                await self.session.execute(
                    delete(StockReservation).where(StockReservation.hub_stock_id.in_(stock_ids))
                )

            await self.session.execute(
                delete(CartItem).where(CartItem.listing_id == listing_id)
            )
            await self.session.execute(
                delete(HubStockDelivery).where(HubStockDelivery.listing_id == listing_id)
            )
            await self.session.execute(
                delete(HubStock).where(HubStock.listing_id == listing_id)
            )
            await self.session.execute(
                delete(CropImage).where(CropImage.listing_id == listing_id)
            )
            await self.session.execute(
                delete(AIQualityPrediction).where(AIQualityPrediction.listing_id == listing_id)
            )
            await self.session.execute(
                delete(AIPricePrediction).where(AIPricePrediction.listing_id == listing_id)
            )
            await self.session.execute(
                delete(Review).where(Review.listing_id == listing_id)
            )
            await self.session.execute(
                delete(OrderItem).where(OrderItem.listing_id == listing_id)
            )

            await self.session.delete(listing)
            await self.session.flush()
            return True

    async def delete_farmer(self, farmer_id: UUID) -> bool:
        async with self.session.begin_nested():
            farmer = await self.session.get(Farmer, farmer_id, with_for_update=True)
            if farmer is None:
                return False

            user_id = farmer.user_id

            listings_res = await self.session.execute(
                select(CropListing.id).where(CropListing.farmer_id == farmer_id)
            )
            listing_ids = list(listings_res.scalars().all())
            if listing_ids:
                stock_res = await self.session.execute(
                    select(HubStock.id).where(HubStock.listing_id.in_(listing_ids))
                )
                stock_ids = list(stock_res.scalars().all())
                if stock_ids:
                    await self.session.execute(
                        delete(StockReservation).where(StockReservation.hub_stock_id.in_(stock_ids))
                    )
                await self.session.execute(
                    delete(CartItem).where(CartItem.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(HubStockDelivery).where(HubStockDelivery.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(HubStock).where(HubStock.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(CropImage).where(CropImage.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(AIQualityPrediction).where(AIQualityPrediction.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(AIPricePrediction).where(AIPricePrediction.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(Review).where(Review.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(OrderItem).where(OrderItem.listing_id.in_(listing_ids))
                )
                await self.session.execute(
                    delete(CropListing).where(CropListing.id.in_(listing_ids))
                )

            await self.session.execute(
                delete(HubStockDelivery).where(HubStockDelivery.farmer_user_id == user_id)
            )
            await self.session.execute(
                delete(FarmerWithdrawal).where(FarmerWithdrawal.farmer_id == farmer_id)
            )
            await self.session.execute(
                delete(FarmerHiddenOrder).where(FarmerHiddenOrder.farmer_id == farmer_id)
            )
            await self.session.execute(
                update(Hub).where(Hub.farmer_id == farmer_id).values(farmer_id=None)
            )
            await self.session.execute(
                update(OrderEvent).where(OrderEvent.actor_user_id == user_id).values(actor_user_id=None)
            )
            await self.session.execute(
                update(AdminAuditEvent).where(AdminAuditEvent.actor_user_id == user_id).values(actor_user_id=None)
            )
            await self.session.execute(
                delete(Notification).where(Notification.user_id == user_id)
            )

            await self.session.delete(farmer)
            await self.session.flush()

            user = await self.session.get(User, user_id, with_for_update=True)
            if user:
                await self.session.delete(user)
                await self.session.flush()

            return True

    async def delete_hub_staff(self, user_id: UUID) -> bool:
        async with self.session.begin_nested():
            user = await self.session.scalar(
                select(User).where(User.id == user_id, User.role == UserRole.HUB_STAFF).with_for_update()
            )
            if user is None:
                return False

            await self.session.execute(
                update(HubStockDelivery)
                .where(HubStockDelivery.received_by_user_id == user_id)
                .values(received_by_user_id=None)
            )
            await self.session.execute(
                update(OrderEvent)
                .where(OrderEvent.actor_user_id == user_id)
                .values(actor_user_id=None)
            )
            await self.session.execute(
                update(AdminAuditEvent)
                .where(AdminAuditEvent.actor_user_id == user_id)
                .values(actor_user_id=None)
            )
            await self.session.execute(
                delete(Notification).where(Notification.user_id == user_id)
            )
            await self.session.execute(
                delete(HubStaff).where(HubStaff.user_id == user_id)
            )

            await self.session.delete(user)
            await self.session.flush()
            return True

    async def delete_rider(self, rider_id: UUID) -> bool:
        async with self.session.begin_nested():
            rider = await self.session.get(Rider, rider_id, with_for_update=True)
            if rider is None:
                return False

            active_statuses = (
                ShipmentStatus.PACKING,
                ShipmentStatus.READY_FOR_PICKUP,
                ShipmentStatus.RIDER_ASSIGNED,
                ShipmentStatus.PICKED_UP,
                ShipmentStatus.OUT_FOR_DELIVERY,
                ShipmentStatus.ARRIVED,
            )
            active_count = await self.session.scalar(
                select(func.count(Shipment.id)).where(
                    Shipment.rider_id == rider_id,
                    Shipment.status.in_(active_statuses),
                )
            )
            if active_count and int(active_count) > 0:
                raise LifecycleConflict(f"Cannot delete rider with {active_count} active deliveries in progress.")

            await self.session.execute(
                update(Shipment).where(Shipment.rider_id == rider_id).values(rider_id=None)
            )
            await self.session.execute(
                delete(RiderOffer).where(RiderOffer.rider_id == rider_id)
            )
            await self.session.execute(
                delete(RiderLocation).where(RiderLocation.rider_id == rider_id)
            )

            user_id = rider.user_id
            await self.session.execute(
                update(OrderEvent).where(OrderEvent.actor_user_id == user_id).values(actor_user_id=None)
            )
            await self.session.execute(
                update(AdminAuditEvent).where(AdminAuditEvent.actor_user_id == user_id).values(actor_user_id=None)
            )
            await self.session.execute(
                delete(Notification).where(Notification.user_id == user_id)
            )

            await self.session.delete(rider)
            await self.session.flush()

            user = await self.session.get(User, user_id, with_for_update=True)
            if user:
                await self.session.delete(user)
                await self.session.flush()

            return True

    async def delete_shipment(self, shipment_id: UUID) -> bool:
        async with self.session.begin_nested():
            shipment = await self.session.get(Shipment, shipment_id, with_for_update=True)
            if shipment is None:
                return False

            active_statuses = (
                ShipmentStatus.RIDER_ASSIGNED,
                ShipmentStatus.PICKED_UP,
                ShipmentStatus.OUT_FOR_DELIVERY,
                ShipmentStatus.ARRIVED,
            )
            if shipment.status in active_statuses:
                raise LifecycleConflict(f"Cannot delete shipment while in {shipment.status.value} status.")

            await self.session.execute(
                delete(RiderOffer).where(RiderOffer.shipment_id == shipment_id)
            )
            await self.session.execute(
                update(OrderEvent).where(OrderEvent.shipment_id == shipment_id).values(shipment_id=None)
            )

            await self.session.delete(shipment)
            await self.session.flush()
            return True

    async def delete_payment(self, payment_id: UUID) -> bool:
        async with self.session.begin_nested():
            payment = await self.session.get(Payment, payment_id, with_for_update=True)
            if payment is None:
                return False

            await self.session.delete(payment)
            await self.session.flush()
            return True
