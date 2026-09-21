from decimal import Decimal
from math import ceil
from uuid import UUID

from backend.app.models import NotificationType, Order, OrderStatus, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.orders_repository import OrdersRepository
from backend.app.schemas.orders import CartItemResponse, CartResponse, OrderItemResponse, OrderPage, OrderResponse
from backend.app.schemas.payments import PaymentResponse


class OrdersService:
    def __init__(self, repository: OrdersRepository, consumer_repository: ConsumerRepository, notification_service=None) -> None:
        self.repository = repository
        self.consumer_repository = consumer_repository
        self.notification_service = notification_service

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
        return OrderResponse(id=order.id, consumer_id=order.consumer_id, status=order.status.value, total_amount=order.total_amount, created_at=order.created_at, updated_at=order.updated_at, items=items, payment=payment)

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

    async def checkout(self, user_id: UUID) -> OrderResponse:
        consumer_id = await self.consumer_id(user_id)
        order = await self.repository.checkout(consumer_id)
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

    async def update_status(self, user_id: UUID, role: UserRole, order_id: UUID, status: str) -> OrderResponse:
        try:
            requested = OrderStatus(status)
        except ValueError as exc:
            raise ValueError("Invalid order status") from exc
        if role is UserRole.CONSUMER:
            if requested not in {OrderStatus.CANCELLED, OrderStatus.COMPLETED}:
                raise PermissionError("Consumers may cancel orders or confirm receipt")
            order = await self.repository.get_order(order_id, consumer_id=await self.consumer_id(user_id))
            if order is None:
                raise LookupError("Order not found")
            if requested is OrderStatus.CANCELLED and order.status not in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
                raise LookupError("Order cannot be cancelled")
            if requested is OrderStatus.COMPLETED and order.status is not OrderStatus.DELIVERED:
                raise ValueError("Receipt can only be confirmed after delivery")
        elif role is UserRole.FARMER:
            if requested is not OrderStatus.CONFIRMED:
                raise PermissionError("Farmers may only confirm orders")
            order = await self.repository.get_order(order_id, farmer_user_id=user_id)
            if order is None:
                raise LookupError("Order not found")
        else:
            raise PermissionError("Role cannot update this order")

        updated = await self.repository.update_status(order, requested)
        await self._notify_status_update(updated, role, requested)
        return self.order_response(updated, user_id if role is UserRole.FARMER else None)

    async def initiate_test_payment(self, user_id: UUID, order_id: UUID, outcome: str) -> PaymentResponse:
        payment = await self.repository.initiate_test_payment(await self.consumer_id(user_id), order_id, outcome)
        await self._notify_payment_result(payment, user_id)
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

    async def _notify_status_update(self, order, role, status: OrderStatus) -> None:
        if self.notification_service is None:
            return
        if role is UserRole.CONSUMER and status is OrderStatus.CANCELLED:
            for item in order.items:
                await self.notification_service.create(
                    user_id=item.listing.farmer.user_id,
                    notification_type=NotificationType.ORDER,
                    title="Order cancelled",
                    message=f"Order {str(order.id)[:8]} was cancelled by the consumer.",
                    related_entity_type="order",
                    related_entity_id=order.id,
                )
        elif role is UserRole.FARMER and status in {OrderStatus.CONFIRMED, OrderStatus.COMPLETED}:
            consumer = await self.consumer_repository.get_profile_by_id(order.consumer_id)
            if consumer is None:
                return
            await self.notification_service.create(
                user_id=consumer.user_id,
                notification_type=NotificationType.ORDER,
                title="Order confirmed" if status is OrderStatus.CONFIRMED else "Order completed",
                message=f"Your order {str(order.id)[:8]} has been {status.value.lower()}.",
                related_entity_type="order",
                related_entity_id=order.id,
            )

    async def _notify_payment_result(self, payment, consumer_user_id: UUID) -> None:
        if self.notification_service is None:
            return
        title = "Payment successful" if payment.status in {"SUCCESSFUL", "PAID"} else "Payment failed"
        message = (
            f"Your payment for order {str(payment.order_id)[:8]} was successful."
            if payment.status in {"SUCCESSFUL", "PAID"}
            else f"Your payment for order {str(payment.order_id)[:8]} failed. Please try again."
        )
        await self.notification_service.create(
            user_id=consumer_user_id,
            notification_type=NotificationType.PAYMENT,
            title=title,
            message=message,
            related_entity_type="order",
            related_entity_id=payment.order_id,
        )
