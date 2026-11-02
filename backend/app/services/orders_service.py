from datetime import datetime, timedelta, timezone
from decimal import Decimal
from math import ceil
from uuid import UUID

from sqlalchemy import select

from backend.app.core.config import Settings
from backend.app.models import (
    HubStaff,
    NotificationType,
    Order,
    OrderStatus,
    ShipmentStatus,
    UserRole,
)
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.repositories.orders_repository import OrdersRepository
from backend.app.services.order_lifecycle_service import LifecycleActor, OrderLifecycleService
from backend.app.schemas.orders import (
    CartItemResponse,
    CartResponse,
    CheckoutRequest,
    CheckoutHubOption,
    CheckoutOptionsResponse,
    CheckoutSlotOption,
    CheckoutUnavailableItem,
    OrderItemResponse,
    OrderPage,
    OrderResponse,
    OrderTrackingResponse,
    TrackingEventResponse,
    TrackingLocationResponse,
)
from backend.app.schemas.payments import PaymentResponse


class OrdersService:
    def __init__(
        self,
        repository: OrdersRepository,
        consumer_repository: ConsumerRepository,
        notification_service=None,
        settings: Settings | None = None,
    ) -> None:
        self.repository = repository
        self.consumer_repository = consumer_repository
        self.notification_service = notification_service
        self.settings = settings or Settings()
        self.lifecycle = OrderLifecycleService(
            repository.session, notification_service, settings=self.settings
        )

    async def consumer_id(self, user_id: UUID) -> UUID:
        consumer = await self.consumer_repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        return consumer.id

    @staticmethod
    def cart_response(cart) -> CartResponse:
        items = []
        subtotal = Decimal("0")
        total_quantity = Decimal("0")
        for item in cart.items:
            listing = item.listing
            item_subtotal = (Decimal(listing.asking_price) * Decimal(item.quantity)).quantize(Decimal("0.01"))
            subtotal += item_subtotal
            total_quantity += item.quantity
            image_url = listing.images[0].storage_url if getattr(listing, 'images', None) else None
            items.append(CartItemResponse(id=item.id, listing_id=listing.id, crop_name=listing.crop.name, farmer_name=listing.farmer.name, quantity=item.quantity, available_quantity=listing.quantity, minimum_order_quantity=listing.minimum_order_quantity, unit=listing.unit, unit_price=listing.asking_price, subtotal=item_subtotal, image_url=image_url))
        return CartResponse(id=cart.id, items=items, subtotal=subtotal, total_quantity=total_quantity)

    @staticmethod
    def order_response(order: Order, farmer_user_id: UUID | None = None) -> OrderResponse:
        items = []
        for item in order.items:
            if farmer_user_id is not None and item.listing.farmer.user_id != farmer_user_id:
                continue
            items.append(OrderItemResponse(id=item.id, listing_id=item.listing_id, crop_name=item.listing.crop.name, farmer_name=item.listing.farmer.name, quantity=item.quantity, unit=item.listing.unit, unit_price=item.unit_price, subtotal=item.subtotal))
        payment = None
        if order.payment is not None:
            payment = PaymentResponse(id=order.payment.id, order_id=order.payment.order_id, provider_reference=order.payment.provider_reference, amount=order.payment.amount, status=order.payment.status.value.lower(), payment_method=order.payment.payment_method, is_test=order.payment.is_test, created_at=order.payment.created_at, updated_at=order.payment.updated_at)
        return OrderResponse(
            id=order.id,
            consumer_id=order.consumer_id,
            status=order.status.value,
            subtotal=order.subtotal,
            delivery_fee=order.delivery_fee,
            platform_fee=order.platform_fee,
            total_amount=order.total_amount,
            hub_id=order.hub_id,
            delivery_address=order.delivery_address,
            delivery_slot_id=order.delivery_slot_id,
            promised_window_start=order.promised_window_start,
            promised_window_end=order.promised_window_end,
            created_at=order.created_at,
            updated_at=order.updated_at,
            items=items,
            payment=payment,
        )

    async def get_cart(self, user_id: UUID) -> CartResponse:
        return self.cart_response(await self.repository.get_or_create_cart(await self.consumer_id(user_id)))

    async def add_item(self, user_id: UUID, listing_id: UUID, quantity: Decimal) -> CartResponse:
        consumer_id = await self.consumer_id(user_id)
        await self.repository.add_or_update_item(consumer_id, listing_id, quantity)
        return await self.get_cart(user_id)

    async def update_item(self, user_id: UUID, item_id: UUID, quantity: Decimal) -> CartResponse:
        await self.repository.update_item(await self.consumer_id(user_id), item_id, quantity)
        return await self.get_cart(user_id)

    async def remove_item(self, user_id: UUID, item_id: UUID) -> CartResponse:
        await self.repository.remove_item(await self.consumer_id(user_id), item_id)
        return await self.get_cart(user_id)

    async def clear_cart(self, user_id: UUID) -> CartResponse:
        await self.repository.clear_cart(await self.consumer_id(user_id))
        return await self.get_cart(user_id)

    async def checkout_options(
        self, user_id: UUID, latitude: float, longitude: float
    ) -> CheckoutOptionsResponse:
        consumer_id = await self.consumer_id(user_id)
        cart = await self.repository.get_checkout_cart(consumer_id)
        cart_items = cart.items if cart is not None else []
        subtotal = sum(
            (
                Decimal(item.listing.asking_price) * item.quantity
            ).quantize(Decimal("0.01"))
            for item in cart_items
        )
        hubs = await self.repository.checkout_hub_options(
            latitude,
            longitude,
            [item.listing_id for item in cart_items],
            self.settings,
        )
        hub_options = []
        for entry in hubs:
            hub = entry["hub"]
            stock_by_listing = entry["stock_by_listing"]
            unavailable_items = [
                CheckoutUnavailableItem(
                    listing_id=item.listing_id,
                    crop_name=item.listing.crop.name,
                    requested_quantity=item.quantity,
                    available_quantity=stock_by_listing.get(
                        item.listing_id, Decimal("0")
                    ),
                    unit=item.listing.unit,
                )
                for item in cart_items
                if item.listing.availability_status.value != "AVAILABLE"
                or stock_by_listing.get(item.listing_id, Decimal("0"))
                < item.quantity
            ]
            travel_minutes = ceil(
                entry["distance_km"] / float(self.settings.rider_speed_kmph) * 60
            )
            eta_min = self.settings.packing_minutes + travel_minutes
            eta_max = eta_min + self.settings.delivery_buffer_minutes
            hub_options.append(
                CheckoutHubOption(
                    id=hub.id,
                    name=hub.name,
                    address=hub.address,
                    distance_km=entry["distance_km"],
                    available=not unavailable_items,
                    unavailable_items=unavailable_items,
                    eta_min_minutes=eta_min,
                    eta_max_minutes=eta_max,
                    slots=[
                        CheckoutSlotOption(
                            id=slot.id,
                            starts_at=slot.starts_at,
                            ends_at=slot.ends_at,
                            remaining_capacity=slot.capacity - slot.booked_count,
                        )
                        for slot in entry["slots"]
                    ],
                )
            )
        return CheckoutOptionsResponse(
            item_count=len(cart_items),
            subtotal=subtotal,
            delivery_fee=self.settings.delivery_fee.quantize(Decimal("0.01")),
            platform_fee=self.settings.platform_fee.quantize(Decimal("0.01")),
            total=(
                subtotal
                + self.settings.delivery_fee.quantize(Decimal("0.01"))
                + self.settings.platform_fee.quantize(Decimal("0.01"))
            ),
            reservation_ttl_minutes=self.settings.reservation_ttl_minutes,
            hubs=hub_options,
        )

    async def checkout(self, user_id: UUID, payload: CheckoutRequest) -> OrderResponse:
        consumer_id = await self.consumer_id(user_id)
        order_id = await self.lifecycle.create_checkout_order(
            LifecycleActor(user_id, UserRole.CONSUMER),
            hub_id=payload.hub_id,
            delivery_slot_id=payload.delivery_slot_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            address=payload.address,
            settings=self.settings,
        )
        order = await self.repository.get_order(order_id, consumer_id=consumer_id)
        if order is None:
            raise LookupError("Order not found after checkout")
        await self._notify_order_created(order, user_id)
        return self.order_response(order)

    async def consumer_orders(self, user_id: UUID, page: int, page_size: int) -> OrderPage:
        orders, total = await self.repository.consumer_orders(await self.consumer_id(user_id), page, page_size)
        return OrderPage(items=[self.order_response(order) for order in orders], page=page, page_size=page_size, total=total, pages=ceil(total / page_size) if total else 0)

    async def farmer_orders(self, user_id: UUID, page: int, page_size: int) -> OrderPage:
        orders, total = await self.repository.farmer_orders(user_id, page, page_size)
        return OrderPage(items=[self.order_response(order, user_id) for order in orders], page=page, page_size=page_size, total=total, pages=ceil(total / page_size) if total else 0)

    async def order_detail(self, user_id: UUID, role: UserRole, order_id: UUID) -> OrderResponse:
        order = await self.repository.get_order(order_id, consumer_id=await self.consumer_id(user_id) if role is UserRole.CONSUMER else None, farmer_user_id=user_id if role is UserRole.FARMER else None)
        if order is None:
            raise LookupError("Order not found")
        return self.order_response(order, user_id if role is UserRole.FARMER else None)

    async def tracking(
        self, actor_id: UUID, role: UserRole, order_id: UUID
    ) -> OrderTrackingResponse:
        order = await self.repository.get_tracking_order(order_id)
        if order is None:
            raise LookupError("Order not found")
        shipment = order.shipment
        is_consumer = role is UserRole.CONSUMER and order.consumer.user_id == actor_id
        is_rider = (
            role is UserRole.RIDER
            and shipment is not None
            and shipment.rider is not None
            and shipment.rider.user_id == actor_id
        )
        is_farmer = role is UserRole.FARMER and await self.repository.has_farmer_access(
            order.id, actor_id
        )
        is_hub_staff = (
            role is UserRole.HUB_STAFF
            and shipment is not None
            and await self.repository.has_hub_staff_access(shipment.hub_id, actor_id)
        )
        is_admin = role is UserRole.ADMIN
        if not any((is_consumer, is_rider, is_farmer, is_hub_staff, is_admin)):
            raise PermissionError("You do not have access to this order tracking")
        can_view_order_details = is_consumer or is_admin

        events = await self.repository.order_events(order.id)
        tracking_events = [
            TrackingEventResponse(status=event.to_status, occurred_at=event.created_at)
            for event in events
            if not event.to_status.startswith("OTP_")
        ]
        pickup_location = None
        delivery_location = None
        rider_location = None
        rider_location_available = False
        rider_name = None
        rider_vehicle = None
        delivery_otp = None

        if shipment is not None:
            hub_coordinates = (
                await self.repository.hub_coordinates(shipment.hub_id)
                if can_view_order_details
                else None
            )
            if hub_coordinates is not None:
                pickup_location = TrackingLocationResponse(
                    latitude=hub_coordinates[0],
                    longitude=hub_coordinates[1],
                    recorded_at=hub_coordinates[2],
                )
            if (
                can_view_order_details
                and order.delivery_latitude is not None
                and order.delivery_longitude is not None
            ):
                delivery_location = TrackingLocationResponse(
                    latitude=float(order.delivery_latitude),
                    longitude=float(order.delivery_longitude),
                    recorded_at=order.created_at,
                )
            if shipment.rider is not None:
                if can_view_order_details:
                    rider_name = shipment.rider.display_name or "Delivery rider"
                    rider_vehicle = shipment.rider.vehicle_type
                if is_consumer or is_rider or is_admin:
                    latest = await self.repository.latest_rider_location(
                        shipment.rider.id
                    )
                    if latest is not None:
                        latitude, longitude, recorded_at = latest
                        if recorded_at >= datetime.now(timezone.utc) - timedelta(
                            seconds=self.settings.rider_location_stale_seconds
                        ):
                            rider_location = TrackingLocationResponse(
                                latitude=latitude,
                                longitude=longitude,
                                recorded_at=recorded_at,
                            )
                            rider_location_available = True
            if (
                is_consumer
                and shipment.status
                in {ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.ARRIVED}
                and shipment.otp_consumed_at is None
                and shipment.otp_expires_at is not None
                and shipment.otp_expires_at > datetime.now(timezone.utc)
                and shipment.otp_attempts < self.settings.otp_max_attempts
            ):
                notification = await NotificationRepository(
                    self.repository.session
                ).latest_delivery_otp(actor_id, shipment.id)
                if notification is not None:
                    prefix = "Your delivery verification code is "
                    if notification.message.startswith(prefix):
                        delivery_otp = notification.message[len(prefix) :].rstrip(".")

        return OrderTrackingResponse(
            order_id=order.id,
            order_status=order.status.value,
            shipment_status=shipment.status.value if shipment is not None else None,
            events=tracking_events,
            pickup_address=(
                shipment.pickup_address_snapshot
                if shipment is not None and can_view_order_details
                else None
            ),
            pickup_location=pickup_location if can_view_order_details else None,
            delivery_address=order.delivery_address if can_view_order_details else None,
            delivery_location=delivery_location if can_view_order_details else None,
            rider_name=rider_name,
            rider_vehicle=rider_vehicle,
            rider_location=rider_location,
            rider_location_available=rider_location_available,
            promised_window_start=(
                (
                    shipment.promised_window_start
                    if can_view_order_details
                    else None
                )
                if shipment
                else (
                    order.promised_window_start if can_view_order_details else None
                )
            ),
            promised_window_end=(
                (
                    shipment.promised_window_end
                    if can_view_order_details
                    else None
                )
                if shipment
                else (order.promised_window_end if can_view_order_details else None)
            ),
            delivery_otp=delivery_otp,
            review_listing_ids=(
                [item.listing_id for item in order.items]
                if is_consumer and shipment is not None
                and shipment.status is ShipmentStatus.DELIVERED
                else []
            ),
            can_cancel=(
                is_consumer
                and order.status in {OrderStatus.PENDING, OrderStatus.CONFIRMED}
            ),
        )

    async def update_status(
        self,
        user_id: UUID,
        role: UserRole,
        order_id: UUID,
        status: str,
        reason: str | None = None,
    ) -> OrderResponse:
        try:
            requested = OrderStatus(status)
        except ValueError as exc:
            raise ValueError("Invalid order status") from exc
        await self.lifecycle.transition_order(
            order_id,
            LifecycleActor(user_id, role),
            requested,
            reason=reason,
        )
        updated = await self.repository.get_order(
            order_id,
            consumer_id=await self.consumer_id(user_id) if role is UserRole.CONSUMER else None,
            farmer_user_id=user_id if role is UserRole.FARMER else None,
        )
        if updated is None:
            raise LookupError("Order not found")
        return self.order_response(updated, user_id if role is UserRole.FARMER else None)

    async def initiate_test_payment(self, user_id: UUID, order_id: UUID, outcome: str) -> PaymentResponse:
        payment_id = await self.lifecycle.initiate_sandbox_payment(user_id, order_id, outcome)
        payment = await self.repository.get_payment(
            payment_id,
            await self.consumer_id(user_id),
        )
        if payment is None:
            raise LookupError("Payment not found")
        return PaymentResponse(id=payment.id, order_id=payment.order_id, provider_reference=payment.provider_reference, amount=payment.amount, status=payment.status.value.lower(), payment_method=payment.payment_method, is_test=payment.is_test, created_at=payment.created_at, updated_at=payment.updated_at)

    async def get_test_payment(self, user_id: UUID, payment_id: UUID) -> PaymentResponse:
        payment = await self.repository.get_payment(payment_id, await self.consumer_id(user_id))
        if payment is None:
            raise LookupError("Payment not found")
        return PaymentResponse(id=payment.id, order_id=payment.order_id, provider_reference=payment.provider_reference, amount=payment.amount, status=payment.status.value.lower(), payment_method=payment.payment_method, is_test=payment.is_test, created_at=payment.created_at, updated_at=payment.updated_at)

    async def _notify_order_created(self, order, consumer_user_id: UUID) -> None:
        if self.notification_service is None:
            return
        order_code = f"ORD-{str(order.id)[:8].upper()}"
        await self.notification_service.create(
            user_id=consumer_user_id,
            notification_type=NotificationType.ORDER,
            title="Order created",
            message=f"Your order {order_code} has been placed successfully. Total: ₹{order.total_amount}.",
            related_entity_type="order",
            related_entity_id=order.id,
        )

        # 1. Group items per farmer so each farmer gets a single comprehensive notification
        farmer_items_map: dict[UUID, list] = {}
        for item in order.items:
            f_uid = item.listing.farmer.user_id
            if f_uid != consumer_user_id:
                farmer_items_map.setdefault(f_uid, []).append(item)

        created_str = (
            order.created_at.strftime("%d %b %Y, %I:%M %p")
            if getattr(order, "created_at", None)
            else "recently"
        )
        for farmer_uid, items in farmer_items_map.items():
            crop_summary = ", ".join(
                f"{item.quantity} {item.listing.unit} {item.listing.crop.name}"
                for item in items
            )
            await self.notification_service.create(
                user_id=farmer_uid,
                notification_type=NotificationType.ORDER,
                title="New order received",
                message=(
                    f"New order {order_code} placed on {created_str}: {crop_summary}. "
                    f"Status: {order.status.value}. View at /farmer/orders"
                ),
                related_entity_type="order",
                related_entity_id=order.id,
            )

        # 2. Notify assigned hub staff for picking
        if order.hub_id is not None:
            staff_res = await self.repository.session.execute(
                select(HubStaff.user_id).where(HubStaff.hub_id == order.hub_id)
            )
            for staff_uid in set(staff_res.scalars()):
                await self.notification_service.create(
                    user_id=staff_uid,
                    notification_type=NotificationType.ORDER,
                    title="New order assigned for picking",
                    message=(
                        f"Order {order_code} ({len(order.items)} items) assigned to your hub for picking. "
                        f"Status: {order.status.value}. View at /hub-staff/operations"
                    ),
                    related_entity_type="order",
                    related_entity_id=order.id,
                )
