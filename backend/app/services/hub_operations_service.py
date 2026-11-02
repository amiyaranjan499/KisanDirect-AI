from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    AvailabilityStatus,
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStaff,
    HubStockDelivery,
    NotificationType,
    Order,
    OrderItem,
    Shipment,
    User,
    UserRole,
)
from backend.app.repositories.hub_operations_repository import HubOperationsRepository
from backend.app.schemas.hub_operations import (
    FarmerHubOptionResponse,
    HubOperationsOverviewResponse,
    HubOrderItemResponse,
    HubOrderToPackResponse,
    HubShipmentResponse,
    HubStaffHubResponse,
    StockDeliveryCreate,
    StockDeliveryResponse,
)
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)
from backend.app.models import ShipmentStatus


class HubOperationsService:
    STOCK_DELIVERY_TRANSITIONS = {"PENDING": {"RECEIVED"}, "RECEIVED": set()}

    def __init__(
        self,
        session: AsyncSession,
        repository: HubOperationsRepository,
        lifecycle: OrderLifecycleService,
    ) -> None:
        self.session = session
        self.repository = repository
        self.lifecycle = lifecycle

    async def farmer_hubs(
        self, actor: LifecycleActor
    ) -> list[FarmerHubOptionResponse]:
        farmer_user_id = await self._validate_actor(actor, UserRole.FARMER)
        farmer = await self.session.scalar(
            select(Farmer).where(Farmer.user_id == farmer_user_id)
        )
        farmer_id = farmer.id if farmer else None
        return [
            FarmerHubOptionResponse(
                id=hub.id,
                name=hub.name,
                address=hub.address,
                farmer_id=hub.farmer_id,
                facility_type="FARMER_OWNED" if hub.farmer_id else "PLATFORM",
                is_owned=bool(farmer_id and hub.farmer_id == farmer_id),
            )
            for hub in await self.repository.list_active_hubs()
        ]

    async def submit_stock_delivery(
        self, actor: LifecycleActor, payload: StockDeliveryCreate
    ) -> StockDeliveryResponse:
        async with self._transaction():
            farmer_user_id = await self._validate_actor(actor, UserRole.FARMER)
            listing = await self.repository.get_farmer_listing_for_update(
                payload.listing_id, farmer_user_id
            )
            if listing is None:
                raise LifecycleNotFound("Farmer listing not found")
            if listing.availability_status is not AvailabilityStatus.AVAILABLE:
                raise LifecycleConflict(
                    "Only available crop listings can be delivered to a hub"
                )
            hub = await self.repository.get_active_hub(payload.hub_id)
            if hub is None:
                raise LifecycleNotFound("Active hub not found")
            delivery = await self.repository.create_stock_delivery(
                hub_id=hub.id,
                listing_id=listing.id,
                farmer_user_id=farmer_user_id,
                quantity=payload.quantity,
            )
            await self.session.flush()
            await self.session.refresh(delivery)

            if self.lifecycle.notifications is not None:
                staff_users = await self.session.execute(
                    select(HubStaff.user_id).where(HubStaff.hub_id == hub.id)
                )
                for staff_id in staff_users.scalars():
                    await self.lifecycle.notifications.stage(
                        user_id=staff_id,
                        notification_type=NotificationType.ORDER,
                        title="Incoming produce delivery",
                        message=(
                            f"New produce delivery submitted: {delivery.quantity} {listing.unit} of "
                            f"{listing.crop.name} from {listing.farmer.name}."
                        ),
                        related_entity_type="hub_stock_delivery",
                        related_entity_id=delivery.id,
                    )

            return self._delivery_response(
                delivery, hub, listing, listing.crop.name, listing.farmer.name
            )

    async def farmer_stock_deliveries(
        self, actor: LifecycleActor
    ) -> list[StockDeliveryResponse]:
        farmer_user_id = await self._validate_actor(actor, UserRole.FARMER)
        rows = await self.repository.farmer_stock_deliveries(farmer_user_id)
        return [
            self._delivery_response(delivery, hub, listing, crop.name, farmer.name)
            for delivery, hub, listing, crop, farmer in rows
        ]

    async def staff_hubs(
        self, actor: LifecycleActor
    ) -> list[HubStaffHubResponse]:
        user_id = await self._validate_actor(actor, UserRole.HUB_STAFF)
        return [
            HubStaffHubResponse(id=hub.id, name=hub.name, address=hub.address)
            for hub in await self.repository.list_staff_hubs(user_id)
        ]

    async def overview(
        self, actor: LifecycleActor, hub_id: UUID
    ) -> HubOperationsOverviewResponse:
        user_id = await self._validate_actor(actor, UserRole.HUB_STAFF)
        if not await self.repository.is_staff_for_hub(user_id, hub_id):
            raise LifecyclePermissionError("Hub staff are not assigned to this hub")
        hub = await self.repository.get_hub(hub_id)
        if hub is None:
            raise LifecycleNotFound("Hub not found")
        deliveries, orders, packing_shipments, ready_shipments, completed_shipments = (
            await self.repository.hub_overview(hub_id)
        )
        return HubOperationsOverviewResponse(
            hub=HubStaffHubResponse(id=hub.id, name=hub.name, address=hub.address),
            incoming_deliveries=[
                self._delivery_response(
                    delivery, hub, listing, crop.name, farmer.name
                )
                for delivery, listing, crop, farmer in deliveries
            ],
            orders_to_pack=[
                self._order_response(order) for order in orders
            ],
            packing_shipments=[
                self._shipment_response(shipment) for shipment in packing_shipments
            ],
            ready_shipments=[
                self._shipment_response(shipment) for shipment in ready_shipments
            ],
            completed_shipments=[
                self._shipment_response(shipment) for shipment in completed_shipments
            ],
        )

    async def receive_stock_delivery(
        self,
        actor: LifecycleActor,
        hub_id: UUID,
        delivery_id: UUID,
        received_quantity: Decimal | None = None,
    ) -> StockDeliveryResponse:
        async with self._transaction():
            user_id = await self._validate_actor(actor, UserRole.HUB_STAFF)
            if not await self.repository.is_staff_for_hub(user_id, hub_id):
                raise LifecyclePermissionError("Hub staff are not assigned to this hub")
            delivery = await self.repository.get_stock_delivery_for_update(delivery_id)
            if delivery is None or delivery.hub_id != hub_id:
                raise LifecycleNotFound("Incoming stock delivery not found")
            if delivery.status == "RECEIVED":
                return await self._loaded_delivery_response(delivery)
            self._assert_stock_delivery_transition(
                delivery.status, "RECEIVED"
            )
            accepted_qty = (
                received_quantity
                if received_quantity is not None and received_quantity > 0
                else delivery.quantity
            )
            delivery.quantity = accepted_qty
            await self.repository.increment_hub_stock(
                delivery.hub_id, delivery.listing_id, accepted_qty
            )
            delivery.status = "RECEIVED"
            delivery.received_by_user_id = user_id
            delivery.received_at = datetime.now(timezone.utc)
            await self.session.flush()

            # Notify the farmer who supplied the produce
            if self.lifecycle.notifications is not None:
                listing_row = await self.session.execute(
                    select(CropListing)
                    .where(CropListing.id == delivery.listing_id)
                    .options(selectinload(CropListing.crop))
                )
                listing = listing_row.scalar_one_or_none()
                crop_name = listing.crop.name if listing and listing.crop else "produce"
                hub = await self.repository.get_hub(hub_id)
                hub_name = hub.name if hub else "hub"
                await self.lifecycle.notifications.stage(
                    user_id=delivery.farmer_user_id,
                    notification_type=NotificationType.ORDER,
                    title="Produce received at hub",
                    message=(
                        f"Your delivery of {accepted_qty} {listing.unit if listing else 'kg'} of "
                        f"{crop_name} was verified and received at {hub_name}. Produce is now available for orders."
                    ),
                    related_entity_type="hub_stock_delivery",
                    related_entity_id=delivery.id,
                )

            return await self._loaded_delivery_response(delivery)

    async def start_packing(
        self, actor: LifecycleActor, hub_id: UUID, order_id: UUID
    ) -> HubShipmentResponse:
        async with self._transaction():
            user_id = await self._validate_actor(actor, UserRole.HUB_STAFF)
            if not await self.repository.is_staff_for_hub(user_id, hub_id):
                raise LifecyclePermissionError("Hub staff are not assigned to this hub")
            if not await self.repository.order_is_assigned_to_hub(order_id, hub_id):
                raise LifecycleNotFound("Hub order not found")
            shipment = await self.lifecycle.create_shipment(
                order_id,
                actor,
                hub_id=hub_id,
            )
            return await self._shipment_response_by_id(shipment.id)

    async def mark_ready(
        self, actor: LifecycleActor, hub_id: UUID, shipment_id: UUID
    ) -> HubShipmentResponse:
        async with self._transaction():
            user_id = await self._validate_actor(actor, UserRole.HUB_STAFF)
            if not await self.repository.is_staff_for_hub(user_id, hub_id):
                raise LifecyclePermissionError("Hub staff are not assigned to this hub")
            shipment = await self.session.get(Shipment, shipment_id)
            if shipment is None or shipment.hub_id != hub_id:
                raise LifecycleNotFound("Packing shipment not found")
            await self.lifecycle.transition_shipment(
                shipment_id,
                actor,
                ShipmentStatus.READY_FOR_PICKUP,
            )
            return await self._shipment_response_by_id(shipment_id)

    async def _loaded_delivery_response(
        self, delivery: HubStockDelivery
    ) -> StockDeliveryResponse:
        rows = await self.session.execute(
            select(HubStockDelivery, Hub, CropListing, Crop, Farmer)
            .join(Hub, Hub.id == HubStockDelivery.hub_id)
            .join(CropListing, CropListing.id == HubStockDelivery.listing_id)
            .join(Crop, Crop.id == CropListing.crop_id)
            .join(Farmer, Farmer.user_id == HubStockDelivery.farmer_user_id)
            .where(HubStockDelivery.id == delivery.id)
        )
        row = rows.one_or_none()
        if row is None:
            raise LifecycleNotFound("Incoming stock delivery not found")
        delivery, hub, listing, crop, farmer = row
        return self._delivery_response(
            delivery, hub, listing, crop.name, farmer.name
        )

    async def _shipment_response_by_id(self, shipment_id: UUID) -> HubShipmentResponse:
        result = await self.session.execute(
            select(Shipment)
            .where(Shipment.id == shipment_id)
            .options(
                selectinload(Shipment.order).selectinload(Order.consumer),
                selectinload(Shipment.order)
                .selectinload(Order.items)
                .selectinload(OrderItem.listing)
                .selectinload(CropListing.crop),
            )
        )
        shipment = result.scalar_one_or_none()
        if shipment is None:
            raise LifecycleNotFound("Shipment not found")
        return self._shipment_response(shipment)

    @staticmethod
    def _order_response(order: Order) -> HubOrderToPackResponse:
        farmer_name = None
        for item in order.items:
            if item.listing and item.listing.farmer:
                farmer_name = item.listing.farmer.name
                break
        address = None
        city = None
        if order.delivery:
            address = order.delivery.dropoff_address
            city = order.delivery.city

        return HubOrderToPackResponse(
            id=order.id,
            consumer_name=order.consumer.name if order.consumer else "Consumer",
            status=order.status.value,
            total_amount=order.total_amount,
            created_at=order.created_at,
            consumer_address=address,
            consumer_city=city,
            farmer_name=farmer_name,
            items=HubOperationsService._order_items(order),
        )

    @staticmethod
    def _shipment_response(shipment: Shipment) -> HubShipmentResponse:
        order = shipment.order
        rider_name = None
        rider_vehicle = None
        if shipment.rider:
            rider_name = shipment.rider.display_name or "Rider Partner"
            rider_vehicle = shipment.rider.vehicle_type

        return HubShipmentResponse(
            id=shipment.id,
            order_id=order.id,
            consumer_name=order.consumer.name if order.consumer else "Consumer",
            status=shipment.status.value,
            total_amount=order.total_amount,
            promised_window_start=shipment.promised_window_start,
            promised_window_end=shipment.promised_window_end,
            rider_name=rider_name,
            rider_vehicle=rider_vehicle,
            dropoff_address=shipment.dropoff_address_snapshot,
            items=HubOperationsService._order_items(order),
        )

    @staticmethod
    def _order_items(order: Order) -> list[HubOrderItemResponse]:
        return [
            HubOrderItemResponse(
                crop_name=item.listing.crop.name,
                quantity=item.quantity,
                unit=item.listing.unit,
            )
            for item in order.items
        ]

    @staticmethod
    def _delivery_response(
        delivery: HubStockDelivery,
        hub: Hub,
        listing: CropListing,
        crop_name: str,
        farmer_name: str,
    ) -> StockDeliveryResponse:
        return StockDeliveryResponse(
            id=delivery.id,
            hub_id=hub.id,
            hub_name=hub.name,
            farmer_name=farmer_name,
            listing_id=listing.id,
            crop_name=crop_name,
            unit=listing.unit,
            quantity=delivery.quantity,
            status=delivery.status,
            created_at=delivery.created_at,
            received_at=delivery.received_at,
        )

    @staticmethod
    def _assert_stock_delivery_transition(current: str, target: str) -> None:
        if target not in HubOperationsService.STOCK_DELIVERY_TRANSITIONS.get(
            current, set()
        ):
            raise LifecycleConflict(
                f"Stock delivery cannot transition from {current} to {target}"
            )

    async def _validate_actor(
        self, actor: LifecycleActor, expected_role: UserRole
    ) -> UUID:
        if actor.role is not expected_role or actor.user_id is None:
            raise LifecyclePermissionError(
                f"Only {expected_role.value.lower().replace('_', ' ')} may perform this action"
            )
        active_user = await self.session.scalar(
            select(User.id).where(
                User.id == actor.user_id,
                User.role == expected_role,
                User.is_active.is_(True),
            )
        )
        if active_user is None:
            raise LifecyclePermissionError("Actor is not an active authorized user")
        return actor.user_id

    @asynccontextmanager
    async def _transaction(self) -> AsyncGenerator[None, None]:
        async with self.session.begin_nested():
            yield
