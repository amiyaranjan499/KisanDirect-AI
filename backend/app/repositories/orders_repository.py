from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    AvailabilityStatus,
    Cart,
    CartItem,
    CropListing,
    Farmer,
    Order,
    OrderItem,
    Payment,
)


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
            order = Order(consumer_id=consumer_id, total_amount=Decimal("0"))
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

    async def get_payment(self, payment_id: UUID, consumer_id: UUID) -> Payment | None:
        result = await self.session.execute(select(Payment).join(Payment.order).where(Payment.id == payment_id, Order.consumer_id == consumer_id))
        return result.scalar_one_or_none()
