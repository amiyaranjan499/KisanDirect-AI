from uuid import UUID

from backend.app.models import DeliveryStatus, FulfillmentMethod, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.fulfillment_repository import FulfillmentRepository
from backend.app.services.order_lifecycle_service import LifecycleActor, OrderLifecycleService
from backend.app.schemas.fulfillment import FulfillmentCreate, FulfillmentResponse, FulfillmentStatusUpdate


class FulfillmentService:
    def __init__(self, repository: FulfillmentRepository, consumers: ConsumerRepository, notification_service=None) -> None:
        self.repository = repository
        self.consumers = consumers
        self.notification_service = notification_service
        self.lifecycle = OrderLifecycleService(repository.session, notification_service)

    @staticmethod
    def response(delivery: object) -> FulfillmentResponse:
        return FulfillmentResponse(id=delivery.id, order_id=delivery.order_id, method=delivery.fulfillment_method.value, status=delivery.status.value, address=delivery.address, recipient_name=delivery.recipient_name, recipient_phone=delivery.recipient_phone, village=delivery.village, post_office=delivery.post_office, city=delivery.city, district=delivery.district, state=delivery.state, pin_code=delivery.pin_code, address_line=delivery.address_line, latitude=float(delivery.latitude) if delivery.latitude is not None else None, longitude=float(delivery.longitude) if delivery.longitude is not None else None, pickup_location=delivery.pickup_location, scheduled_at=delivery.scheduled_at, created_at=delivery.created_at, updated_at=delivery.updated_at)

    async def create(self, user_id: UUID, order_id: UUID, payload: FulfillmentCreate) -> FulfillmentResponse:
        consumer = await self.consumers.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        order = await self.repository.get_order_for_consumer(order_id, consumer.id)
        if order is None:
            raise LookupError("Order not found")
        method = FulfillmentMethod(payload.method)
        if method is FulfillmentMethod.DELIVERY and not payload.address:
            raise ValueError("Delivery address is required")
        pickup_location = await self.repository.farmer_location(order_id) if method is FulfillmentMethod.FARMER_PICKUP else None
        if method is FulfillmentMethod.FARMER_PICKUP and pickup_location is None:
            raise ValueError("Farmer pickup location is unavailable")
        consumer_snapshot = {
            "name": consumer.name,
            "phone": consumer.phone,
            "state": consumer.state,
        }
        return self.response(await self.repository.create_fulfillment(order, method, payload, consumer_snapshot, pickup_location))

    async def get(self, user_id: UUID, role: UserRole, order_id: UUID) -> FulfillmentResponse:
        if role is UserRole.CONSUMER:
            consumer = await self.consumers.get_profile(user_id)
            order = await self.repository.get_order_for_consumer(order_id, consumer.id) if consumer else None
        else:
            order = await self.repository.get_order_for_farmer(order_id, user_id)
        if order is None or order.delivery is None:
            raise LookupError("Fulfillment not found")
        return self.response(order.delivery)

    async def update_status(self, user_id: UUID, payload: FulfillmentStatusUpdate, order_id: UUID) -> FulfillmentResponse:
        try:
            status = DeliveryStatus(payload.status)
        except ValueError as exc:
            raise ValueError("Invalid fulfillment status") from exc

        updated = await self.lifecycle.transition_delivery(
            order_id,
            LifecycleActor(user_id, UserRole.FARMER),
            status,
            reason=payload.reason,
        )
        return self.response(updated)
