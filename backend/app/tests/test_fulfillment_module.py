import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import Consumer, Crop, CropListing, Delivery, Farmer, Order, OrderItem, OrderStatus, User, UserRole, AvailabilityStatus

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def header(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer = User(email=f"fulfillment-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            farmer = User(email=f"fulfillment-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            other = User(email=f"fulfillment-other-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            session.add_all([consumer, farmer, other])
            await session.flush()
            consumer_profile = Consumer(user_id=consumer.id, name="Fulfillment Consumer")
            other_profile = Consumer(user_id=other.id, name="Other Consumer")
            farmer_profile = Farmer(user_id=farmer.id, name="Fulfillment Farmer", location=WKTElement("POINT(85.8 20.3)", srid=4326))
            session.add_all([consumer_profile, other_profile, farmer_profile])
            await session.flush()
            crop = Crop(name=f"Fulfillment Crop {uuid4()}", category="Grain")
            session.add(crop)
            await session.flush()
            listing = CropListing(crop_id=crop.id, farmer_id=farmer_profile.id, quantity=Decimal("20"), minimum_order_quantity=Decimal("1"), unit="kg", asking_price=Decimal("10"), availability_status=AvailabilityStatus.AVAILABLE)
            session.add(listing)
            await session.flush()
            order = Order(consumer_id=consumer_profile.id, status=OrderStatus.CONFIRMED, total_amount=Decimal("20"))
            session.add(order)
            await session.flush()
            session.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=Decimal("2"), unit_price=Decimal("10"), subtotal=Decimal("20")))
            await session.commit()
            for item in [consumer, farmer, other, consumer_profile, other_profile, farmer_profile, crop, listing, order]:
                await session.refresh(item)
        await engine.dispose()
        return consumer, farmer, other, consumer_profile, other_profile, farmer_profile, crop, listing, order
    return asyncio.run(create())


def cleanup(data):
    consumer, farmer, other, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            order_ids = select(Order.id).where(Order.consumer_id == consumer_profile.id)
            await session.execute(delete(Delivery).where(Delivery.order_id.in_(order_ids)))
            await session.execute(delete(Order).where(Order.consumer_id == consumer_profile.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer.id, other.id])))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([consumer.id, farmer.id, other.id])))
            await session.commit()
        await engine.dispose()
    asyncio.run(remove())


def test_delivery_pickup_authorization_and_transitions():
    data = seed()
    consumer, farmer, other, *_rest, order = data
    try:
        with TestClient(create_app()) as client:
            missing_address = client.post(f"/api/v1/orders/{order.id}/fulfillment", headers=header(consumer), json={"method": "DELIVERY"})
            assert missing_address.status_code == 409

            delivery = client.post(f"/api/v1/orders/{order.id}/fulfillment", headers=header(consumer), json={"method": "DELIVERY", "address": "12 Farm Road"})
            assert delivery.status_code == 201
            assert delivery.json()["method"] == "DELIVERY"
            assert delivery.json()["address"] == "12 Farm Road"

            duplicate = client.post(f"/api/v1/orders/{order.id}/fulfillment", headers=header(consumer), json={"method": "FARMER_PICKUP"})
            assert duplicate.status_code == 409

            other_access = client.get(f"/api/v1/orders/{order.id}/fulfillment", headers=header(other))
            assert other_access.status_code == 404
            farmer_access = client.get(f"/api/v1/orders/{order.id}/fulfillment", headers=header(farmer))
            assert farmer_access.status_code == 200

            confirmed = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "CONFIRMED"})
            assert confirmed.status_code == 200
            out = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "OUT_FOR_DELIVERY"})
            assert out.status_code == 200
            delivered = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "DELIVERED"})
            assert delivered.status_code == 200
            invalid = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "READY"})
            assert invalid.status_code == 409
    finally:
        cleanup(data)


def test_pickup_uses_farmer_location_and_ready_flow():
    data = seed()
    consumer, farmer, other, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    async def reset_fulfillment():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
            await session.execute(delete(Order).where(Order.id == order.id))
            new_order = Order(consumer_id=consumer_profile.id, status=OrderStatus.CONFIRMED, total_amount=Decimal("20"))
            session.add(new_order)
            await session.flush()
            session.add(OrderItem(order_id=new_order.id, listing_id=listing.id, quantity=Decimal("2"), unit_price=Decimal("10"), subtotal=Decimal("20")))
            await session.commit()
            await session.refresh(new_order)
        await engine.dispose()
        return new_order
    try:
        order = asyncio.run(reset_fulfillment())
        with TestClient(create_app()) as client:
            pickup = client.post(f"/api/v1/orders/{order.id}/fulfillment", headers=header(consumer), json={"method": "FARMER_PICKUP"})
            assert pickup.status_code == 201
            assert pickup.json()["pickup_location"] == "20.3, 85.8"
            ready = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "CONFIRMED"})
            assert ready.status_code == 200
            ready = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "READY"})
            assert ready.status_code == 200
            picked = client.patch(f"/api/v1/orders/{order.id}/fulfillment/status", headers=header(farmer), json={"status": "PICKED_UP"})
            assert picked.status_code == 200
    finally:
        cleanup(data)
