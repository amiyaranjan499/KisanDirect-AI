from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import inspect

from backend.app.models import AvailabilityStatus, Cart, CartItem, Consumer, CropListing, Farmer, Order, OrderItem, OrderStatus, Payment, PaymentStatus, User
from backend.app.services.order_state import ORDER_TRANSITIONS, assert_transition


class OrdersRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create_cart(self, consumer_id: UUID) -> Cart:
        result = await self.session.execute(
            select(Cart).where(Cart.consumer_id == consumer_id).options(
                selectinload(Cart.items).selectinload(CartItem.listing).selectinload(CropListing.crop),
                selectinload(Cart.items).selectinload(CartItem.listing).selectinload(CropListing.farmer),
            )
        )
        cart = result.scalar_one_or_none()
        if cart is None:
            cart = Cart(consumer_id=consumer_id)
            self.session.add(cart)
            await self.session.commit()
            result = await self.session.execute(
                select(Cart).where(Cart.id == cart.id).options(
                    selectinload(Cart.items).selectinload(CartItem.listing).selectinload(CropListing.crop),
                    selectinload(Cart.items).selectinload(CartItem.listing).selectinload(CropListing.farmer),
                )
            )
            cart = result.scalar_one()
        return cart

    async def get_cart_item(self, consumer_id: UUID, item_id: UUID) -> CartItem | None:
        result = await self.session.execute(
            select(CartItem).join(CartItem.cart).where(Cart.consumer_id == consumer_id, CartItem.id == item_id).options(selectinload(CartItem.listing).selectinload(CropListing.crop), selectinload(CartItem.listing).selectinload(CropListing.farmer))
        )
        return result.scalar_one_or_none()

    async def get_cart_item_for_listing(self, consumer_id: UUID, listing_id: UUID) -> CartItem | None:
        result = await self.session.execute(
            select(CartItem).join(CartItem.cart).where(Cart.consumer_id == consumer_id, CartItem.listing_id == listing_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_listing_for_update(self, listing_id: UUID) -> CropListing | None:
        result = await self.session.execute(
            select(CropListing).where(CropListing.id == listing_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def add_or_update_item(self, consumer_id: UUID, listing_id: UUID, quantity: Decimal) -> CartItem:
        cart = await self.get_or_create_cart(consumer_id)
        listing = await self.get_listing_for_update(listing_id)
        if listing is None:
            raise LookupError("Crop listing not found")
        item = await self.get_cart_item_for_listing(consumer_id, listing_id)
        new_quantity = quantity + (item.quantity if item else Decimal("0"))
        self._validate_listing(listing, new_quantity)
        if item is None:
            item = CartItem(cart_id=cart.id, listing_id=listing_id, quantity=quantity)
            self.session.add(item)
        else:
            item.quantity = new_quantity
        await self.session.commit()
        return await self.get_cart_item(consumer_id, item.id)

    async def update_item(self, consumer_id: UUID, item_id: UUID, quantity: Decimal) -> CartItem:
        item = await self.get_cart_item(consumer_id, item_id)
        if item is None:
            raise LookupError("Cart item not found")
        listing = await self.get_listing_for_update(item.listing_id)
        if listing is None:
            raise LookupError("Crop listing not found")
        self._validate_listing(listing, quantity)
        item.quantity = quantity
        await self.session.commit()
        return await self.get_cart_item(consumer_id, item_id)

    @staticmethod
    def _validate_listing(listing: CropListing, quantity: Decimal) -> None:
        if listing.availability_status is not AvailabilityStatus.AVAILABLE:
            raise ValueError("Crop listing is not active")
        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if quantity < listing.minimum_order_quantity:
            raise ValueError("Quantity is below the minimum order quantity")
        if quantity > listing.quantity:
            raise ValueError("Quantity exceeds available stock")

    async def remove_item(self, consumer_id: UUID, item_id: UUID) -> None:
        item = await self.get_cart_item(consumer_id, item_id)
        if item is None:
            raise LookupError("Cart item not found")
        await self.session.delete(item)
        await self.session.commit()

    async def clear_cart(self, consumer_id: UUID) -> None:
        cart = await self.get_or_create_cart(consumer_id)
        for item in list(cart.items):
            await self.session.delete(item)
        await self.session.commit()

    async def checkout(self, consumer_id: UUID) -> Order:
        await self.session.rollback()
        async with self.session.begin():
            cart_result = await self.session.execute(select(Cart).where(Cart.consumer_id == consumer_id).with_for_update())
            cart = cart_result.scalar_one_or_none()
            if cart is None:
                raise ValueError("Cart is empty")
            item_result = await self.session.execute(select(CartItem).where(CartItem.cart_id == cart.id).with_for_update())
            cart_items = list(item_result.scalars().all())
            if not cart_items:
                raise ValueError("Cart is empty")
            order = Order(consumer_id=consumer_id, status=OrderStatus.PENDING, total_amount=Decimal("0"))
            self.session.add(order)
            await self.session.flush()
            total = Decimal("0")
            for cart_item in cart_items:
                listing = await self.get_listing_for_update(cart_item.listing_id)
                if listing is None:
                    raise ValueError("A cart listing no longer exists")
                self._validate_listing(listing, cart_item.quantity)
                unit_price = Decimal(listing.asking_price)
                subtotal = (unit_price * cart_item.quantity).quantize(Decimal("0.01"))
                total += subtotal
                listing.quantity -= cart_item.quantity
                if listing.quantity <= 0:
                    listing.availability_status = AvailabilityStatus.SOLD_OUT
                self.session.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=cart_item.quantity, unit_price=unit_price, subtotal=subtotal))
                await self.session.delete(cart_item)
            order.total_amount = total
        return await self.get_order(order.id, consumer_id=consumer_id)

    async def get_order(self, order_id: UUID, *, consumer_id: UUID | None = None, farmer_user_id: UUID | None = None) -> Order | None:
        statement = select(Order).where(Order.id == order_id).options(
            selectinload(Order.payment),
            selectinload(Order.delivery),
            selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
            selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer),
        )
        if consumer_id is not None:
            statement = statement.where(Order.consumer_id == consumer_id)
        if farmer_user_id is not None:
            statement = statement.join(Order.items).join(OrderItem.listing).join(CropListing.farmer).where(Farmer.user_id == farmer_user_id)
        result = await self.session.execute(statement)
        return result.unique().scalar_one_or_none()

    async def consumer_orders(self, consumer_id: UUID, page: int, page_size: int) -> tuple[list[Order], int]:
        base = select(Order).where(Order.consumer_id == consumer_id)
        total = int((await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
        result = await self.session.execute(
            base.order_by(Order.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .options(
                selectinload(Order.payment),
                selectinload(Order.delivery),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer),
            )
        )
        return list(result.unique().scalars().all()), total

    async def farmer_orders(self, farmer_user_id: UUID, page: int, page_size: int) -> tuple[list[Order], int]:
        base = select(Order).join(Order.items).join(OrderItem.listing).join(CropListing.farmer).where(Farmer.user_id == farmer_user_id).distinct()
        total = int((await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
        result = await self.session.execute(base.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size).options(selectinload(Order.payment), selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop), selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer)))
        return list(result.unique().scalars().all()), total

    async def update_status(self, order: Order, status: OrderStatus) -> Order:
        order_id = inspect(order).identity[0]
        await self.session.rollback()
        async with self.session.begin():
            locked = await self.session.execute(select(Order).where(Order.id == order_id).with_for_update())
            order = locked.scalar_one()
            assert_transition(ORDER_TRANSITIONS, order.status, status)
            order.status = status
            if status is OrderStatus.CANCELLED:
                await self._restore_stock(order)
        return await self.get_order(order_id)

    async def _restore_stock(self, order: Order) -> None:
        if order.stock_restored:
            return
        items = await self.session.execute(
            select(OrderItem).where(OrderItem.order_id == order.id).with_for_update()
        )
        for item in items.scalars():
            listing_result = await self.session.execute(
                select(CropListing).where(CropListing.id == item.listing_id).with_for_update()
            )
            listing = listing_result.scalar_one()
            listing.quantity += item.quantity
            if listing.availability_status is AvailabilityStatus.SOLD_OUT:
                listing.availability_status = AvailabilityStatus.AVAILABLE
        order.stock_restored = True

    async def initiate_test_payment(self, consumer_id: UUID, order_id: UUID, outcome: str) -> Payment:
        await self.session.rollback()
        async with self.session.begin():
            result = await self.session.execute(select(Order).where(Order.id == order_id, Order.consumer_id == consumer_id).with_for_update())
            order = result.scalar_one_or_none()
            if order is None:
                raise LookupError("Order not found")
            if order.status not in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
                raise ValueError("Order is not payable")
            payment_result = await self.session.execute(select(Payment).where(Payment.order_id == order.id).with_for_update())
            payment = payment_result.scalar_one_or_none()
            if payment is not None and payment.status in {PaymentStatus.PAID, PaymentStatus.SUCCESSFUL}:
                raise ValueError("Order already has a successful payment")
            status_map = {"success": PaymentStatus.SUCCESSFUL, "failed": PaymentStatus.FAILED, "cancelled": PaymentStatus.CANCELLED}
            if payment is None:
                payment = Payment(order_id=order.id, amount=order.total_amount, status=status_map[outcome], provider_reference=f"TEST-{uuid4()}", payment_method="TEST_SANDBOX", is_test=True)
                self.session.add(payment)
            else:
                payment.amount = order.total_amount
                payment.status = status_map[outcome]
                payment.provider_reference = f"TEST-{uuid4()}"
                payment.payment_method = "TEST_SANDBOX"
                payment.is_test = True
            if outcome == "success" and order.status is OrderStatus.PENDING:
                assert_transition(ORDER_TRANSITIONS, order.status, OrderStatus.CONFIRMED)
                order.status = OrderStatus.CONFIRMED
            elif outcome in {"failed", "cancelled"}:
                await self._restore_stock(order)
            await self.session.flush()
        return await self.get_payment(payment.id, consumer_id)

    async def get_payment(self, payment_id: UUID, consumer_id: UUID) -> Payment | None:
        result = await self.session.execute(select(Payment).join(Payment.order).where(Payment.id == payment_id, Order.consumer_id == consumer_id))
        return result.scalar_one_or_none()
