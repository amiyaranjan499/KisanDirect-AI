import asyncio
import logging
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    AdminAuditEvent,
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStaff,
    HubStock,
    HubStockDelivery,
    Notification,
    NotificationType,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Rider,
    RiderApprovalStatus,
    RiderLocation,
    Shipment,
    ShipmentStatus,
    User,
    UserRole,
)
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)
from backend.app.repositories.hub_operations_repository import HubOperationsRepository
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.orders_repository import OrdersRepository
from backend.app.schemas.hub_operations import StockDeliveryCreate
from backend.app.schemas.rider import RiderShipmentResponse
from backend.app.services.hub_operations_service import HubOperationsService
from backend.app.services.orders_service import OrdersService

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def seed(order_status: OrderStatus = OrderStatus.PENDING):
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer_user = User(
                email=f"lifecycle-consumer-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.CONSUMER,
            )
            other_consumer_user = User(
                email=f"lifecycle-other-consumer-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.CONSUMER,
            )
            farmer_user = User(
                email=f"lifecycle-farmer-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.FARMER,
            )
            hub_staff_user = User(
                email=f"lifecycle-hub-staff-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.HUB_STAFF,
            )
            admin_user = User(
                email=f"lifecycle-admin-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.ADMIN,
            )
            rider_user = User(
                email=f"lifecycle-rider-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.RIDER,
            )
            other_rider_user = User(
                email=f"lifecycle-other-rider-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.RIDER,
            )
            session.add_all(
                [
                    consumer_user,
                    other_consumer_user,
                    farmer_user,
                    hub_staff_user,
                    admin_user,
                    rider_user,
                    other_rider_user,
                ]
            )
            await session.flush()
            consumer = Consumer(user_id=consumer_user.id, name="Lifecycle Consumer")
            other_consumer = Consumer(
                user_id=other_consumer_user.id,
                name="Other Lifecycle Consumer",
            )
            farmer = Farmer(user_id=farmer_user.id, name="Lifecycle Farmer")
            hub = Hub(
                name="Lifecycle Hub",
                address="1 Hub Road",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751001",
            )
            rider = Rider(
                user_id=rider_user.id,
                vehicle_type="bicycle",
                approval_status=RiderApprovalStatus.APPROVED,
            )
            other_rider = Rider(
                user_id=other_rider_user.id,
                vehicle_type="bicycle",
                approval_status=RiderApprovalStatus.APPROVED,
            )
            session.add_all(
                [consumer, other_consumer, farmer, hub, rider, other_rider]
            )
            await session.flush()
            session.add(HubStaff(user_id=hub_staff_user.id, hub_id=hub.id))
            crop = Crop(name=f"Lifecycle Crop {uuid4()}")
            session.add(crop)
            await session.flush()
            listing = CropListing(
                crop_id=crop.id,
                farmer_id=farmer.id,
                quantity=Decimal("10"),
                unit="kg",
                asking_price=Decimal("12.50"),
                minimum_order_quantity=Decimal("1"),
                availability_status=AvailabilityStatus.SOLD_OUT,
            )
            order = Order(
                consumer_id=consumer.id,
                status=order_status,
                total_amount=Decimal("25.00"),
            )
            session.add_all([listing, order])
            await session.flush()
            session.add(
                OrderItem(
                    order_id=order.id,
                    listing_id=listing.id,
                    quantity=Decimal("2"),
                    unit_price=Decimal("12.50"),
                    subtotal=Decimal("25.00"),
                )
            )
            await session.commit()
            ids = {
                "consumer_user_id": consumer_user.id,
                "other_consumer_user_id": other_consumer_user.id,
                "farmer_user_id": farmer_user.id,
                "hub_staff_user_id": hub_staff_user.id,
                "admin_user_id": admin_user.id,
                "rider_user_id": rider_user.id,
                "other_rider_user_id": other_rider_user.id,
                "consumer_id": consumer.id,
                "rider_id": rider.id,
                "hub_id": hub.id,
                "order_id": order.id,
                "listing_id": listing.id,
                "user_ids": [
                    consumer_user.id,
                    other_consumer_user.id,
                    farmer_user.id,
                    hub_staff_user.id,
                    admin_user.id,
                    rider_user.id,
                    other_rider_user.id,
                ],
                "crop_id": crop.id,
            }
        await engine.dispose()
        return ids

    return asyncio.run(create())


def cleanup(data) -> None:
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(
                delete(Order).where(
                    Order.id.in_([data["order_id"], *data.get("extra_order_ids", [])])
                )
            )
            await session.execute(
                delete(HubStock).where(HubStock.listing_id == data["listing_id"])
            )
            await session.execute(
                delete(HubStockDelivery).where(
                    HubStockDelivery.listing_id == data["listing_id"]
                )
            )
            await session.execute(delete(CropListing).where(CropListing.id == data["listing_id"]))
            await session.execute(delete(Crop).where(Crop.id == data["crop_id"]))
            if data.get("extra_hub_ids"):
                await session.execute(
                    delete(Hub).where(Hub.id.in_(data["extra_hub_ids"]))
                )
            await session.execute(delete(Hub).where(Hub.id == data["hub_id"]))
            user_ids = data["user_ids"] + data.get("extra_user_ids", [])
            await session.execute(
                delete(AdminAuditEvent).where(
                    AdminAuditEvent.actor_user_id.in_(user_ids)
                )
            )
            await session.execute(delete(User).where(User.id.in_(user_ids)))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_order_cancellation_is_audited_and_repeated_transition_conflicts():
    data = seed()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            with pytest.raises(LifecyclePermissionError):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["other_consumer_user_id"], UserRole.CONSUMER),
                    OrderStatus.CANCELLED,
                )
            with pytest.raises(ValueError, match="reason is required"):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                    OrderStatus.CANCELLED,
                )
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                OrderStatus.CANCELLED,
            )
            with pytest.raises(LifecycleConflict, match="already CANCELLED"):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                    OrderStatus.CANCELLED,
                )
            events = list(
                (
                    await session.execute(
                        select(OrderEvent).where(OrderEvent.order_id == data["order_id"])
                    )
                )
                .scalars()
                .all()
            )
            order = await session.get(Order, data["order_id"])
            listing = await session.get(CropListing, data["listing_id"])
            notifications = list(
                (
                    await session.execute(
                        select(Notification).where(
                            Notification.related_entity_id == data["order_id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert [(event.from_status, event.to_status) for event in events] == [
                ("PENDING", "CANCELLED")
            ]
            assert order.stock_restored is True
            assert listing.quantity == Decimal("12")
            assert listing.availability_status is AvailabilityStatus.AVAILABLE
            assert notifications
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_order_actor_rules_and_operator_cancellation_reason():
    data = seed()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            with pytest.raises(LifecyclePermissionError):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                    OrderStatus.CONFIRMED,
                )
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                OrderStatus.CONFIRMED,
            )
            with pytest.raises(LifecyclePermissionError):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                    OrderStatus.PROCESSING,
                )
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                OrderStatus.PROCESSING,
            )
            with pytest.raises(LifecyclePermissionError):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                    OrderStatus.SHIPPED,
                )
            with pytest.raises(ValueError, match="reason is required"):
                await service.transition_order(
                    data["order_id"],
                    LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                    OrderStatus.CANCELLED,
                )
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                OrderStatus.CANCELLED,
                reason="Unable to fulfill",
            )
            order = await session.get(Order, data["order_id"])
            assert order.status is OrderStatus.CANCELLED
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_system_can_complete_a_delivered_order():
    data = seed(OrderStatus.DELIVERED)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            order = await OrderLifecycleService(session)._complete_order_after_delivery(
                data["order_id"]
            )
            events = list(
                (
                    await session.execute(
                        select(OrderEvent).where(OrderEvent.order_id == data["order_id"])
                    )
                )
                .scalars()
                .all()
            )
            assert order.status is OrderStatus.COMPLETED
            assert [(event.from_status, event.to_status) for event in events] == [
                ("DELIVERED", "COMPLETED")
            ]
            assert events[0].actor_user_id is None
            assert events[0].actor_role is None
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_hub_staff_can_transition_order_from_hub_stock_before_shipment():
    data = seed()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            session.add(
                HubStock(
                    hub_id=data["hub_id"],
                    listing_id=data["listing_id"],
                    available_quantity=Decimal("10"),
                )
            )
            await session.commit()
            service = OrderLifecycleService(session)
            actor = LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF)
            await service.transition_order(data["order_id"], actor, OrderStatus.CONFIRMED)
            await service.transition_order(data["order_id"], actor, OrderStatus.PROCESSING)
            order = await session.get(Order, data["order_id"])
            assert order.status is OrderStatus.PROCESSING
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_hub_stock_receipt_increments_once_and_is_hub_scoped():
    data = seed()
    extra_hub_id = uuid4()
    data["extra_hub_ids"] = [extra_hub_id]

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            other_hub = Hub(
                id=extra_hub_id,
                name="Other Lifecycle Hub",
                address="2 Hub Road",
                location=WKTElement("POINT(85.9 20.4)", srid=4326),
                pincode="751002",
            )
            session.add(other_hub)
            listing = await session.get(CropListing, data["listing_id"])
            listing.availability_status = AvailabilityStatus.AVAILABLE
            await session.flush()
            other_receipt = HubStockDelivery(
                hub_id=extra_hub_id,
                listing_id=data["listing_id"],
                farmer_user_id=data["farmer_user_id"],
                quantity=Decimal("5.000"),
                status="PENDING",
            )
            session.add(other_receipt)
            await session.commit()

            service = HubOperationsService(
                session,
                HubOperationsRepository(session),
                OrderLifecycleService(session),
            )
            farmer = LifecycleActor(data["farmer_user_id"], UserRole.FARMER)
            submitted = await service.submit_stock_delivery(
                farmer,
                StockDeliveryCreate(
                    hub_id=data["hub_id"],
                    listing_id=data["listing_id"],
                    quantity=Decimal("3.250"),
                ),
            )
            staff = LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF)
            received = await service.receive_stock_delivery(
                staff, data["hub_id"], submitted.id
            )
            repeated = await service.receive_stock_delivery(
                staff, data["hub_id"], submitted.id
            )
            assert received.status == repeated.status == "RECEIVED"
            assert received.received_at == repeated.received_at

            stock = await session.scalar(
                select(HubStock).where(
                    HubStock.hub_id == data["hub_id"],
                    HubStock.listing_id == data["listing_id"],
                )
            )
            assert stock.available_quantity == Decimal("3.250")
            with pytest.raises(LifecyclePermissionError):
                await service.receive_stock_delivery(
                    staff, extra_hub_id, other_receipt.id
                )
            assert await session.scalar(
                select(HubStock.id).where(
                    HubStock.hub_id == extra_hub_id,
                    HubStock.listing_id == data["listing_id"],
                )
            ) is None
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_hub_shipment_readiness_is_audited_and_requires_a_supplier():
    data = seed(OrderStatus.PROCESSING)
    data["extra_user_ids"] = []
    extra_hub_id = uuid4()
    data["extra_hub_ids"] = [extra_hub_id]
    extra_staff_id = uuid4()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            order = await session.get(Order, data["order_id"])
            order.hub_id = data["hub_id"]
            order.promised_window_start = datetime.now(timezone.utc)
            order.promised_window_end = order.promised_window_start + timedelta(hours=1)
            order.delivery_address = "Consumer address"
            session.add(
                HubStock(
                    hub_id=data["hub_id"],
                    listing_id=data["listing_id"],
                    available_quantity=Decimal("10.000"),
                )
            )
            other_hub = Hub(
                id=extra_hub_id,
                name="Assigned Elsewhere Hub",
                address="3 Hub Road",
                location=WKTElement("POINT(86.0 20.5)", srid=4326),
                pincode="751003",
            )
            extra_staff = User(
                id=extra_staff_id,
                email=f"lifecycle-other-hub-staff-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.HUB_STAFF,
            )
            outsider_farmer = User(
                email=f"lifecycle-outsider-farmer-{uuid4()}@example.com",
                hashed_password="not-used",
                role=UserRole.FARMER,
            )
            session.add_all([other_hub, extra_staff, outsider_farmer])
            await session.flush()
            session.add(HubStaff(user_id=extra_staff.id, hub_id=other_hub.id))
            await session.commit()
            data["extra_user_ids"].extend([outsider_farmer.id, extra_staff.id])

            lifecycle = OrderLifecycleService(session)
            hub_staff = LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF)
            operations = HubOperationsService(
                session, HubOperationsRepository(session), lifecycle
            )
            shipment_response = await operations.start_packing(
                hub_staff, data["hub_id"], data["order_id"]
            )
            with pytest.raises(LifecycleNotFound):
                await operations.mark_ready(
                    LifecycleActor(extra_staff.id, UserRole.HUB_STAFF),
                    extra_hub_id,
                    shipment_response.id,
                )
            with pytest.raises(LifecyclePermissionError):
                await lifecycle.transition_shipment(
                    shipment_response.id,
                    LifecycleActor(outsider_farmer.id, UserRole.FARMER),
                    ShipmentStatus.READY_FOR_PICKUP,
                )
            ready_shipment = await operations.mark_ready(
                hub_staff, data["hub_id"], shipment_response.id
            )
            assert ready_shipment.status == ShipmentStatus.READY_FOR_PICKUP.value
            refreshed_order = await session.get(Order, data["order_id"])
            assert refreshed_order.status is OrderStatus.SHIPPED
            events = list(
                (
                    await session.execute(
                        select(OrderEvent.to_status).where(
                            OrderEvent.order_id == data["order_id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert "READY_FOR_PICKUP" in events
            assert "SHIPPED" in events
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_sandbox_payment_and_order_cancellation_refund_are_atomic():
    data = seed()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            with pytest.raises(LifecycleNotFound):
                await service.initiate_sandbox_payment(
                    data["other_consumer_user_id"],
                    data["order_id"],
                    "success",
                )
            payment_id = await service.initiate_sandbox_payment(
                data["consumer_user_id"],
                data["order_id"],
                "success",
            )
            payment = await session.get(Payment, payment_id)
            assert payment.status is PaymentStatus.SUCCESSFUL
            assert payment.amount == Decimal("25.00")
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                OrderStatus.CANCELLED,
            )
            await session.refresh(payment)
            events = list(
                (
                    await session.execute(
                        select(OrderEvent)
                        .where(OrderEvent.order_id == data["order_id"])
                        .order_by(OrderEvent.created_at, OrderEvent.id)
                    )
                )
                .scalars()
                .all()
            )
            notifications = list(
                (
                    await session.execute(
                        select(Notification).where(
                            Notification.related_entity_id == data["order_id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert payment.status is PaymentStatus.REFUNDED
            assert Counter((event.from_status, event.to_status) for event in events) == Counter(
                [
                    (None, "PENDING"),
                    ("PENDING", "SUCCESSFUL"),
                    ("PENDING", "CANCELLED"),
                    ("SUCCESSFUL", "REFUNDED"),
                ]
            )
            assert any(
                item.notification_type is NotificationType.PAYMENT
                and "REFUNDED" in item.message
                for item in notifications
            )
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


@pytest.mark.parametrize(
    ("outcome", "expected_status"),
    [("failed", PaymentStatus.FAILED), ("cancelled", PaymentStatus.CANCELLED)],
)
def test_sandbox_terminal_outcomes_are_audited(outcome, expected_status):
    data = seed()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            payment_id = await service.initiate_sandbox_payment(
                data["consumer_user_id"],
                data["order_id"],
                outcome,
            )
            payment = await session.get(Payment, payment_id)
            event_rows = (
                (
                    await session.execute(
                        select(OrderEvent.from_status, OrderEvent.to_status).where(
                            OrderEvent.order_id == data["order_id"]
                        )
                    )
                )
                .all()
            )
            event_pairs = [(row.from_status, row.to_status) for row in event_rows]
            assert payment.status is expected_status
            assert (PaymentStatus.PENDING.value, expected_status.value) in event_pairs
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_failed_delivery_retry_and_return_cascade_to_order_cancellation():
    data = seed(OrderStatus.PROCESSING)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            now = datetime.now(timezone.utc)
            shipment = await service.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="Hub address",
                dropoff_address_snapshot="Consumer address",
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                ShipmentStatus.READY_FOR_PICKUP,
            )
            rider = LifecycleActor(data["rider_user_id"], UserRole.RIDER)
            await service.transition_shipment(
                shipment.id,
                rider,
                ShipmentStatus.RIDER_ASSIGNED,
            )
            await service.transition_shipment(shipment.id, rider, ShipmentStatus.PICKED_UP)
            await service.transition_shipment(shipment.id, rider, ShipmentStatus.OUT_FOR_DELIVERY)
            with pytest.raises(ValueError, match="reason is required"):
                await service.transition_shipment(
                    shipment.id,
                    rider,
                    ShipmentStatus.FAILED_DELIVERY,
                )
            await service.transition_shipment(
                shipment.id,
                rider,
                ShipmentStatus.FAILED_DELIVERY,
                reason="Customer unavailable",
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["admin_user_id"], UserRole.ADMIN),
                ShipmentStatus.OUT_FOR_DELIVERY,
                reason="Retry approved",
            )
            await service.transition_shipment(shipment.id, rider, ShipmentStatus.ARRIVED)
            await service.transition_shipment(
                shipment.id,
                rider,
                ShipmentStatus.FAILED_DELIVERY,
                reason="Second attempt failed",
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                ShipmentStatus.RETURNED,
            )
            order = await session.get(Order, data["order_id"])
            assert order.status is OrderStatus.CANCELLED
            event_targets = set(
                (
                    await session.execute(
                        select(OrderEvent.to_status).where(
                            OrderEvent.order_id == data["order_id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert {"FAILED_DELIVERY", "RETURNED", "CANCELLED"} <= event_targets
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_shipment_cancellation_requires_reason_and_cascades_to_order():
    data = seed(OrderStatus.PROCESSING)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            now = datetime.now(timezone.utc)
            shipment = await service.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="Hub address",
                dropoff_address_snapshot="Consumer address",
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                ShipmentStatus.READY_FOR_PICKUP,
            )
            shipment_id = shipment.id
            farmer = LifecycleActor(data["farmer_user_id"], UserRole.FARMER)
            with pytest.raises(ValueError, match="reason is required"):
                await service.transition_shipment(
                    shipment_id,
                    farmer,
                    ShipmentStatus.CANCELLED,
                )
            assert shipment.id == shipment_id
            await service.transition_shipment(
                shipment_id,
                farmer,
                ShipmentStatus.CANCELLED,
                reason="Produce unavailable",
            )
            order = await session.get(Order, data["order_id"])
            events = list(
                (
                    await session.execute(
                        select(OrderEvent).where(OrderEvent.order_id == data["order_id"])
                    )
                )
                .scalars()
                .all()
            )
            assert order.status is OrderStatus.CANCELLED
            assert any(
                event.from_status == "READY_FOR_PICKUP"
                and event.to_status == "CANCELLED"
                and event.shipment_id == shipment.id
                for event in events
            )
            assert any(
                event.from_status == "SHIPPED"
                and event.to_status == "CANCELLED"
                and event.shipment_id == shipment.id
                for event in events
            )
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_order_cancellation_cancels_packing_shipment_in_same_transaction():
    data = seed(OrderStatus.PROCESSING)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            now = datetime.now(timezone.utc)
            shipment = await service.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="Hub address",
                dropoff_address_snapshot="Consumer address",
            )
            farmer = LifecycleActor(data["farmer_user_id"], UserRole.FARMER)
            await service.transition_order(
                data["order_id"],
                farmer,
                OrderStatus.CANCELLED,
                reason="Produce unavailable",
            )
            await session.refresh(shipment)
            order = await session.get(Order, data["order_id"])
            events = list(
                (
                    await session.execute(
                        select(OrderEvent)
                        .where(OrderEvent.order_id == data["order_id"])
                        .order_by(OrderEvent.created_at, OrderEvent.id)
                    )
                )
                .scalars()
                .all()
            )
            shipment_rows = list(
                (
                    await session.execute(
                        select(Shipment).where(Shipment.order_id == data["order_id"])
                    )
                )
                .scalars()
                .all()
            )
            cancellation_events = [
                event for event in events if event.to_status == "CANCELLED"
            ]
            assert order.status is OrderStatus.CANCELLED
            assert shipment.status is ShipmentStatus.CANCELLED
            assert len(shipment_rows) == 1
            assert len(cancellation_events) == 2
            assert {
                (event.from_status, event.to_status, event.shipment_id)
                for event in cancellation_events
            } == {
                ("PROCESSING", "CANCELLED", shipment.id),
                ("PACKING", "CANCELLED", shipment.id),
            }
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_admin_shipped_cancellation_refunds_only_sandbox_payment():
    data = seed(OrderStatus.PROCESSING)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(session)
            now = datetime.now(timezone.utc)
            shipment = await service.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="Hub address",
                dropoff_address_snapshot="Consumer address",
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                ShipmentStatus.READY_FOR_PICKUP,
            )
            payment = Payment(
                order_id=data["order_id"],
                amount=Decimal("25.00"),
                status=PaymentStatus.SUCCESSFUL,
                payment_method="TEST_SANDBOX",
                is_test=True,
            )
            session.add(payment)
            await session.commit()
            admin = LifecycleActor(data["admin_user_id"], UserRole.ADMIN)
            with pytest.raises(ValueError, match="reason is required"):
                await service.transition_order(
                    data["order_id"],
                    admin,
                    OrderStatus.CANCELLED,
                )
            await service.transition_order(
                data["order_id"],
                admin,
                OrderStatus.CANCELLED,
                reason="Hub closure",
            )
            await session.refresh(payment)
            assert payment.status is PaymentStatus.REFUNDED
            payment_notifications = list(
                (
                    await session.execute(
                        select(Notification).where(
                            Notification.related_entity_id == data["order_id"],
                            Notification.notification_type == NotificationType.PAYMENT,
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert payment_notifications
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_shipment_progression_requires_assigned_rider_and_verified_otp():
    data = seed(OrderStatus.CONFIRMED)
    otp_hook_calls = []

    async def otp_hook(shipment):
        otp_hook_calls.append(shipment.id)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = OrderLifecycleService(
                session,
                phase6_otp_generation_hook=otp_hook,
            )
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                OrderStatus.PROCESSING,
            )
            now = datetime.now(timezone.utc)
            shipment = await service.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="Hub address",
                dropoff_address_snapshot="Consumer address",
            )
            assert shipment.status is ShipmentStatus.PACKING
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                ShipmentStatus.READY_FOR_PICKUP,
            )
            order = await session.get(Order, data["order_id"])
            assert order.status is OrderStatus.SHIPPED
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ShipmentStatus.RIDER_ASSIGNED,
            )
            with pytest.raises(LifecyclePermissionError):
                await service.transition_shipment(
                    shipment.id,
                    LifecycleActor(data["other_rider_user_id"], UserRole.RIDER),
                    ShipmentStatus.PICKED_UP,
                )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["admin_user_id"], UserRole.ADMIN),
                ShipmentStatus.READY_FOR_PICKUP,
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ShipmentStatus.RIDER_ASSIGNED,
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ShipmentStatus.PICKED_UP,
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ShipmentStatus.OUT_FOR_DELIVERY,
            )
            await service.transition_shipment(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ShipmentStatus.ARRIVED,
            )
            cod_payment_id = await service.record_cod_cash_collected(
                data["order_id"],
                data["rider_user_id"],
            )
            cod_payment = await session.get(Payment, cod_payment_id)
            assert cod_payment.status is PaymentStatus.PAID
            assert cod_payment.amount == Decimal("25.00")
            assert cod_payment.is_test is False
            with pytest.raises(LifecyclePermissionError):
                await service.transition_shipment(
                    shipment.id,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                    ShipmentStatus.DELIVERED,
                )
            with pytest.raises(LifecyclePermissionError):
                await service._deliver_shipment_after_otp(
                    shipment.id,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                    otp_verified=False,
                )
            await service._deliver_shipment_after_otp(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                otp_verified=True,
            )
            await service.transition_order(
                data["order_id"],
                LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                OrderStatus.COMPLETED,
            )
            events = list(
                (
                    await session.execute(
                        select(OrderEvent)
                        .where(OrderEvent.order_id == data["order_id"])
                        .order_by(OrderEvent.created_at, OrderEvent.id)
                    )
                )
                .scalars()
                .all()
            )
            order = await session.get(Order, data["order_id"])
            assert order.status is OrderStatus.COMPLETED
            assert otp_hook_calls == [shipment.id]
            assert sum(event.to_status == "SHIPPED" for event in events) == 1
            assert sum(event.to_status == "DELIVERED" for event in events) == 2
            assert all(
                event.shipment_id == shipment.id
                for event in events
                if event.to_status in {"PACKING", "READY_FOR_PICKUP", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED"}
            )
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_concurrent_order_transitions_only_write_one_event():
    data = seed()

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def cancel():
            async with factory() as session:
                return await OrderLifecycleService(session).transition_order(
                    data["order_id"],
                    LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                    OrderStatus.CANCELLED,
                )

        outcomes = await asyncio.gather(cancel(), cancel(), return_exceptions=True)
        assert sum(not isinstance(item, BaseException) for item in outcomes) == 1
        assert sum(isinstance(item, LifecycleConflict) for item in outcomes) == 1
        async with factory() as session:
            event_count = await session.scalar(
                select(func.count(OrderEvent.id)).where(
                    OrderEvent.order_id == data["order_id"]
                )
            )
            assert event_count == 1
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_delivery_otp_lockout_reset_tracking_access_and_single_use(caplog):
    data = seed(OrderStatus.CONFIRMED)
    settings = Settings(otp_ttl_minutes=120, otp_max_attempts=2)

    async def exercise():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            lifecycle = OrderLifecycleService(session, settings=settings)
            await lifecycle.transition_order(
                data["order_id"],
                LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
                OrderStatus.PROCESSING,
            )
            now = datetime.now(timezone.utc)
            shipment = await lifecycle.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="Hub address",
                dropoff_address_snapshot="Consumer address",
            )
            for target, actor in [
                (
                    ShipmentStatus.READY_FOR_PICKUP,
                    LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                ),
                (
                    ShipmentStatus.RIDER_ASSIGNED,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ),
                (
                    ShipmentStatus.PICKED_UP,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ),
                (
                    ShipmentStatus.OUT_FOR_DELIVERY,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ),
                (
                    ShipmentStatus.ARRIVED,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                ),
            ]:
                await lifecycle.transition_shipment(shipment.id, actor, target)

            with pytest.raises(LifecyclePermissionError):
                await lifecycle.verify_delivery_otp(
                    shipment.id,
                    LifecycleActor(data["other_rider_user_id"], UserRole.RIDER),
                    "123456",
                )
            with pytest.raises(LifecyclePermissionError):
                await lifecycle.verify_delivery_otp(
                    shipment.id,
                    LifecycleActor(data["consumer_user_id"], UserRole.CONSUMER),
                    "123456",
                )
            session.add(
                RiderLocation(
                    rider_id=data.get("rider_id"),
                    location=WKTElement("POINT(85.801 20.301)", srid=4326),
                    recorded_at=datetime.now(timezone.utc),
                )
            )
            await session.flush()

            notifications = list(
                (
                    await session.execute(
                        select(Notification).where(
                            Notification.user_id == data["consumer_user_id"],
                            Notification.related_entity_type == "shipment_otp",
                            Notification.related_entity_id == shipment.id,
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(notifications) == 1
            first_code = notifications[0].message.rsplit(" ", 1)[1].rstrip(".")
            stored_shipment = await session.get(Shipment, shipment.id)
            original_hash = stored_shipment.delivery_otp_hash
            assert stored_shipment.delivery_otp_hash != first_code
            assert lifecycle._matches_otp(
                first_code, stored_shipment.delivery_otp_hash
            )
            assert stored_shipment.otp_attempts == 0

            stored_shipment.otp_expires_at = datetime.now(timezone.utc) - timedelta(
                seconds=1
            )
            await session.flush()
            assert not await lifecycle.verify_delivery_otp(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                first_code,
            )
            assert stored_shipment.otp_attempts == 0

            stored_shipment.otp_expires_at = datetime.now(timezone.utc) + timedelta(
                minutes=30
            )
            await session.flush()
            assert not await lifecycle.verify_delivery_otp(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                "000000" if first_code != "000000" else "000001",
            )
            assert stored_shipment.otp_attempts == 1
            assert not await lifecycle.verify_delivery_otp(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                "000000" if first_code != "000000" else "000001",
            )
            assert stored_shipment.otp_attempts == 2

            admin_actor = LifecycleActor(data["admin_user_id"], UserRole.ADMIN)
            with pytest.raises(LifecycleConflict):
                await lifecycle.reset_delivery_otp(
                    shipment.id, admin_actor, " "
                )
            await lifecycle.reset_delivery_otp(
                shipment.id, admin_actor, "Consumer requested a replacement code"
            )
            assert stored_shipment.otp_attempts == 0
            notifications = list(
                (
                    await session.execute(
                        select(Notification)
                        .where(
                            Notification.user_id == data["consumer_user_id"],
                            Notification.related_entity_type == "shipment_otp",
                            Notification.related_entity_id == shipment.id,
                        )
                        .order_by(Notification.created_at, Notification.id)
                    )
                )
                .scalars()
                .all()
            )
            assert len(notifications) == 2
            reset_code = notifications[-1].message.rsplit(" ", 1)[1].rstrip(".")
            assert stored_shipment.delivery_otp_hash != original_hash

            orders_service = OrdersService(
                OrdersRepository(session),
                ConsumerRepository(session),
                settings=settings,
            )
            consumer_tracking = await orders_service.tracking(
                data["consumer_user_id"], UserRole.CONSUMER, data["order_id"]
            )
            assert consumer_tracking.delivery_otp == reset_code
            assert consumer_tracking.pickup_address == "Hub address"
            assert consumer_tracking.rider_location is not None
            rider_tracking = await orders_service.tracking(
                data["rider_user_id"], UserRole.RIDER, data["order_id"]
            )
            assert rider_tracking.delivery_otp is None
            assert rider_tracking.pickup_address is None
            assert rider_tracking.delivery_location is None
            assert rider_tracking.rider_location is not None
            farmer_tracking = await orders_service.tracking(
                data["farmer_user_id"], UserRole.FARMER, data["order_id"]
            )
            assert farmer_tracking.events
            assert farmer_tracking.pickup_address is None
            assert farmer_tracking.rider_location is None
            hub_staff_tracking = await orders_service.tracking(
                data["hub_staff_user_id"], UserRole.HUB_STAFF, data["order_id"]
            )
            assert hub_staff_tracking.events
            assert hub_staff_tracking.pickup_address is None
            assert hub_staff_tracking.rider_location is None
            admin_tracking = await orders_service.tracking(
                data["admin_user_id"], UserRole.ADMIN, data["order_id"]
            )
            assert admin_tracking.rider_location is not None
            assert admin_tracking.delivery_otp is None
            with pytest.raises(PermissionError):
                await orders_service.tracking(
                    data["other_consumer_user_id"],
                    UserRole.CONSUMER,
                    data["order_id"],
                )

            assert await lifecycle.verify_delivery_otp(
                shipment.id,
                LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                reset_code,
            )
            assert stored_shipment.status is ShipmentStatus.DELIVERED
            assert stored_shipment.otp_consumed_at is not None
            with pytest.raises(LifecycleConflict):
                await lifecycle.verify_delivery_otp(
                    shipment.id,
                    LifecycleActor(data["rider_user_id"], UserRole.RIDER),
                    reset_code,
                )

            events = list(
                (
                    await session.execute(
                        select(OrderEvent).where(
                            OrderEvent.order_id == data["order_id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert any(event.to_status == "OTP_LOCKED" for event in events)
            assert any(
                event.to_status == "OTP_RESET"
                and event.actor_role is UserRole.ADMIN
                and event.note == "Consumer requested a replacement code"
                for event in events
            )
            assert all(
                reset_code not in (event.note or "")
                and first_code not in (event.note or "")
                for event in events
            )
            assert all(
                code not in record.getMessage()
                for record in caplog.records
                for code in {first_code, reset_code}
            )
            assert "delivery_otp" not in RiderShipmentResponse.model_fields
            rider_location = await session.scalar(
                select(RiderLocation).where(
                    RiderLocation.rider_id == data["rider_id"]
                )
            )
            rider_location.recorded_at = datetime.now(timezone.utc) - timedelta(
                seconds=settings.rider_location_stale_seconds + 1
            )
            await session.flush()
            stale_tracking = await orders_service.tracking(
                data["consumer_user_id"], UserRole.CONSUMER, data["order_id"]
            )
            assert stale_tracking.rider_location is None
            assert stale_tracking.rider_location_available is False

            delivered_tracking = await orders_service.tracking(
                data["consumer_user_id"], UserRole.CONSUMER, data["order_id"]
            )
            assert delivered_tracking.review_listing_ids == [data["listing_id"]]
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


async def _create_out_for_delivery_shipment(session, data, settings):
    lifecycle = OrderLifecycleService(session, settings=settings)
    await lifecycle.transition_order(
        data["order_id"],
        LifecycleActor(data["farmer_user_id"], UserRole.FARMER),
        OrderStatus.PROCESSING,
    )
    now = datetime.now(timezone.utc)
    shipment = await lifecycle.create_shipment(
        data["order_id"],
        LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
        hub_id=data["hub_id"],
        promised_window_start=now,
        promised_window_end=now + timedelta(hours=1),
        pickup_address_snapshot="Hub address",
        dropoff_address_snapshot="Consumer address",
    )
    for target, actor in [
        (
            ShipmentStatus.READY_FOR_PICKUP,
            LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
        ),
        (
            ShipmentStatus.RIDER_ASSIGNED,
            LifecycleActor(data["rider_user_id"], UserRole.RIDER),
        ),
        (
            ShipmentStatus.PICKED_UP,
            LifecycleActor(data["rider_user_id"], UserRole.RIDER),
        ),
        (
            ShipmentStatus.OUT_FOR_DELIVERY,
            LifecycleActor(data["rider_user_id"], UserRole.RIDER),
        ),
    ]:
        await lifecycle.transition_shipment(shipment.id, actor, target)
    session.add(
        RiderLocation(
            rider_id=data["rider_id"],
            location=WKTElement("POINT(85.801 20.301)", srid=4326),
            recorded_at=datetime.now(timezone.utc),
        )
    )
    await session.flush()
    return shipment


async def _get_delivery_otp_notifications(session, shipment_id, consumer_user_id):
    return list(
        (
            await session.execute(
                select(Notification)
                .where(
                    Notification.user_id == consumer_user_id,
                    Notification.related_entity_type == "shipment_otp",
                    Notification.related_entity_id == shipment_id,
                )
                .order_by(Notification.created_at, Notification.id)
            )
        )
        .scalars()
        .all()
    )


def _auth_headers(user_id, role):
    token = create_access_token(str(user_id), role, Settings())
    return {"Authorization": f"Bearer {token}"}


def test_delivery_otp_plaintext_never_appears_in_logs(caplog):
    caplog.set_level(logging.DEBUG)
    data = seed(OrderStatus.CONFIRMED)
    settings = Settings(otp_ttl_minutes=120, otp_max_attempts=2)
    engine = build_engine(settings)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def exercise():
        async with factory() as session:
            shipment = await _create_out_for_delivery_shipment(session, data, settings)
            notifications = await _get_delivery_otp_notifications(
                session, shipment.id, data["consumer_user_id"]
            )
            first_code = notifications[0].message.rsplit(" ", 1)[1].rstrip(".")
            wrong_code = "000000" if first_code != "000000" else "000001"
            rider = LifecycleActor(data["rider_user_id"], UserRole.RIDER)
            lifecycle = OrderLifecycleService(session, settings=settings)
            assert not await lifecycle.verify_delivery_otp(
                shipment.id, rider, wrong_code
            )
            assert not await lifecycle.verify_delivery_otp(
                shipment.id, rider, wrong_code
            )
            await lifecycle.reset_delivery_otp(
                shipment.id,
                LifecycleActor(data["admin_user_id"], UserRole.ADMIN),
                "Consumer requested a replacement code",
            )
            notifications = await _get_delivery_otp_notifications(
                session, shipment.id, data["consumer_user_id"]
            )
            reset_code = notifications[-1].message.rsplit(" ", 1)[1].rstrip(".")
            assert await lifecycle.verify_delivery_otp(
                shipment.id, rider, reset_code
            )
            return first_code, reset_code

    try:
        codes = asyncio.run(exercise())
        assert all(code not in caplog.text for code in codes)
        assert all(
            code not in record.getMessage() and code not in repr(record.args)
            for record in caplog.records
            for code in codes
        )
    finally:
        asyncio.run(engine.dispose())
        cleanup(data)


def test_delivery_otp_plaintext_is_only_in_consumer_notifications_not_order_events():
    data = seed(OrderStatus.CONFIRMED)
    settings = Settings(otp_ttl_minutes=120, otp_max_attempts=2)
    engine = build_engine(settings)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def exercise():
        async with factory() as session:
            shipment = await _create_out_for_delivery_shipment(session, data, settings)
            notifications = await _get_delivery_otp_notifications(
                session, shipment.id, data["consumer_user_id"]
            )
            first_code = notifications[0].message.rsplit(" ", 1)[1].rstrip(".")
            wrong_code = "000000" if first_code != "000000" else "000001"
            rider = LifecycleActor(data["rider_user_id"], UserRole.RIDER)
            lifecycle = OrderLifecycleService(session, settings=settings)
            assert not await lifecycle.verify_delivery_otp(
                shipment.id, rider, wrong_code
            )
            assert not await lifecycle.verify_delivery_otp(
                shipment.id, rider, wrong_code
            )
            await lifecycle.reset_delivery_otp(
                shipment.id,
                LifecycleActor(data["admin_user_id"], UserRole.ADMIN),
                "Consumer requested a replacement code",
            )
            notifications = await _get_delivery_otp_notifications(
                session, shipment.id, data["consumer_user_id"]
            )
            reset_code = notifications[-1].message.rsplit(" ", 1)[1].rstrip(".")
            assert await lifecycle.verify_delivery_otp(
                shipment.id, rider, reset_code
            )

            events = list(
                (
                    await session.scalars(
                        select(OrderEvent).where(OrderEvent.order_id == data["order_id"])
                    )
                ).all()
            )
            event_text = [
                value
                for event in events
                for column in OrderEvent.__table__.columns
                if isinstance((value := getattr(event, column.key)), str)
            ]
            assert all(
                code not in text for code in (first_code, reset_code) for text in event_text
            )

            all_notifications = list((await session.scalars(select(Notification))).all())
            for code in (first_code, reset_code):
                matches = [
                    notification
                    for notification in all_notifications
                    if code in notification.message
                ]
                assert matches
                assert all(
                    notification.user_id == data["consumer_user_id"]
                    and notification.related_entity_type == "shipment_otp"
                    and notification.related_entity_id == shipment.id
                    for notification in matches
                )

    try:
        asyncio.run(exercise())
    finally:
        asyncio.run(engine.dispose())
        cleanup(data)


def test_delivery_tracking_http_access_and_otp_response_privacy():
    data = seed(OrderStatus.CONFIRMED)
    settings = Settings(otp_ttl_minutes=120, otp_max_attempts=2)
    engine = build_engine(settings)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with factory() as session:
            shipment = await _create_out_for_delivery_shipment(session, data, settings)
            notifications = await _get_delivery_otp_notifications(
                session, shipment.id, data["consumer_user_id"]
            )
            await session.commit()
            return shipment.id, notifications[0].message.rsplit(" ", 1)[1].rstrip(".")

    try:
        shipment_id, expected_code = asyncio.run(setup())
        asyncio.run(engine.dispose())
        tracking_path = f"/api/v1/orders/{data['order_id']}/tracking"
        with TestClient(create_app()) as client:
            unauthenticated = client.get(tracking_path)
            assert unauthenticated.status_code == 401

            other_consumer = client.get(
                tracking_path,
                headers=_auth_headers(
                    data["other_consumer_user_id"], UserRole.CONSUMER
                ),
            )
            assert other_consumer.status_code in {403, 404}
            assert expected_code not in other_consumer.text
            assert "rider_location" not in other_consumer.text
            assert "85.801" not in other_consumer.text
            assert "20.301" not in other_consumer.text

            owner_tracking = client.get(
                tracking_path,
                headers=_auth_headers(data["consumer_user_id"], UserRole.CONSUMER),
            )
            assert owner_tracking.status_code == 200, owner_tracking.text
            assert owner_tracking.json()["delivery_otp"] == expected_code
            assert owner_tracking.json()["rider_location"] is not None

            rider_tracking = client.get(
                tracking_path,
                headers=_auth_headers(data["rider_user_id"], UserRole.RIDER),
            )
            assert rider_tracking.status_code == 200, rider_tracking.text
            assert rider_tracking.json()["delivery_otp"] is None
            assert expected_code not in rider_tracking.text

            for user_id, role in (
                (data["farmer_user_id"], UserRole.FARMER),
                (data["hub_staff_user_id"], UserRole.HUB_STAFF),
            ):
                role_tracking = client.get(
                    tracking_path, headers=_auth_headers(user_id, role)
                )
                assert role_tracking.status_code == 200, role_tracking.text
                assert role_tracking.json()["events"]
                assert role_tracking.json()["delivery_otp"] is None
                assert role_tracking.json()["rider_location"] is None
                assert expected_code not in role_tracking.text

            wrong_code = "000000" if expected_code != "000000" else "000001"
            failed_verification = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/otp-verification",
                headers=_auth_headers(data["rider_user_id"], UserRole.RIDER),
                json={"code": wrong_code},
            )
            assert failed_verification.status_code == 400
            assert wrong_code not in failed_verification.text
            assert expected_code not in failed_verification.text

            successful_verification = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/otp-verification",
                headers=_auth_headers(data["rider_user_id"], UserRole.RIDER),
                json={"code": expected_code},
            )
            assert successful_verification.status_code == 200
            assert expected_code not in successful_verification.text
    finally:
        asyncio.run(engine.dispose())
        cleanup(data)
