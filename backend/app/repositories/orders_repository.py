from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from geoalchemy2 import Geography, Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import Settings
from backend.app.models import (
    AvailabilityStatus,
    Cart,
    CartItem,
    CropListing,
    DeliverySlot,
    Farmer,
    Hub,
    HubStaff,
    HubStatus,
    HubStock,
    Order,
    OrderEvent,
    OrderItem,
    Payment,
    Rider,
    RiderLocation,
    ReservationStatus,
    Shipment,
    StockReservation,
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

    async def get_checkout_cart(self, consumer_id: UUID) -> Cart | None:
        result = await self.session.execute(
            select(Cart)
            .where(Cart.consumer_id == consumer_id)
            .options(
                selectinload(Cart.items)
                .selectinload(CartItem.listing)
                .selectinload(CropListing.crop),
                selectinload(Cart.items)
                .selectinload(CartItem.listing)
                .selectinload(CropListing.farmer),
            )
        )
        return result.scalar_one_or_none()

    async def checkout_hub_options(
        self,
        latitude: float,
        longitude: float,
        listing_ids: list[UUID],
        settings: Settings,
    ) -> list[dict]:
        point = func.ST_SetSRID(
            func.ST_MakePoint(longitude, latitude), 4326
        ).cast(Geography(geometry_type="POINT", srid=4326))
        distance_km = (func.ST_Distance(Hub.location, point) / 1000).label("distance_km")
        hub_rows = await self.session.execute(
            select(Hub, distance_km)
            .where(
                Hub.status == HubStatus.ACTIVE,
                func.ST_DWithin(
                    Hub.location,
                    point,
                    float(settings.hub_service_radius_km * 1000),
                ),
            )
            .order_by(distance_km, Hub.id)
        )
        hubs = hub_rows.all()
        if not hubs:
            return []

        slots_result = await self.session.execute(
            select(DeliverySlot)
            .where(
                DeliverySlot.hub_id.in_([hub.id for hub, _ in hubs]),
                DeliverySlot.starts_at > datetime.now(timezone.utc),
                DeliverySlot.booked_count < DeliverySlot.capacity,
            )
            .order_by(DeliverySlot.starts_at)
        )
        slots_by_hub: dict[UUID, list[DeliverySlot]] = {}
        for slot in slots_result.scalars():
            slots_by_hub.setdefault(slot.hub_id, []).append(slot)

        options: list[dict] = []
        for hub, distance in hubs:
            stock_by_listing: dict[UUID, Decimal] = {}
            if listing_ids:
                stock_rows = await self.session.execute(
                    select(HubStock.listing_id, HubStock.id, HubStock.available_quantity)
                    .where(
                        HubStock.hub_id == hub.id,
                        HubStock.listing_id.in_(listing_ids),
                    )
                )
                stock_by_id = {
                    listing_id: (stock_id, Decimal(quantity))
                    for listing_id, stock_id, quantity in stock_rows
                }
                if stock_by_id:
                    held_rows = await self.session.execute(
                        select(
                            StockReservation.hub_stock_id,
                            func.sum(StockReservation.quantity),
                        )
                        .where(
                            StockReservation.hub_stock_id.in_(
                                [row[0] for row in stock_by_id.values()]
                            ),
                            StockReservation.status == ReservationStatus.HOLD,
                            StockReservation.expires_at > datetime.now(timezone.utc),
                        )
                        .group_by(StockReservation.hub_stock_id)
                    )
                    held_by_stock = {
                        stock_id: Decimal(quantity)
                        for stock_id, quantity in held_rows
                    }
                    stock_by_listing = {
                        listing_id: max(
                            Decimal("0"),
                            quantity - held_by_stock.get(stock_id, Decimal("0")),
                        )
                        for listing_id, (stock_id, quantity) in stock_by_id.items()
                    }

            options.append(
                {
                    "hub": hub,
                    "distance_km": float(distance),
                    "stock_by_listing": stock_by_listing,
                    "slots": slots_by_hub.get(hub.id, []),
                }
            )
        return options

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

    async def get_tracking_order(self, order_id: UUID) -> Order | None:
        result = await self.session.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(
                selectinload(Order.consumer),
                selectinload(Order.hub),
                selectinload(Order.shipment).selectinload(Shipment.hub),
                selectinload(Order.shipment)
                .selectinload(Shipment.rider)
                .selectinload(Rider.user),
                selectinload(Order.items)
                .selectinload(OrderItem.listing)
                .selectinload(CropListing.crop),
                selectinload(Order.items)
                .selectinload(OrderItem.listing)
                .selectinload(CropListing.farmer),
            )
        )
        return result.scalar_one_or_none()

    async def order_events(self, order_id: UUID) -> list[OrderEvent]:
        result = await self.session.execute(
            select(OrderEvent)
            .where(OrderEvent.order_id == order_id)
            .order_by(OrderEvent.created_at, OrderEvent.id)
        )
        return list(result.scalars().all())

    async def has_farmer_access(self, order_id: UUID, user_id: UUID) -> bool:
        return bool(
            await self.session.scalar(
                select(OrderItem.id)
                .join(OrderItem.listing)
                .join(CropListing.farmer)
                .where(OrderItem.order_id == order_id, Farmer.user_id == user_id)
                .limit(1)
            )
        )

    async def has_hub_staff_access(self, hub_id: UUID | None, user_id: UUID) -> bool:
        if hub_id is None:
            return False
        return bool(
            await self.session.scalar(
                select(HubStaff.user_id)
                .where(HubStaff.user_id == user_id, HubStaff.hub_id == hub_id)
                .limit(1)
            )
        )

    async def hub_coordinates(
        self, hub_id: UUID
    ) -> tuple[float, float, datetime] | None:
        result = await self.session.execute(
            select(
                func.ST_Y(cast(Hub.location, Geometry)),
                func.ST_X(cast(Hub.location, Geometry)),
                Hub.updated_at,
            ).where(Hub.id == hub_id)
        )
        row = result.one_or_none()
        if row is None or row[0] is None or row[1] is None or row[2] is None:
            return None
        return float(row[0]), float(row[1]), row[2]

    async def latest_rider_location(
        self, rider_id: UUID
    ) -> tuple[float, float, datetime] | None:
        result = await self.session.execute(
            select(
                func.ST_Y(cast(RiderLocation.location, Geometry)),
                func.ST_X(cast(RiderLocation.location, Geometry)),
                RiderLocation.recorded_at,
            )
            .where(RiderLocation.rider_id == rider_id)
            .order_by(RiderLocation.recorded_at.desc(), RiderLocation.id.desc())
            .limit(1)
        )
        row = result.one_or_none()
        if row is None or row[0] is None or row[1] is None:
            return None
        return float(row[0]), float(row[1]), row[2]
