import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import AvailabilityStatus, Consumer, Crop, CropListing, Farmer, User, UserRole

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer = User(email=f"nearby-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            farmer_users = [User(email=f"nearby-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER) for _ in range(3)]
            session.add_all([consumer, *farmer_users])
            await session.flush()
            consumer_profile = Consumer(user_id=consumer.id, name="Nearby Consumer")
            farmers = [
                Farmer(user_id=farmer_users[0].id, name="Near Farmer", location=WKTElement("POINT(85.8005 20.3005)", srid=4326)),
                Farmer(user_id=farmer_users[1].id, name="Far Farmer", location=WKTElement("POINT(86.8000 21.3000)", srid=4326)),
                Farmer(user_id=farmer_users[2].id, name="No Location Farmer"),
            ]
            session.add_all([consumer_profile, *farmers])
            await session.flush()
            crops = [Crop(name=f"Nearby Crop {uuid4()}", category="Grain") for _ in farmers[:2]]
            session.add_all(crops)
            await session.flush()
            listings = [
                CropListing(crop_id=crops[0].id, farmer_id=farmers[0].id, quantity=Decimal("10"), unit="kg", asking_price=Decimal("50"), availability_status=AvailabilityStatus.AVAILABLE),
                CropListing(crop_id=crops[1].id, farmer_id=farmers[1].id, quantity=Decimal("10"), unit="kg", asking_price=Decimal("60"), availability_status=AvailabilityStatus.AVAILABLE),
            ]
            session.add_all(listings)
            await session.commit()
            for item in [consumer, *farmers, *listings, *crops]:
                await session.refresh(item)
        await engine.dispose()
        return consumer, farmer_users, farmers, listings, crops
    return asyncio.run(create())


def cleanup(data):
    consumer, farmer_users, farmers, listings, crops = data
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(CropListing).where(CropListing.id.in_([item.id for item in listings])))
            await session.execute(delete(Crop).where(Crop.id.in_([item.id for item in crops])))
            await session.execute(delete(Consumer).where(Consumer.user_id == consumer.id))
            await session.execute(delete(Farmer).where(Farmer.id.in_([item.id for item in farmers])))
            await session.execute(delete(User).where(User.id.in_([consumer.id, *[item.id for item in farmer_users]])))
            await session.commit()
        await engine.dispose()
    asyncio.run(remove())


def test_nearby_farmers_radius_sort_pagination_and_authorization():
    data = seed()
    consumer, farmer_users, farmers, listings, crops = data
    try:
        with TestClient(create_app()) as client:
            unauthorized = client.get("/api/v1/marketplace/farmers/nearby", params={"latitude": 20.3, "longitude": 85.8})
            assert unauthorized.status_code == 401

            invalid = client.get("/api/v1/marketplace/farmers/nearby", headers=auth_header(consumer), params={"latitude": 91, "longitude": 85.8})
            assert invalid.status_code == 422
            invalid_radius = client.get("/api/v1/marketplace/farmers/nearby", headers=auth_header(consumer), params={"latitude": 20.3, "longitude": 85.8, "radius_km": 0})
            assert invalid_radius.status_code == 422

            result = client.get("/api/v1/marketplace/farmers/nearby", headers=auth_header(consumer), params={"latitude": 20.3, "longitude": 85.8, "radius_km": 200, "page_size": 1})
            assert result.status_code == 200
            body = result.json()
            assert body["total"] >= 2
            assert body["items"][0]["name"] == "Near Farmer"
            assert body["items"][0]["distance_km"] >= 0
            assert body["pages"] == body["total"]
            assert body["items"][0]["active_listing_count"] == 1

            # Fetch all within 200km to verify both test farmers with locations are included and no-location farmer is excluded
            all_nearby = client.get("/api/v1/marketplace/farmers/nearby", headers=auth_header(consumer), params={"latitude": 20.3, "longitude": 85.8, "radius_km": 200, "page_size": 50})
            assert all_nearby.status_code == 200
            nearby_ids = {item["id"] for item in all_nearby.json()["items"]}
            assert str(farmers[0].id) in nearby_ids
            assert str(farmers[1].id) in nearby_ids
            assert str(farmers[2].id) not in nearby_ids

            narrow = client.get("/api/v1/marketplace/farmers/nearby", headers=auth_header(consumer), params={"latitude": 20.3, "longitude": 85.8, "radius_km": 1})
            assert narrow.status_code == 200
            assert narrow.json()["total"] == 1
            assert narrow.json()["items"][0]["name"] == "Near Farmer"
            assert narrow.json()["items"][0]["id"] == str(farmers[0].id)
    finally:
        cleanup(data)
