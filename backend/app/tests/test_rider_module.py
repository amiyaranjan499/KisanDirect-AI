import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    Order,
    OrderEvent,
    OrderStatus,
    Rider,
    RiderApprovalStatus,
    RiderAvailability,
    RiderLocation,
    RiderOffer,
    Shipment,
    ShipmentStatus,
    User,
    UserRole,
)
from backend.app.repositories.rider_repository import RiderRepository
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)
from backend.app.services.rider_service import RiderService
from backend.app.tests.test_order_lifecycle import cleanup, seed


def prepare_ready_shipment(data):
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            order = await session.get(Order, data["order_id"])
            order.status = OrderStatus.PROCESSING
            order.hub_id = data["hub_id"]
            for rider_user_id in (
                data["rider_user_id"],
                data["other_rider_user_id"],
            ):
                rider = await session.scalar(
                    select(Rider).where(Rider.user_id == rider_user_id)
                )
                rider.availability = RiderAvailability.AVAILABLE
                point = (
                    "POINT(85.8 20.3)"
                    if rider_user_id == data["rider_user_id"]
                    else "POINT(85.81 20.3)"
                )
                session.add(
                    RiderLocation(
                        rider_id=rider.id,
                        location=WKTElement(point, srid=4326),
                    )
                )
            now = datetime.now(timezone.utc)
            lifecycle = OrderLifecycleService(session)
            shipment = await lifecycle.create_shipment(
                data["order_id"],
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                hub_id=data["hub_id"],
                promised_window_start=now,
                promised_window_end=now + timedelta(hours=1),
                pickup_address_snapshot="1 Hub Road",
                dropoff_address_snapshot="2 Consumer Road",
            )
            await lifecycle.transition_shipment(
                shipment.id,
                LifecycleActor(data["hub_staff_user_id"], UserRole.HUB_STAFF),
                ShipmentStatus.READY_FOR_PICKUP,
            )
            await session.commit()
            result = {
                "shipment_id": shipment.id,
                "rider_user_id": data["rider_user_id"],
                "other_rider_user_id": data["other_rider_user_id"],
                "rider_id": (
                    await session.scalar(
                        select(Rider.id).where(
                            Rider.user_id == data["rider_user_id"]
                        )
                    )
                ),
                "other_rider_id": (
                    await session.scalar(
                        select(Rider.id).where(
                            Rider.user_id == data["other_rider_user_id"]
                        )
                    )
                ),
                "order_id": data["order_id"],
                "consumer_user_id": data["consumer_user_id"],
            }
        await engine.dispose()
        return result

    return asyncio.run(create())


def test_rider_signup_creates_pending_profile_and_unauthenticated_location_is_denied():
    email = f"rider-registration-{uuid4()}@example.com"

    async def cleanup_user():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(User).where(User.email == email.lower()))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            registered = client.post(
                "/api/v1/auth/register",
                json={
                    "email": email,
                    "password": "Password123!",
                    "role": "RIDER",
                    "display_name": "Test Delivery Rider",
                },
            )
            login = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "Password123!"},
            )
            assert login.status_code == 200, login.text
            headers = {
                "Authorization": f"Bearer {login.json()['access_token']}"
            }
            cannot_go_online = client.patch(
                "/api/v1/rider/availability",
                headers=headers,
                json={"online": True},
            )
            anonymous_location = client.post(
                "/api/v1/rider/location",
                json={"latitude": 20.3, "longitude": 85.8},
            )
        assert registered.status_code == 201, registered.text
        assert registered.json()["role"] == "RIDER"
        assert cannot_go_online.status_code == 403, cannot_go_online.text
        assert anonymous_location.status_code == 401

        async def approval_status():
            engine = build_engine(Settings())
            factory = async_sessionmaker(engine, expire_on_commit=False)
            async with factory() as session:
                rider = await session.scalar(
                    select(Rider).where(Rider.user_id == registered.json()["id"])
                )
                assert rider is not None
                assert rider.display_name == "Test Delivery Rider"
                assert rider.approval_status is RiderApprovalStatus.PENDING_APPROVAL
                assert rider.availability is RiderAvailability.OFFLINE
            await engine.dispose()

        asyncio.run(approval_status())
    finally:
        asyncio.run(cleanup_user())


def test_pending_and_suspended_riders_cannot_go_online_or_poll_offers():
    data = seed()
    rider_data = prepare_ready_shipment(data)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            rider = await session.get(Rider, rider_data["rider_id"])
            rider.approval_status = RiderApprovalStatus.PENDING_APPROVAL
            service = RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                Settings(),
            )
            actor = LifecycleActor(rider_data["rider_user_id"], UserRole.RIDER)
            with pytest.raises(LifecyclePermissionError):
                await service.set_availability(actor, online=True)
            with pytest.raises(LifecyclePermissionError):
                await service.poll_offers(actor)
            rider.approval_status = RiderApprovalStatus.SUSPENDED
            await session.commit()
            with pytest.raises(LifecyclePermissionError):
                await service.set_availability(actor, online=True)
            with pytest.raises(LifecyclePermissionError):
                await service.poll_offers(actor)
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_offer_accept_race_and_only_assigned_rider_can_update_shipment():
    data = seed()
    rider_data = prepare_ready_shipment(data)
    settings = Settings(rider_offer_timeout_seconds=60)

    async def dispatch():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            ).dispatch_ready_shipment(rider_data["shipment_id"])
            await session.commit()
            offer = await session.scalar(
                select(RiderOffer).where(
                    RiderOffer.shipment_id == rider_data["shipment_id"]
                )
            )
            assert offer is not None
            assert offer.rider_id == rider_data["rider_id"]
            return offer.id, offer.rider_id

    offer_id, winner_rider_id = asyncio.run(dispatch())
    winner_user_id = (
        rider_data["rider_user_id"]
        if winner_rider_id == rider_data["rider_id"]
        else rider_data["other_rider_user_id"]
    )
    loser_user_id = (
        rider_data["other_rider_user_id"]
        if winner_user_id == rider_data["rider_user_id"]
        else rider_data["rider_user_id"]
    )

    async def exercise_race():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def accept(user_id):
            async with factory() as session:
                service = RiderService(
                    session,
                    RiderRepository(session),
                    OrderLifecycleService(session),
                    settings,
                )
                try:
                    result = await service.accept_offer(
                        LifecycleActor(user_id, UserRole.RIDER),
                        offer_id,
                    )
                    await session.commit()
                    return result
                except (
                    LifecycleConflict,
                    LifecycleNotFound,
                    LifecyclePermissionError,
                ):
                    return None

        outcomes = await asyncio.gather(
            accept(winner_user_id),
            accept(loser_user_id),
        )
        assert sum(outcome is not None for outcome in outcomes) == 1
        async with factory() as session:
            shipment = await session.get(Shipment, rider_data["shipment_id"])
            event_count = await session.scalar(
                select(func.count(OrderEvent.id))
                .where(
                    OrderEvent.shipment_id == rider_data["shipment_id"],
                    OrderEvent.to_status == "RIDER_ASSIGNED",
                )
            )
            assert shipment.status is ShipmentStatus.RIDER_ASSIGNED
            rider = await session.get(Rider, shipment.rider_id)
            assert rider is not None
            assert rider.availability is RiderAvailability.BUSY
            assert event_count == 1
        await engine.dispose()
        return shipment.rider_id

    assigned_rider_id = asyncio.run(exercise_race())
    assert assigned_rider_id == winner_rider_id

    async def check_permissions_and_location():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            )
            other = LifecycleActor(loser_user_id, UserRole.RIDER)
            consumer = LifecycleActor(
                rider_data["consumer_user_id"], UserRole.CONSUMER
            )
            for actor in (other, consumer):
                with pytest.raises(LifecyclePermissionError):
                    await service.update_shipment_status(
                        actor,
                        rider_data["shipment_id"],
                        ShipmentStatus.PICKED_UP,
                    )
            await service.post_location(
                LifecycleActor(winner_user_id, UserRole.RIDER),
                latitude=20.31,
                longitude=85.82,
                accuracy=None,
            )
            stored = list(
                (
                    await session.scalars(
                        select(RiderLocation).where(
                            RiderLocation.rider_id == winner_rider_id
                        )
                    )
                ).all()
            )
            assert len(stored) == 2
            assert all(row.rider_id == winner_rider_id for row in stored)
        await engine.dispose()

    try:
        asyncio.run(check_permissions_and_location())
    finally:
        cleanup(data)


def test_offer_timeout_advances_to_next_nearest_rider():
    data = seed()
    rider_data = prepare_ready_shipment(data)
    settings = Settings(rider_offer_timeout_seconds=1)

    async def exercise():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            )
            await service.dispatch_ready_shipment(rider_data["shipment_id"])
            await session.commit()
        await asyncio.sleep(1.1)
        async with factory() as session:
            first_offer = await session.scalar(
                select(RiderOffer)
                .where(RiderOffer.shipment_id == rider_data["shipment_id"])
                .order_by(RiderOffer.offered_at)
            )
            assert first_offer is not None
            first_user_id = await session.scalar(
                select(Rider.user_id).where(Rider.id == first_offer.rider_id)
            )
            await RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            ).poll_offers(LifecycleActor(first_user_id, UserRole.RIDER))
            await session.commit()
            offers = list(
                (
                    await session.scalars(
                        select(RiderOffer)
                        .where(
                            RiderOffer.shipment_id
                            == rider_data["shipment_id"]
                        )
                        .order_by(RiderOffer.offered_at)
                    )
                ).all()
            )
            assert offers[0].status == "EXPIRED"
            assert offers[0].rider_id == rider_data["rider_id"]
            assert len(offers) == 2
            assert offers[1].status == "OFFERED"
            assert offers[1].rider_id == rider_data["other_rider_id"]
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_declining_offer_immediately_dispatches_to_next_nearest_rider():
    data = seed()
    rider_data = prepare_ready_shipment(data)

    async def exercise():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            settings = Settings()
            service = RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            )
            await service.dispatch_ready_shipment(rider_data["shipment_id"])
            await session.flush()
            first = await session.scalar(
                select(RiderOffer).where(
                    RiderOffer.shipment_id == rider_data["shipment_id"]
                )
            )
            assert first is not None
            first_user_id = await session.scalar(
                select(Rider.user_id).where(Rider.id == first.rider_id)
            )
            result = await service.decline_offer(
                LifecycleActor(first_user_id, UserRole.RIDER),
                first.id,
            )
            await session.commit()
            offers = list(
                (
                    await session.scalars(
                        select(RiderOffer)
                        .where(
                            RiderOffer.shipment_id
                            == rider_data["shipment_id"]
                        )
                        .order_by(RiderOffer.offered_at)
                    )
                ).all()
            )
            assert result == "DECLINED"
            assert offers[0].status == "DECLINED"
            assert offers[1].status == "OFFERED"
            assert offers[1].rider_id == rider_data["other_rider_id"]
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_rider_self_status_and_update_profile():
    data = seed()
    rider_user_id = data["rider_user_id"]
    settings = Settings()

    async def exercise():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            )
            actor = LifecycleActor(rider_user_id, UserRole.RIDER)
            status_resp = await service.self_status(actor)
            assert status_resp.approval_status == "APPROVED"
            assert status_resp.availability in {"AVAILABLE", "OFFLINE"}
            assert status_resp.vehicle_type is not None

            updated = await service.update_profile(
                actor,
                display_name="Kisan Delivery Champion",
                vehicle_type="Electric Scooter (EV Bike)",
            )
            assert updated.display_name == "Kisan Delivery Champion"
            assert updated.vehicle_type == "Electric Scooter (EV Bike)"
            await session.commit()
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)


def test_rider_direct_delivery_confirmation_without_otp():
    data = seed()
    prepared = prepare_ready_shipment(data)
    shipment_id = prepared["shipment_id"]
    rider_user_id = data["rider_user_id"]
    settings = Settings()

    async def exercise():
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            service = RiderService(
                session,
                RiderRepository(session),
                OrderLifecycleService(session),
                settings,
            )
            actor = LifecycleActor(rider_user_id, UserRole.RIDER)
            offers = await service.poll_offers(actor)
            assert len(offers) == 1
            await service.accept_offer(actor, offers[0].id)

            await service.update_shipment_status(actor, shipment_id, ShipmentStatus.PICKED_UP)
            await service.update_shipment_status(actor, shipment_id, ShipmentStatus.OUT_FOR_DELIVERY)
            await service.update_shipment_status(actor, shipment_id, ShipmentStatus.ARRIVED)

            # Mark as Delivered without OTP
            delivered_resp = await service.update_shipment_status(actor, shipment_id, ShipmentStatus.DELIVERED)
            assert delivered_resp.status == "DELIVERED"

            # Check DB state
            shipment = await session.get(Shipment, shipment_id)
            assert shipment.status is ShipmentStatus.DELIVERED
            assert shipment.delivered_at is not None
            assert shipment.rider_id is not None

            order = await session.get(Order, data["order_id"])
            assert order.status is OrderStatus.DELIVERED

            rider = await session.scalar(select(Rider).where(Rider.user_id == rider_user_id))
            assert rider.availability is RiderAvailability.AVAILABLE

            # Duplicate delivery prevention
            with pytest.raises(LifecycleConflict):
                await service.update_shipment_status(actor, shipment_id, ShipmentStatus.DELIVERED)

            await session.commit()
        await engine.dispose()

    try:
        asyncio.run(exercise())
    finally:
        cleanup(data)
