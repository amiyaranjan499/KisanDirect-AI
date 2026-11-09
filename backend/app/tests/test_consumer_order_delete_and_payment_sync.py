import asyncio
import sys
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
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStock,
    Order,
    StockReservation,
    User,
    UserRole,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed_test_data():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer_a = User(
                email=f"cons-a-{uuid4()}@example.com",
                hashed_password=hash_password("Password-123"),
                role=UserRole.CONSUMER,
            )
            consumer_b = User(
                email=f"cons-b-{uuid4()}@example.com",
                hashed_password=hash_password("Password-123"),
                role=UserRole.CONSUMER,
            )
            farmer_user = User(
                email=f"farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Password-123"),
                role=UserRole.FARMER,
            )
            session.add_all([consumer_a, consumer_b, farmer_user])
            await session.flush()

            profile_a = Consumer(user_id=consumer_a.id, name="Consumer Alpha")
            profile_b = Consumer(user_id=consumer_b.id, name="Consumer Beta")
            farmer_profile = Farmer(user_id=farmer_user.id, name="Farmer One")
            session.add_all([profile_a, profile_b, farmer_profile])
            await session.flush()

            crop = Crop(name=f"Crop {uuid4()}", category="Vegetables")
            session.add(crop)
            await session.flush()

            # Price with decimal cents to test exact fractional math
            listing = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("50.000"),
                minimum_order_quantity=Decimal("1.000"),
                unit="kg",
                asking_price=Decimal("47.75"),
                availability_status=AvailabilityStatus.AVAILABLE,
            )
            session.add(listing)
            await session.flush()

            hub = Hub(
                name=f"Hub-{uuid4().hex[:6]}",
                address="Bhubaneswar Centre",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751001",
                service_radius_km=Decimal("15"),
            )
            session.add(hub)
            await session.flush()

            session.add(
                HubStock(
                    hub_id=hub.id,
                    listing_id=listing.id,
                    available_quantity=Decimal("50.000"),
                )
            )
            await session.commit()
            for obj in [consumer_a, consumer_b, farmer_user, profile_a, profile_b, farmer_profile, listing, crop, hub]:
                await session.refresh(obj)
        await engine.dispose()
        return consumer_a, consumer_b, farmer_user, profile_a, profile_b, farmer_profile, listing, crop, hub

    return asyncio.run(create())


def cleanup_test_data(data):
    consumer_a, consumer_b, farmer_user, profile_a, profile_b, farmer_profile, listing, crop, hub = data

    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(
                delete(Order).where(Order.consumer_id.in_([profile_a.id, profile_b.id]))
            )
            await session.execute(
                delete(StockReservation).where(
                    StockReservation.hub_stock_id.in_(
                        select(HubStock.id).where(HubStock.hub_id == hub.id)
                    )
                )
            )
            await session.execute(delete(HubStock).where(HubStock.hub_id == hub.id))
            await session.execute(delete(Hub).where(Hub.id == hub.id))
            await session.execute(
                delete(Cart).where(Cart.consumer_id.in_([profile_a.id, profile_b.id]))
            )
            await session.execute(delete(CropListing).where(CropListing.crop_id == crop.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(
                delete(Consumer).where(Consumer.user_id.in_([consumer_a.id, consumer_b.id]))
            )
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(
                delete(User).where(User.id.in_([consumer_a.id, consumer_b.id, farmer_user.id]))
            )
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_consumer_order_delete_and_isolation():
    data = seed_test_data()
    consumer_a, consumer_b, farmer_user, profile_a, profile_b, farmer_profile, listing, crop, hub = data

    try:
        with TestClient(create_app()) as client:
            # 1. Consumer A adds item to cart and checks out
            add_resp = client.post(
                "/api/v1/cart/items",
                headers=auth_header(consumer_a),
                json={"listing_id": str(listing.id), "quantity": "2.000"},
            )
            assert add_resp.status_code == 201, add_resp.text

            checkout_resp = client.post(
                "/api/v1/orders",
                headers=auth_header(consumer_a),
                json={
                    "latitude": 20.30,
                    "longitude": 85.80,
                    "address": "123 Farm Lane, Consumer City",
                },
            )
            assert checkout_resp.status_code == 201, checkout_resp.text
            order_data = checkout_resp.json()
            order_id = order_data["id"]

            # Verify order is in Consumer A's orders list
            orders_resp = client.get("/api/v1/orders", headers=auth_header(consumer_a))
            assert orders_resp.status_code == 200
            order_ids = [o["id"] for o in orders_resp.json()["items"]]
            assert order_id in order_ids

            # 2. Consumer B attempts to delete Consumer A's order -> must fail with 404
            b_delete_resp = client.delete(
                f"/api/v1/orders/{order_id}",
                headers=auth_header(consumer_b),
            )
            assert b_delete_resp.status_code == 404

            # Verify order is still present for Consumer A
            orders_resp2 = client.get("/api/v1/orders", headers=auth_header(consumer_a))
            assert orders_resp2.status_code == 200
            assert order_id in [o["id"] for o in orders_resp2.json()["items"]]

            # 3. Consumer A permanently deletes their own order
            del_resp = client.delete(
                f"/api/v1/orders/{order_id}",
                headers=auth_header(consumer_a),
            )
            assert del_resp.status_code == 204

            # 4. Verify order is permanently removed from list and detail
            orders_resp3 = client.get("/api/v1/orders", headers=auth_header(consumer_a))
            assert orders_resp3.status_code == 200
            assert order_id not in [o["id"] for o in orders_resp3.json()["items"]]

            detail_resp = client.get(
                f"/api/v1/orders/{order_id}",
                headers=auth_header(consumer_a),
            )
            assert detail_resp.status_code == 404

    finally:
        cleanup_test_data(data)


def test_cart_checkout_order_payment_amount_synchronization():
    data = seed_test_data()
    consumer_a, consumer_b, farmer_user, profile_a, profile_b, farmer_profile, listing, crop, hub = data

    try:
        with TestClient(create_app()) as client:
            # 1. Add 3 kg of listing (price 47.75) -> Subtotal = 143.25
            cart_resp = client.post(
                "/api/v1/cart/items",
                headers=auth_header(consumer_a),
                json={"listing_id": str(listing.id), "quantity": "3.000"},
            )
            assert cart_resp.status_code == 201
            cart_data = cart_resp.json()
            assert cart_data["subtotal"] == "143.25"
            assert cart_data["total"] == "143.25"
            assert cart_data["delivery_fee"] == "0.00"
            assert cart_data["platform_fee"] == "0.00"

            # 2. Checkout options must return identical subtotal and total
            options_resp = client.get(
                "/api/v1/checkout/options",
                headers=auth_header(consumer_a),
                params={"latitude": 20.30, "longitude": 85.80},
            )
            assert options_resp.status_code == 200
            options_data = options_resp.json()
            assert options_data["subtotal"] == "143.25"
            assert options_data["total"] == "143.25"
            assert options_data["delivery_fee"] == "0.00"
            assert options_data["platform_fee"] == "0.00"

            # 3. Create order -> Order subtotal and total_amount must be exactly 143.25
            order_resp = client.post(
                "/api/v1/orders",
                headers=auth_header(consumer_a),
                json={
                    "latitude": 20.30,
                    "longitude": 85.80,
                    "address": "777 Farm View Road",
                },
            )
            assert order_resp.status_code == 201
            order_data = order_resp.json()
            order_id = order_data["id"]
            assert order_data["subtotal"] == "143.25"
            assert order_data["total_amount"] == "143.25"
            assert order_data["items"][0]["unit_price"] == "47.75"
            assert order_data["items"][0]["subtotal"] == "143.25"

            # 4. Initiate test payment -> Payment amount must match order.total_amount exactly
            payment_resp = client.post(
                f"/api/v1/payments/test/{order_id}",
                headers=auth_header(consumer_a),
                json={"outcome": "success"},
            )
            assert payment_resp.status_code == 201, payment_resp.text
            payment_data = payment_resp.json()
            assert payment_data["amount"] == "143.25"
            assert payment_data["status"] == "successful"

            # 5. Order detail query must reflect 143.25 with successful payment
            detail_resp = client.get(
                f"/api/v1/orders/{order_id}",
                headers=auth_header(consumer_a),
            )
            assert detail_resp.status_code == 200
            detail_data = detail_resp.json()
            assert detail_data["total_amount"] == "143.25"
            assert detail_data["payment"]["amount"] == "143.25"

    finally:
        cleanup_test_data(data)
