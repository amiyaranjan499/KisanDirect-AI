import asyncio
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from backend.app.models import (
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStaff,
    HubStock,
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
            await session.execute(delete(Order).where(Order.id == data["order_id"]))
            await session.execute(
                delete(HubStock).where(HubStock.listing_id == data["listing_id"])
            )
            await session.execute(delete(CropListing).where(CropListing.id == data["listing_id"]))
            await session.execute(delete(Crop).where(Crop.id == data["crop_id"]))
            await session.execute(delete(Hub).where(Hub.id == data["hub_id"]))
            await session.execute(delete(User).where(User.id.in_(data["user_ids"])))
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
