from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    CropListing,
    Delivery,
    DeliveryStatus,
    Farmer,
    FulfillmentMethod,
    Order,
    OrderItem,
    OrderStatus,
    PaymentStatus,
)
from backend.app.services.order_state import DELIVERY_TRANSITIONS, ORDER_TRANSITIONS, assert_transition


class FulfillmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_order_for_consumer(self, order_id: UUID, consumer_id: UUID) -> Order | None:
        result = await self.session.execute(
            select(Order).where(Order.id == order_id, Order.consumer_id == consumer_id).options(selectinload(Order.delivery), selectinload(Order.payment), selectinload(Order.items))
        )
        return result.scalar_one_or_none()

    async def get_order_for_farmer(self, order_id: UUID, farmer_user_id: UUID) -> Order | None:
        result = await self.session.execute(
            select(Order).join(Order.items).join(OrderItem.listing).join(CropListing.farmer).where(Order.id == order_id, Farmer.user_id == farmer_user_id).options(selectinload(Order.delivery), selectinload(Order.payment), selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer)).distinct()
        )
        return result.scalar_one_or_none()

    async def farmer_location(self, order_id: UUID) -> str | None:
        result = await self.session.execute(text("SELECT ST_Y(f.location::geometry), ST_X(f.location::geometry) FROM farmers f JOIN crop_listings cl ON cl.farmer_id = f.id JOIN order_items oi ON oi.listing_id = cl.id WHERE oi.order_id = :order_id AND f.location IS NOT NULL LIMIT 1"), {"order_id": order_id})
        row = result.one_or_none()
        return f"{float(row[0]):g}, {float(row[1]):g}" if row else None

    async def create_fulfillment(self, order: Order, method: FulfillmentMethod, payload, consumer: dict, pickup_location: str | None) -> Delivery:
        order_id = order.id
        await self.session.rollback()
        async with self.session.begin():
            locked = await self.session.execute(select(Order).where(Order.id == order_id).options(selectinload(Order.payment)).with_for_update())
            order = locked.scalar_one()
            existing = await self.session.scalar(select(Delivery).where(Delivery.order_id == order_id).with_for_update())
            if existing is not None:
                raise ValueError("Fulfillment already exists for this order")
            if order.status in {OrderStatus.CANCELLED, OrderStatus.COMPLETED}:
                raise ValueError("Order is not eligible for fulfillment")
            if order.payment is not None and order.payment.status not in {PaymentStatus.SUCCESSFUL, PaymentStatus.PAID}:
                raise ValueError("Order payment is not successful")
            delivery = Delivery(order_id=order_id, fulfillment_method=method, status=DeliveryStatus.PENDING, address=payload.address, recipient_name=consumer["name"], recipient_phone=consumer["phone"], village=payload.village, post_office=payload.post_office, city=payload.city, district=payload.district, state=payload.state or consumer["state"], pin_code=payload.pin_code, address_line=payload.address_line, latitude=payload.latitude, longitude=payload.longitude, pickup_location=pickup_location, scheduled_at=payload.scheduled_at)
            self.session.add(delivery)
            await self.session.flush()
        result = await self.session.execute(select(Delivery).where(Delivery.id == delivery.id))
        return result.scalar_one()

    async def update_status(self, delivery: Delivery, status: DeliveryStatus, farmer_user_id: UUID) -> Delivery:
        delivery_id = delivery.id
        await self.session.rollback()
        async with self.session.begin():
            result = await self.session.execute(select(Delivery).join(Delivery.order).join(Order.items).join(OrderItem.listing).join(CropListing.farmer).where(Delivery.id == delivery_id, Farmer.user_id == farmer_user_id).with_for_update())
            locked = result.scalar_one_or_none()
            if locked is None:
                raise LookupError("Fulfillment not found")
            assert_transition(DELIVERY_TRANSITIONS, locked.status, status, method=locked.fulfillment_method)
            locked.status = status
            order_result = await self.session.execute(select(Order).where(Order.id == locked.order_id).with_for_update())
            order = order_result.scalar_one()
            order_status_by_delivery = {
                DeliveryStatus.CONFIRMED: OrderStatus.PROCESSING,
                DeliveryStatus.READY: OrderStatus.SHIPPED,
                DeliveryStatus.OUT_FOR_DELIVERY: OrderStatus.SHIPPED,
                DeliveryStatus.DELIVERED: OrderStatus.DELIVERED,
                DeliveryStatus.PICKED_UP: OrderStatus.DELIVERED,
            }
            next_order_status = order_status_by_delivery.get(status)
            if next_order_status is not None and order.status is not next_order_status:
                assert_transition(ORDER_TRANSITIONS, order.status, next_order_status)
                order.status = next_order_status
        result = await self.session.execute(select(Delivery).where(Delivery.id == locked.id))
        return result.scalar_one()
