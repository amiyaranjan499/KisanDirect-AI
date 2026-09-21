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
from backend.app.models import AIPricePrediction, Crop, CropListing, Farmer, User, UserRole

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(email=f"price-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            other_user = User(email=f"price-other-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            consumer = User(email=f"price-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            session.add_all([farmer_user, other_user, consumer])
            await session.flush()
            farmer = Farmer(user_id=farmer_user.id, name="Price Farmer")
            other = Farmer(user_id=other_user.id, name="Other Price Farmer")
            session.add_all([farmer, other])
            await session.flush()
            crop = Crop(name=f"Price Test Crop {uuid4()}", category="Grain")
            session.add(crop)
            await session.flush()
            listing = CropListing(crop_id=crop.id, farmer_id=farmer.id, quantity=Decimal("25"), unit="kg", asking_price=Decimal("120"))
            session.add(listing)
            await session.commit()
            await session.refresh(farmer_user)
            await session.refresh(other_user)
            await session.refresh(consumer)
            await session.refresh(farmer)
            await session.refresh(other)
            await session.refresh(listing)
        await engine.dispose()
        return farmer_user, other_user, consumer, farmer, other, listing, crop
    return asyncio.run(create())


def cleanup(data):
    farmer_user, other_user, consumer, farmer, other, listing, crop = data
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(AIPricePrediction).where(AIPricePrediction.listing_id == listing.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Farmer).where(Farmer.id.in_([farmer.id, other.id])))
            await session.execute(delete(User).where(User.id.in_([farmer_user.id, other_user.id, consumer.id])))
            await session.commit()
        await engine.dispose()
    asyncio.run(remove())


def test_price_prediction_model_unavailable_and_authorization():
    data = seed()
    farmer_user, other_user, consumer, _, _, listing, _ = data
    try:
        with TestClient(create_app()) as client:
            no_auth = client.post(f"/api/v1/ai/price/predict?listing_id={listing.id}", json={})
            assert no_auth.status_code == 401

            consumer_blocked = client.post(f"/api/v1/ai/price/predict?listing_id={listing.id}", headers=auth_header(consumer), json={})
            assert consumer_blocked.status_code == 403

            other_blocked = client.post(f"/api/v1/ai/price/predict?listing_id={listing.id}", headers=auth_header(other_user), json={"quality_grade": "Good"})
            assert other_blocked.status_code == 404

            invalid = client.post(f"/api/v1/ai/price/predict?listing_id={listing.id}", headers=auth_header(farmer_user), json={"quality_grade": "x" * 81})
            assert invalid.status_code == 422

            response = client.post(f"/api/v1/ai/price/predict?listing_id={listing.id}", headers=auth_header(farmer_user), json={"quality_grade": "Good"})
            assert response.status_code == 201
            body = response.json()
            assert body["prediction_status"] == "MODEL_UNAVAILABLE"
            assert body["predicted_price"] is None
            assert body["confidence"] is None
            assert body["currency"] == "INR"
            assert body["input_features"]["quality_grade"] == "Good"

            retrieved = client.get(f"/api/v1/ai/price/{body['id']}", headers=auth_header(farmer_user))
            assert retrieved.status_code == 200
            forbidden = client.get(f"/api/v1/ai/price/{body['id']}", headers=auth_header(other_user))
            assert forbidden.status_code == 404
    finally:
        cleanup(data)
