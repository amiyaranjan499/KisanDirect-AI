from decimal import Decimal
from math import ceil
from uuid import UUID

from backend.app.core.config import Settings
from backend.app.models import NotificationType, Order, OrderStatus, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
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
        self.lifecycle = OrderLifecycleService(repository.session, notification_service)

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
            items.append(CartItemResponse(id=item.id, listing_id=listing.id, crop_name=listing.crop.name, farmer_name=listing.farmer.name, quantity=item.quantity, available_quantity=listing.quantity, minimum_order_quantity=listing.minimum_order_quantity, unit=listing.unit, unit_price=listing.asking_price, subtotal=item_subtotal))
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
        await self.notification_service.create(
            user_id=consumer_user_id,
            notification_type=NotificationType.ORDER,
            title="Order created",
            message=f"Your order {str(order.id)[:8]} has been placed successfully.",
            related_entity_type="order",
            related_entity_id=order.id,
        )
        for item in order.items:
            farmer_user_id = item.listing.farmer.user_id
            if farmer_user_id == consumer_user_id:
                continue
            await self.notification_service.create(
                user_id=farmer_user_id,
                notification_type=NotificationType.ORDER,
                title="New order received",
                message=f"A new order for {item.listing.crop.name} has been placed.",
                related_entity_type="order",
                related_entity_id=order.id,
            )
