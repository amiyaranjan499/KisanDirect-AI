import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete
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
    Order,
    User,
    UserRole,
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
            await session.commit()
            for item in [consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop]:
                await session.refresh(item)
        await engine.dispose()
        return consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop
    return asyncio.run(create())


def cleanup(data):
    consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop = data
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(Order).where(Order.consumer_id.in_([consumer_profile.id])))
            await session.execute(delete(Cart).where(Cart.consumer_id.in_([consumer_profile.id, other_consumer.id])))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer.id, other_consumer.id])))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([consumer.id, farmer.id, other_consumer.id])))
            await session.commit()
        await engine.dispose()
    asyncio.run(remove())


def test_cart_validation_checkout_history_and_authorization():
    data = seed()
    consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop = data
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

            order = client.post("/api/v1/orders", headers=header(consumer))
            assert order.status_code == 201
            order_body = order.json()
            assert order_body["total_amount"] == "40.00"
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
    consumer, farmer, other_consumer, consumer_profile, farmer_profile, listing, crop = data
    try:
        with TestClient(create_app()) as client:
            added = client.post("/api/v1/cart/items", headers=header(consumer), json={"listing_id": str(listing.id), "quantity": "5"})
            assert added.status_code == 201
            async def lower_stock():
                engine = build_engine(Settings())
                factory = async_sessionmaker(engine, expire_on_commit=False)
                async with factory() as session:
                    row = await session.get(CropListing, listing.id)
                    row.quantity = Decimal("3")
                    await session.commit()
                await engine.dispose()
            asyncio.run(lower_stock())
            failed = client.post("/api/v1/orders", headers=header(consumer))
            assert failed.status_code == 409
            cart = client.get("/api/v1/cart", headers=header(consumer))
            assert len(cart.json()["items"]) == 1
    finally:
        cleanup(data)
