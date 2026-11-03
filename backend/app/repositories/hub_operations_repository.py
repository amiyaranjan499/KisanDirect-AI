from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStaff,
    HubStatus,
    HubStock,
    HubStockDelivery,
    Order,
    OrderItem,
    OrderStatus,
    Shipment,
    ShipmentStatus,
)


class HubOperationsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_active_hubs(self) -> list[Hub]:
        result = await self.session.execute(
            select(Hub)
            .where(Hub.status == HubStatus.ACTIVE)
            .order_by(Hub.name, Hub.id)
        )
        return list(result.scalars().all())

    async def get_farmer_listing_for_update(
        self, listing_id: UUID, farmer_user_id: UUID
    ) -> CropListing | None:
        result = await self.session.execute(
            select(CropListing)
            .join(Farmer, Farmer.id == CropListing.farmer_id)
            .where(
                CropListing.id == listing_id,
                Farmer.user_id == farmer_user_id,
            )
            .options(
                selectinload(CropListing.crop),
                selectinload(CropListing.farmer),
            )
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_active_hub(self, hub_id: UUID) -> Hub | None:
        return await self.session.scalar(
            select(Hub).where(Hub.id == hub_id, Hub.status == HubStatus.ACTIVE)
        )

    async def create_stock_delivery(
        self,
        *,
        hub_id: UUID,
        listing_id: UUID,
        farmer_user_id: UUID,
        quantity: Decimal,
    ) -> HubStockDelivery:
        delivery = HubStockDelivery(
            hub_id=hub_id,
            listing_id=listing_id,
            farmer_user_id=farmer_user_id,
            quantity=quantity,
            status="PENDING",
        )
        self.session.add(delivery)
        await self.session.flush()
        return delivery

    async def farmer_stock_deliveries(
        self, farmer_user_id: UUID
    ) -> list[tuple[HubStockDelivery, Hub, CropListing, Crop, Farmer]]:
        result = await self.session.execute(
            select(HubStockDelivery, Hub, CropListing, Crop, Farmer)
            .join(Hub, Hub.id == HubStockDelivery.hub_id)
            .join(CropListing, CropListing.id == HubStockDelivery.listing_id)
            .join(Crop, Crop.id == CropListing.crop_id)
            .join(Farmer, Farmer.user_id == HubStockDelivery.farmer_user_id)
            .where(HubStockDelivery.farmer_user_id == farmer_user_id)
            .order_by(HubStockDelivery.created_at.desc(), HubStockDelivery.id)
        )
        return list(result.all())

    async def list_staff_hubs(self, user_id: UUID) -> list[Hub]:
        result = await self.session.execute(
            select(Hub)
            .join(HubStaff, HubStaff.hub_id == Hub.id)
            .where(HubStaff.user_id == user_id)
            .order_by(Hub.name, Hub.id)
        )
        return list(result.scalars().all())

    async def is_staff_for_hub(self, user_id: UUID, hub_id: UUID) -> bool:
        return (
            await self.session.scalar(
                select(HubStaff.user_id).where(
                    HubStaff.user_id == user_id,
                    HubStaff.hub_id == hub_id,
                )
            )
            is not None
        )

    async def get_hub(self, hub_id: UUID) -> Hub | None:
        return await self.session.get(Hub, hub_id)

    async def order_is_assigned_to_hub(self, order_id: UUID, hub_id: UUID) -> bool:
        return (
            await self.session.scalar(
                select(Order.id).where(
                    Order.id == order_id,
                    Order.hub_id == hub_id,
                )
            )
            is not None
        )

    async def hub_overview(
        self, hub_id: UUID
    ) -> tuple[
        list[tuple[HubStockDelivery, CropListing, Crop, Farmer]],
        list[Order],
        list[Shipment],
        list[Shipment],
        list[Shipment],
    ]:
        delivery_result = await self.session.execute(
            select(HubStockDelivery, CropListing, Crop, Farmer)
            .join(CropListing, CropListing.id == HubStockDelivery.listing_id)
            .join(Crop, Crop.id == CropListing.crop_id)
            .join(Farmer, Farmer.user_id == HubStockDelivery.farmer_user_id)
            .where(
                HubStockDelivery.hub_id == hub_id,
                HubStockDelivery.status == "PENDING",
            )
            .order_by(HubStockDelivery.created_at, HubStockDelivery.id)
        )
        order_result = await self.session.execute(
            select(Order)
            .where(
                Order.hub_id == hub_id,
                Order.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING]),
                ~select(Shipment.id)
                .where(Shipment.order_id == Order.id)
                .exists(),
            )
            .options(
                selectinload(Order.consumer),
                selectinload(Order.delivery),
                selectinload(Order.items)
                .selectinload(OrderItem.listing)
                .options(
                    selectinload(CropListing.crop),
                    selectinload(CropListing.farmer),
                ),
            )
            .order_by(Order.created_at, Order.id)
        )
        shipment_result = await self.session.execute(
            select(Shipment)
            .join(Order, Order.id == Shipment.order_id)
            .where(
                Shipment.hub_id == hub_id,
                Shipment.status == ShipmentStatus.PACKING,
            )
            .options(
                selectinload(Shipment.rider),
                selectinload(Shipment.order).options(
                    selectinload(Order.consumer),
                    selectinload(Order.delivery),
                    selectinload(Order.items)
                    .selectinload(OrderItem.listing)
                    .options(
                        selectinload(CropListing.crop),
                        selectinload(CropListing.farmer),
                    ),
                ),
            )
            .order_by(Shipment.created_at, Shipment.id)
        )
        ready_result = await self.session.execute(
            select(Shipment)
            .join(Order, Order.id == Shipment.order_id)
            .where(
                Shipment.hub_id == hub_id,
                Shipment.status == ShipmentStatus.READY_FOR_PICKUP,
            )
            .options(
                selectinload(Shipment.rider),
                selectinload(Shipment.order).options(
                    selectinload(Order.consumer),
                    selectinload(Order.delivery),
                    selectinload(Order.items)
                    .selectinload(OrderItem.listing)
                    .options(
                        selectinload(CropListing.crop),
                        selectinload(CropListing.farmer),
                    ),
                ),
            )
            .order_by(Shipment.updated_at.desc(), Shipment.id)
            .limit(25)
        )
        completed_result = await self.session.execute(
            select(Shipment)
            .join(Order, Order.id == Shipment.order_id)
            .where(
                Shipment.hub_id == hub_id,
                Shipment.status.in_([
                    ShipmentStatus.OUT_FOR_DELIVERY,
                    ShipmentStatus.DELIVERED,
                ]),
            )
            .options(
                selectinload(Shipment.rider),
                selectinload(Shipment.order).options(
                    selectinload(Order.consumer),
                    selectinload(Order.delivery),
                    selectinload(Order.items)
                    .selectinload(OrderItem.listing)
                    .options(
                        selectinload(CropListing.crop),
                        selectinload(CropListing.farmer),
                    ),
                ),
            )
            .order_by(Shipment.updated_at.desc(), Shipment.id)
            .limit(25)
        )
        return (
            list(delivery_result.all()),
            list(order_result.scalars().unique().all()),
            list(shipment_result.scalars().unique().all()),
            list(ready_result.scalars().unique().all()),
            list(completed_result.scalars().unique().all()),
        )

    async def get_stock_delivery_for_update(
        self, delivery_id: UUID
    ) -> HubStockDelivery | None:
        result = await self.session.execute(
            select(HubStockDelivery)
            .where(HubStockDelivery.id == delivery_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def increment_hub_stock(
        self, hub_id: UUID, listing_id: UUID, quantity: Decimal
    ) -> None:
        statement = insert(HubStock).values(
            hub_id=hub_id,
            listing_id=listing_id,
            available_quantity=quantity,
        )
        await self.session.execute(
            statement.on_conflict_do_update(
                constraint="uq_hub_stock_hub_listing",
                set_={
                    "available_quantity": (
                        HubStock.available_quantity + statement.excluded.available_quantity
                    )
                },
            )
        )
