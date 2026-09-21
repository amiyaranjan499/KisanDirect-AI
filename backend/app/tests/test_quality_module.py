import asyncio
import io
import sys
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import AIQualityPrediction, Crop, CropImage, CropListing, Farmer, User, UserRole


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def image_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (32, 32), (30, 150, 70)).save(output, format="PNG")
    return output.getvalue()


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_fixture() -> tuple[User, User, Farmer, CropListing, Crop]:
    async def seed():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(
                email=f"quality-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            other_user = User(
                email=f"quality-other-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            session.add_all([farmer_user, other_user])
            await session.flush()
            farmer = Farmer(user_id=farmer_user.id, name="Quality Test Farmer")
            other_farmer = Farmer(user_id=other_user.id, name="Other Quality Farmer")
            session.add_all([farmer, other_farmer])
            await session.flush()
            crop = Crop(name=f"Quality Test Crop {uuid4()}", category="Grain")
            session.add(crop)
            await session.flush()
            listing = CropListing(
                farmer_id=farmer.id,
                crop_id=crop.id,
                quantity=Decimal("10"),
                unit="kg",
                asking_price=Decimal("100"),
            )
            session.add(listing)
            await session.commit()
            await session.refresh(farmer_user)
            await session.refresh(other_user)
            await session.refresh(farmer)
            await session.refresh(listing)
        await engine.dispose()
        return farmer_user, other_user, farmer, listing, crop

    return asyncio.run(seed())


def cleanup_fixture(user_ids, farmer_id, listing_id, crop_id):
    async def cleanup():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            image_rows = await session.execute(
                __import__("sqlalchemy").select(CropImage.storage_url).where(CropImage.listing_id == listing_id)
            )
            for storage_url in image_rows.scalars():
                path = Path(__file__).resolve().parents[2] / "storage" / storage_url
                path.unlink(missing_ok=True)
            await session.execute(delete(AIQualityPrediction).where(AIQualityPrediction.listing_id == listing_id))
            await session.execute(delete(CropImage).where(CropImage.listing_id == listing_id))
            await session.execute(delete(CropListing).where(CropListing.id == listing_id))
            await session.execute(delete(Crop).where(Crop.id == crop_id))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_id))
            await session.execute(delete(Farmer).where(Farmer.user_id.in_(user_ids)))
            await session.execute(delete(User).where(User.id.in_(user_ids)))
            await session.commit()
        await engine.dispose()

    asyncio.run(cleanup())


def test_quality_prediction_upload_authorization_and_unavailable_model() -> None:
    farmer, other_farmer, farmer_profile, listing, crop = seed_fixture()
    try:
        with TestClient(create_app()) as client:
            unauthorized = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                files={"image": ("crop.png", image_bytes(), "image/png")},
            )
            assert unauthorized.status_code == 401

            wrong_owner = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(other_farmer),
                files={"image": ("crop.png", image_bytes(), "image/png")},
            )
            assert wrong_owner.status_code == 404

            invalid_type = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("crop.txt", b"not-an-image", "text/plain")},
            )
            assert invalid_type.status_code == 422

            corrupted = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("crop.png", b"\x89PNG\r\n\x1a\ncorrupt", "image/png")},
            )
            assert corrupted.status_code == 422

            response = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("crop.png", image_bytes(), "image/png")},
            )
            assert response.status_code == 201
            body = response.json()
            assert body["prediction_status"] == "MODEL_UNAVAILABLE"
            assert body["quality_label"] is None
            assert body["confidence"] is None
            assert body["image_id"] is not None

            prediction_id = body["id"]
            retrieved = client.get(
                f"/api/v1/ai/quality/{prediction_id}",
                headers=auth_header(farmer),
            )
            assert retrieved.status_code == 200
            assert retrieved.json()["prediction_status"] == "MODEL_UNAVAILABLE"

            forbidden = client.get(
                f"/api/v1/ai/quality/{prediction_id}",
                headers=auth_header(other_farmer),
            )
            assert forbidden.status_code == 404
    finally:
        cleanup_fixture([farmer.id, other_farmer.id], farmer_profile.id, listing.id, crop.id)
