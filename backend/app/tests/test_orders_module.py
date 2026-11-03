import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    AvailabilityStatus,
    Cart,
    CartItem,
    Consumer,
    Crop,
    CropListing,
    DeliverySlot,
    Farmer,
    Hub,
    HubStock,
    Order,
    ReservationStatus,
    StockReservation,
    User,
    UserRole,
)
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    OrderLifecycleService,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def header(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer = User(email=f"orders-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            farmer = User(email=f"orders-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            other_consumer = User(email=f"orders-other-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            session.add_all([consumer, farmer, other_consumer])
            await session.flush()
            consumer_profile = Consumer(user_id=consumer.id, name="Order Consumer")
            other_profile = Consumer(user_id=other_consumer.id, name="Other Consumer")
            farmer_profile = Farmer(user_id=farmer.id, name="Order Farmer")
            session.add_all([consumer_profile, other_profile, farmer_profile])
            await session.flush()
            crop = Crop(name=f"Order Crop {uuid4()}", category="Grain")
            session.add(crop)
            await session.flush()
            listing = CropListing(crop_id=crop.id, farmer_id=farmer_profile.id, quantity=Decimal("20"), minimum_order_quantity=Decimal("2"), unit="kg", asking_price=Decimal("10"), availability_status=AvailabilityStatus.AVAILABLE)
            session.add(listing)
            await session.flush()
            hub = Hub(
                name=f"Orders Hub {uuid4()}",
                address="Market Road, Bhubaneswar",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751001",
                service_radius_km=Decimal("8"),
            )
            session.add(hub)
            await session.flush()
            session.add(
                HubStock(
                    hub_id=hub.id,
                    listing_id=listing.id,
                    available_quantity=Decimal("20"),
                )
            )
            await session.commit()
            for item in [consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop, hub]:
                await session.refresh(item)
        await engine.dispose()
        return consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop, hub
    return asyncio.run(create())


def cleanup(data):
    consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop, hub = data
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            other_profile = await session.scalar(
                select(Consumer).where(Consumer.user_id == other_consumer.id)
            )
            await session.execute(
                delete(Order).where(
                    Order.consumer_id.in_([consumer_profile.id, other_profile.id])
                )
            )
            await session.execute(delete(StockReservation).where(StockReservation.hub_stock_id.in_(select(HubStock.id).where(HubStock.hub_id == hub.id))))
            await session.execute(delete(HubStock).where(HubStock.hub_id == hub.id))
            await session.execute(delete(Hub).where(Hub.id == hub.id))
            await session.execute(delete(Cart).where(Cart.consumer_id.in_([consumer_profile.id, other_profile.id])))
            await session.execute(delete(CropListing).where(CropListing.crop_id == crop.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer.id, other_consumer.id])))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([consumer.id, farmer.id, other_consumer.id])))
            await session.commit()
        await engine.dispose()
    asyncio.run(remove())


def test_cart_validation_checkout_history_and_authorization():
    data = seed()
    consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop, hub = data
    try:
        with TestClient(create_app()) as client:
            empty = client.get("/api/v1/cart", headers=header(consumer))
            assert empty.status_code == 200
            assert empty.json()["items"] == []

            minimum = client.post("/api/v1/cart/items", headers=header(consumer), json={"listing_id": str(listing.id), "quantity": "1"})
            assert minimum.status_code == 409
            added = client.post("/api/v1/cart/items", headers=header(consumer), json={"listing_id": str(listing.id), "quantity": "3"})
            assert added.status_code == 201
            assert added.json()["subtotal"] == "30.00"
            item_id = added.json()["items"][0]["id"]

            updated = client.patch(f"/api/v1/cart/items/{item_id}", headers=header(consumer), json={"quantity": "4"})
            assert updated.status_code == 200
            assert updated.json()["items"][0]["unit_price"] == "10.00"

            other_cart = client.patch(f"/api/v1/cart/items/{item_id}", headers=header(other_consumer), json={"quantity": "5"})
            assert other_cart.status_code == 404

            options = client.get(
                "/api/v1/checkout/options?latitude=20.3&longitude=85.8",
                headers=header(consumer),
            )
            assert options.status_code == 200
            assert any(h["id"] == str(hub.id) for h in options.json()["hubs"])
            order = client.post(
                "/api/v1/orders",
                headers=header(consumer),
                json={
                    "hub_id": str(hub.id),
                    "latitude": 20.3,
                    "longitude": 85.8,
                    "address": "12 Market Road, Bhubaneswar",
                    "total_amount": "0.01",
                },
            )
            assert order.status_code == 201
            order_body = order.json()
            assert order_body["total_amount"] == "40.00"
            assert order_body["subtotal"] == "40.00"
            assert order_body["delivery_fee"] == "0.00"
            assert order_body["platform_fee"] == "0.00"
            assert order_body["items"][0]["unit_price"] == "10.00"
            assert order_body["items"][0]["subtotal"] == "40.00"

            history = client.get("/api/v1/orders", headers=header(consumer))
            assert history.status_code == 200
            assert history.json()["total"] == 1

            details = client.get(f"/api/v1/orders/{order_body['id']}", headers=header(consumer))
            assert details.status_code == 200
            forbidden = client.get(f"/api/v1/orders/{order_body['id']}", headers=header(other_consumer))
            assert forbidden.status_code == 404

            farmer_history = client.get("/api/v1/farmer/orders", headers=header(farmer))
            assert farmer_history.status_code == 200
            assert farmer_history.json()["total"] == 1
            farmer_detail = client.get(f"/api/v1/orders/{order_body['id']}", headers=header(farmer))
            assert farmer_detail.status_code == 200
            assert farmer_detail.json()["items"][0]["farmer_name"] == "Order Farmer"

            cancelled = client.patch(f"/api/v1/orders/{order_body['id']}/status", headers=header(consumer), json={"status": "CANCELLED"})
            assert cancelled.status_code == 200
            assert cancelled.json()["status"] == "CANCELLED"
    finally:
        cleanup(data)


def test_checkout_rolls_back_when_stock_is_insufficient():
    data = seed()
    consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop, hub = data
    try:
        with TestClient(create_app()) as client:
            added = client.post("/api/v1/cart/items", headers=header(consumer), json={"listing_id": str(listing.id), "quantity": "5"})
            assert added.status_code == 201
            async def lower_stock():
                engine = build_engine(Settings())
                factory = async_sessionmaker(engine, expire_on_commit=False)
                async with factory() as session:
                    row = await session.scalar(
                        select(HubStock).where(
                            HubStock.hub_id == hub.id,
                            HubStock.listing_id == listing.id,
                        )
                    )
                    row.available_quantity = Decimal("3")
                    await session.commit()
                await engine.dispose()
            asyncio.run(lower_stock())
            failed = client.post(
                "/api/v1/orders",
                headers=header(consumer),
                json={
                    "hub_id": str(hub.id),
                    "latitude": 20.3,
                    "longitude": 85.8,
                    "address": "12 Market Road, Bhubaneswar",
                },
            )
            assert failed.status_code == 409
            cart = client.get("/api/v1/cart", headers=header(consumer))
            assert len(cart.json()["items"]) == 1
    finally:
        cleanup(data)


def test_checkout_rejects_out_of_area_and_items_missing_from_selected_hub():
    data = seed()
    consumer, _, _, _, farmer_profile, listing, crop, hub = data
    try:
        async def add_unstocked_listing():
            engine = build_engine(Settings())
            factory = async_sessionmaker(engine, expire_on_commit=False)
            async with factory() as session:
                second_listing = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal("10"),
                    minimum_order_quantity=Decimal("2"),
                    unit="kg",
                    asking_price=Decimal("12"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(second_listing)
                await session.commit()
                await session.refresh(second_listing)
            await engine.dispose()
            return second_listing

        second_listing = asyncio.run(add_unstocked_listing())
        with TestClient(create_app()) as client:
            client.post(
                "/api/v1/cart/items",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "quantity": "2"},
            )
            client.post(
                "/api/v1/cart/items",
                headers=header(consumer),
                json={"listing_id": str(second_listing.id), "quantity": "2"},
            )
            outside = client.get(
                "/api/v1/checkout/options?latitude=0&longitude=0",
                headers=header(consumer),
            )
            assert outside.status_code == 200
            assert outside.json()["hubs"] == []

            unavailable = client.post(
                "/api/v1/orders",
                headers=header(consumer),
                json={
                    "hub_id": str(hub.id),
                    "latitude": 20.3,
                    "longitude": 85.8,
                    "address": "12 Market Road, Bhubaneswar",
                },
            )
            assert unavailable.status_code == 409
            assert "Order Crop" in unavailable.json()["detail"]
            assert "unavailable at the selected hub" in unavailable.json()["detail"]

            out_of_area = client.post(
                "/api/v1/orders",
                headers=header(consumer),
                json={
                    "hub_id": str(hub.id),
                    "latitude": 0,
                    "longitude": 0,
                    "address": "12 Market Road, Bhubaneswar",
                },
            )
            assert out_of_area.status_code == 409
            assert "not serviceable" in out_of_area.json()["detail"]
    finally:
        cleanup(data)


def _prepare_two_checkout_carts(data, *, stock_quantity, slot_capacity=None):
    consumer, _, other_consumer, consumer_profile, _, listing, _, hub = data

    async def prepare():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            other_profile = await session.scalar(
                select(Consumer).where(Consumer.user_id == other_consumer.id)
            )
            stock = await session.scalar(
                select(HubStock).where(
                    HubStock.hub_id == hub.id,
                    HubStock.listing_id == listing.id,
                )
            )
            stock.available_quantity = Decimal(stock_quantity)
            listing_row = await session.get(CropListing, listing.id)
            listing_row.minimum_order_quantity = Decimal("1")
            session.add_all(
                [
                    Cart(consumer_id=consumer_profile.id),
                    Cart(consumer_id=other_profile.id),
                ]
            )
            await session.flush()
            carts = list(
                (
                    await session.scalars(
                        select(Cart).where(
                            Cart.consumer_id.in_(
                                [consumer_profile.id, other_profile.id]
                            )
                        )
                    )
                ).all()
            )
            session.add_all(
                [
                    CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("1"))
                    for cart in carts
                ]
            )
            slot = None
            if slot_capacity is not None:
                now = datetime.now(timezone.utc)
                slot = DeliverySlot(
                    hub_id=hub.id,
                    starts_at=now + timedelta(hours=1),
                    ends_at=now + timedelta(hours=2),
                    capacity=slot_capacity,
                    booked_count=0,
                )
                session.add(slot)
            await session.commit()
            if slot is not None:
                await session.refresh(slot)
                slot_id = slot.id
            else:
                slot_id = None
        await engine.dispose()
        return slot_id

    return asyncio.run(prepare())


def _race_checkout(data, slot_id=None):
    consumer, _, other_consumer, _, _, _, _, hub = data

    async def race():
        settings = Settings(hub_service_radius_km=Decimal("8"))
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def place(user_id):
            async with factory() as session:
                service = OrderLifecycleService(session)
                return await service.create_checkout_order(
                    LifecycleActor(user_id, UserRole.CONSUMER),
                    hub_id=hub.id,
                    delivery_slot_id=slot_id,
                    latitude=20.3,
                    longitude=85.8,
                    address="12 Market Road, Bhubaneswar",
                    settings=settings,
                )

        results = await asyncio.gather(
            place(consumer.id),
            place(other_consumer.id),
            return_exceptions=True,
        )
        await engine.dispose()
        return results

    return asyncio.run(race())


def test_concurrent_checkout_reserves_last_hub_unit_once():
    data = seed()
    try:
        _prepare_two_checkout_carts(data, stock_quantity="1")
        results = _race_checkout(data)
        assert sum(isinstance(result, UUID) for result in results) == 1
        failures = [result for result in results if isinstance(result, Exception)]
        assert len(failures) == 1
        assert isinstance(failures[0], LifecycleConflict)
        assert "unavailable at the selected hub" in str(failures[0])
    finally:
        cleanup(data)


def test_concurrent_checkout_cannot_oversell_delivery_slot_capacity():
    data = seed()
    try:
        slot_id = _prepare_two_checkout_carts(
            data, stock_quantity="20", slot_capacity=1
        )
        results = _race_checkout(data, slot_id)
        assert sum(isinstance(result, UUID) for result in results) == 1
        failures = [result for result in results if isinstance(result, Exception)]
        assert len(failures) == 1
        assert isinstance(failures[0], LifecycleConflict)
        assert "delivery slot is no longer available" in str(failures[0])
    finally:
        cleanup(data)


def test_expired_hold_is_released_without_decrementing_hub_stock():
    data = seed()
    consumer, _, _, consumer_profile, _, listing, _, hub = data

    async def expire():
        settings = Settings()
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            session.add(Cart(consumer_id=consumer_profile.id))
            await session.flush()
            cart = await session.scalar(
                select(Cart).where(Cart.consumer_id == consumer_profile.id)
            )
            session.add(
                CartItem(
                    cart_id=cart.id,
                    listing_id=listing.id,
                    quantity=Decimal("2"),
                )
            )
            await session.commit()
        async with factory() as session:
            order_id = await OrderLifecycleService(session).create_checkout_order(
                LifecycleActor(consumer.id, UserRole.CONSUMER),
                hub_id=hub.id,
                delivery_slot_id=None,
                latitude=20.3,
                longitude=85.8,
                address="12 Market Road, Bhubaneswar",
                settings=settings,
            )
        async with factory() as session:
            reservation = await session.scalar(
                select(StockReservation).where(
                    StockReservation.order_id == order_id
                )
            )
            reservation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await session.commit()
        async with factory() as session:
            count = await OrderLifecycleService(session).expire_holds()
        async with factory() as session:
            reservation = await session.scalar(
                select(StockReservation).where(
                    StockReservation.order_id == order_id
                )
            )
            stock = await session.scalar(
                select(HubStock).where(
                    HubStock.hub_id == hub.id,
                    HubStock.listing_id == listing.id,
                )
            )
            state = (reservation.status, stock.available_quantity)
        await engine.dispose()
        return count, state

    try:
        count, state = asyncio.run(expire())
        assert count == 1
        assert state == (ReservationStatus.EXPIRED, Decimal("20.000"))
    finally:
        cleanup(data)


def test_checkout_uses_server_fee_settings_for_total():
    data = seed()
    consumer, _, _, consumer_profile, _, listing, _, hub = data

    async def checkout_with_fees():
        settings = Settings(
            hub_service_radius_km=Decimal("8"),
            delivery_fee=Decimal("5.25"),
            platform_fee=Decimal("1.75"),
        )
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            session.add(Cart(consumer_id=consumer_profile.id))
            await session.flush()
            cart = await session.scalar(
                select(Cart).where(Cart.consumer_id == consumer_profile.id)
            )
            session.add(
                CartItem(
                    cart_id=cart.id,
                    listing_id=listing.id,
                    quantity=Decimal("2"),
                )
            )
            await session.commit()
        async with factory() as session:
            order_id = await OrderLifecycleService(session).create_checkout_order(
                LifecycleActor(consumer.id, UserRole.CONSUMER),
                hub_id=hub.id,
                delivery_slot_id=None,
                latitude=20.3,
                longitude=85.8,
                address="12 Market Road, Bhubaneswar",
                settings=settings,
            )
        async with factory() as session:
            order = await session.get(Order, order_id)
            amounts = (
                order.subtotal,
                order.delivery_fee,
                order.platform_fee,
                order.total_amount,
            )
        await engine.dispose()
        return amounts

    try:
        assert asyncio.run(checkout_with_fees()) == (
            Decimal("20.00"),
            Decimal("5.25"),
            Decimal("1.75"),
            Decimal("27.00"),
        )
    finally:
        cleanup(data)


def test_payment_outcomes_commit_or_release_hub_reservations():
    data = seed()
    consumer, _, other_consumer, consumer_profile, _, listing, _, hub = data

    async def process_outcomes():
        settings = Settings(hub_service_radius_km=Decimal("8"))
        engine = build_engine(settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            other_profile = await session.scalar(
                select(Consumer).where(Consumer.user_id == other_consumer.id)
            )
            carts = [
                Cart(consumer_id=consumer_profile.id),
                Cart(consumer_id=other_profile.id),
            ]
            session.add_all(carts)
            await session.flush()
            session.add_all(
                [
                    CartItem(
                        cart_id=cart.id,
                        listing_id=listing.id,
                        quantity=Decimal("2"),
                    )
                    for cart in carts
                ]
            )
            await session.commit()

        order_ids = []
        for user in [consumer, other_consumer]:
            async with factory() as session:
                lifecycle = OrderLifecycleService(session)
                order_ids.append(
                    await lifecycle.create_checkout_order(
                        LifecycleActor(user.id, UserRole.CONSUMER),
                        hub_id=hub.id,
                        delivery_slot_id=None,
                        latitude=20.3,
                        longitude=85.8,
                        address="12 Market Road, Bhubaneswar",
                        settings=settings,
                    )
                )
            outcome = "failed" if user.id == consumer.id else "success"
            async with factory() as session:
                await OrderLifecycleService(session).initiate_sandbox_payment(
                    user.id, order_ids[-1], outcome
                )

        async with factory() as session:
            reservations = {
                reservation.order_id: reservation.status
                for reservation in (
                    await session.scalars(
                        select(StockReservation).where(
                            StockReservation.order_id.in_(order_ids)
                        )
                    )
                ).all()
            }
            stock = await session.scalar(
                select(HubStock).where(
                    HubStock.hub_id == hub.id,
                    HubStock.listing_id == listing.id,
                )
            )
            result = ([reservations[order_id] for order_id in order_ids], stock.available_quantity)
        await engine.dispose()
        return result

    try:
        statuses, available_quantity = asyncio.run(process_outcomes())
        assert statuses == [ReservationStatus.RELEASED, ReservationStatus.COMMITTED]
        assert available_quantity == Decimal("18.000")
    finally:
        cleanup(data)


def test_delivery_slots_promised_windows_and_slot_capacity_lifecycle():
    data = seed()
    consumer, _, other_consumer, consumer_profile, _, listing, _, hub = data
    other_hub_id = uuid4()

    async def exercise_phase4():
        custom_settings = Settings(
            hub_service_radius_km=Decimal("8"),
            packing_minutes=20,
            rider_speed_kmph=Decimal("15"),
            delivery_buffer_minutes=12,
            reservation_ttl_minutes=10,
        )
        engine = build_engine(custom_settings)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        now = datetime.now(timezone.utc)

        async with factory() as session:
            other_hub = Hub(
                id=other_hub_id,
                name=f"Other Hub {uuid4()}",
                address="Other Road",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751002",
                service_radius_km=Decimal("8"),
            )
            session.add(other_hub)
            await session.flush()

            future_slot = DeliverySlot(
                hub_id=hub.id,
                starts_at=now + timedelta(hours=2),
                ends_at=now + timedelta(hours=3),
                capacity=2,
                booked_count=1,
            )
            full_slot = DeliverySlot(
                hub_id=hub.id,
                starts_at=now + timedelta(hours=3),
                ends_at=now + timedelta(hours=4),
                capacity=2,
                booked_count=2,
            )
            past_slot = DeliverySlot(
                hub_id=hub.id,
                starts_at=now - timedelta(hours=2),
                ends_at=now - timedelta(hours=1),
                capacity=3,
                booked_count=0,
            )
            other_hub_slot = DeliverySlot(
                hub_id=other_hub.id,
                starts_at=now + timedelta(hours=2),
                ends_at=now + timedelta(hours=3),
                capacity=3,
                booked_count=0,
            )
            session.add_all([future_slot, full_slot, past_slot, other_hub_slot])
            cart = Cart(consumer_id=consumer_profile.id)
            session.add(cart)
            await session.flush()
            session.add(
                CartItem(
                    cart_id=cart.id,
                    listing_id=listing.id,
                    quantity=Decimal("2"),
                )
            )
            await session.commit()
            for s in (future_slot, full_slot, past_slot, other_hub_slot):
                await session.refresh(s)

        from backend.app.repositories.consumer_repository import ConsumerRepository
        from backend.app.repositories.orders_repository import OrdersRepository
        from backend.app.services.orders_service import OrdersService
        from backend.app.models import OrderStatus
        import pytest

        async with factory() as session:
            svc = OrdersService(
                OrdersRepository(session),
                ConsumerRepository(session),
                settings=custom_settings,
            )
            # ~2.22 km north of hub (20.3 -> 20.32 at lon 85.8)
            opts = await svc.checkout_options(consumer.id, 20.32, 85.8)
            hub_opt = next(h for h in opts.hubs if h.id == hub.id)
            expected_travel = int(
                (Decimal(str(hub_opt.distance_km)) / Decimal("15") * Decimal("60")).to_integral_value(
                    rounding="ROUND_CEILING"
                )
            )
            assert hub_opt.eta_min_minutes == 20 + expected_travel
            assert hub_opt.eta_max_minutes == 20 + expected_travel + 12
            # Only future_slot has starts_at > now and booked_count < capacity for this hub
            assert [s.id for s in hub_opt.slots] == [future_slot.id]
            assert hub_opt.slots[0].remaining_capacity == 1

        # Reject past slot, full slot, other hub's slot, and missing slot without changing booked_count
        for invalid_slot_id in (past_slot.id, full_slot.id, other_hub_slot.id, uuid4()):
            async with factory() as session:
                with pytest.raises(LifecycleConflict, match="delivery slot is no longer available"):
                    await OrderLifecycleService(session, settings=custom_settings).create_checkout_order(
                        LifecycleActor(consumer.id, UserRole.CONSUMER),
                        hub_id=hub.id,
                        delivery_slot_id=invalid_slot_id,
                        latitude=20.32,
                        longitude=85.8,
                        address="12 Market Road, Bhubaneswar",
                        settings=custom_settings,
                    )

        # ASAP checkout snapshots calculated promised window from settings
        async with factory() as session:
            before_order = datetime.now(timezone.utc)
            asap_order_id = await OrderLifecycleService(session, settings=custom_settings).create_checkout_order(
                LifecycleActor(consumer.id, UserRole.CONSUMER),
                hub_id=hub.id,
                delivery_slot_id=None,
                latitude=20.32,
                longitude=85.8,
                address="12 Market Road, Bhubaneswar",
                settings=custom_settings,
            )
            after_order = datetime.now(timezone.utc)
            asap_order = await session.get(Order, asap_order_id)
            window_minutes = round(
                (asap_order.promised_window_end - asap_order.promised_window_start).total_seconds() / 60
            )
            assert window_minutes == 12
            assert before_order + timedelta(minutes=20) <= asap_order.promised_window_start <= after_order + timedelta(minutes=35)
            await OrderLifecycleService(session, settings=custom_settings).transition_order(
                asap_order_id,
                LifecycleActor(consumer.id, UserRole.CONSUMER),
                OrderStatus.CANCELLED,
            )
            await session.commit()

        # Slot-backed checkout increments booked_count and snapshots slot starts_at / ends_at
        async with factory() as session:
            cart = await session.scalar(select(Cart).where(Cart.consumer_id == consumer_profile.id))
            session.add(CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("2")))
            await session.commit()

        async with factory() as session:
            slot_order_id = await OrderLifecycleService(session, settings=custom_settings).create_checkout_order(
                LifecycleActor(consumer.id, UserRole.CONSUMER),
                hub_id=hub.id,
                delivery_slot_id=future_slot.id,
                latitude=20.3,
                longitude=85.8,
                address="12 Market Road, Bhubaneswar",
                settings=custom_settings,
            )
            slot_order = await session.get(Order, slot_order_id)
            slot_row = await session.get(DeliverySlot, future_slot.id)
            assert slot_order.delivery_slot_id == future_slot.id
            assert slot_order.promised_window_start == future_slot.starts_at
            assert slot_order.promised_window_end == future_slot.ends_at
            assert slot_row.booked_count == 2

            # Now slot is full (2/2), so checkout_options omits it
            svc = OrdersService(
                OrdersRepository(session),
                ConsumerRepository(session),
                settings=custom_settings,
            )
            opts_when_full = await svc.checkout_options(consumer.id, 20.3, 85.8)
            hub_opt_full = next(h for h in opts_when_full.hubs if h.id == hub.id)
            assert hub_opt_full.slots == []

            # Cancelling order releases slot capacity back to 1
            await OrderLifecycleService(session, settings=custom_settings).transition_order(
                slot_order_id,
                LifecycleActor(consumer.id, UserRole.CONSUMER),
                OrderStatus.CANCELLED,
            )
            await session.commit()

        async with factory() as verify_session:
            slot_after_cancel = await verify_session.get(DeliverySlot, future_slot.id)
            assert slot_after_cancel.booked_count == 1

        # Failed payment and hold expiry also release slot capacity
        for release_mode in ("failed_payment", "expired_hold"):
            async with factory() as verify_session:
                slot_before_iter = await verify_session.get(DeliverySlot, future_slot.id)
                assert slot_before_iter.booked_count == 1
                assert slot_before_iter.starts_at > datetime.now(timezone.utc)

            async with factory() as session:
                cart = await session.scalar(select(Cart).where(Cart.consumer_id == consumer_profile.id))
                session.add(CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("2")))
                await session.commit()

            async with factory() as session:
                oid = await OrderLifecycleService(session, settings=custom_settings).create_checkout_order(
                    LifecycleActor(consumer.id, UserRole.CONSUMER),
                    hub_id=hub.id,
                    delivery_slot_id=future_slot.id,
                    latitude=20.3,
                    longitude=85.8,
                    address="12 Market Road, Bhubaneswar",
                    settings=custom_settings,
                )
                assert (await session.get(DeliverySlot, future_slot.id)).booked_count == 2
                if release_mode == "failed_payment":
                    await OrderLifecycleService(session, settings=custom_settings).initiate_sandbox_payment(
                        consumer.id, oid, "failed"
                    )
                else:
                    res = await session.scalar(
                        select(StockReservation).where(StockReservation.order_id == oid)
                    )
                    res.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
                    await session.flush()
                    await OrderLifecycleService(session, settings=custom_settings).expire_holds()
                await session.commit()

            async with factory() as verify_session:
                persisted_slot = await verify_session.get(DeliverySlot, future_slot.id)
                assert persisted_slot.booked_count == 1

        await engine.dispose()

    async def cleanup_extra_slots_and_hubs():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            orphan_hub_ids = list(
                (
                    await session.scalars(
                        select(Hub.id).where(Hub.name.like("Other Hub %"))
                    )
                ).all()
            )
            target_hub_ids = list({hub.id, other_hub_id, *orphan_hub_ids})
            await session.execute(
                delete(DeliverySlot).where(DeliverySlot.hub_id.in_(target_hub_ids))
            )
            await session.execute(
                delete(Hub).where(Hub.id.in_([other_hub_id, *orphan_hub_ids]))
            )
            await session.commit()
        await engine.dispose()

    try:
        asyncio.run(exercise_phase4())
    finally:
        asyncio.run(cleanup_extra_slots_and_hubs())
        cleanup(data)
