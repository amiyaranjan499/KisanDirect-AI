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
from backend.app.database.session import build_engine, get_db_session
from backend.app.main import create_app
from backend.app.models import AIQualityPrediction, Crop, CropImage, CropListing, Farmer, User, UserRole
from backend.app.repositories.quality_repository import QualityRepository
from backend.app.routers.quality import get_quality_service
from backend.app.services.quality_service import QualityService
from ml.crop_quality.inference import CropQualityInference

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def image_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (32, 32), (30, 150, 70)).save(output, format="PNG")
    return output.getvalue()


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_fixture(crop_name: str | None = None, category: str = "Vegetables") -> tuple[User, User, Farmer, CropListing, Crop]:
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
            name = crop_name or f"Tomato {uuid4()}"
            crop = Crop(name=name, category=category)
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


def test_quality_prediction_successful_inference() -> None:
    farmer, other_farmer, farmer_profile, listing, crop = seed_fixture(crop_name=f"Tomato {uuid4()}")
    try:
        with TestClient(create_app()) as client:
            response = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("tomato.png", image_bytes(), "image/png")},
            )
            assert response.status_code == 201
            body = response.json()
            assert body["prediction_status"] == "COMPLETED"
            assert body["quality_label"] in ("Good", "Average", "Poor")
            assert body["confidence"] is not None
            assert 0.0 <= body["confidence"] <= 1.0
            assert body["model_name"] == "crop-quality-mobilenet-v2"
            assert body["model_version"] == "v1.0"
            assert body["image_id"] is not None

            metadata = body.get("result_metadata", {})
            assert "class_probabilities" in metadata
            assert set(metadata["class_probabilities"].keys()) == {"Good", "Average", "Poor"}

            prediction_id = body["id"]
            retrieved = client.get(
                f"/api/v1/ai/quality/{prediction_id}",
                headers=auth_header(farmer),
            )
            assert retrieved.status_code == 200
            retrieved_body = retrieved.json()
            assert retrieved_body["prediction_status"] == "COMPLETED"
            assert retrieved_body["quality_label"] == body["quality_label"]
            assert retrieved_body["confidence"] == body["confidence"]
    finally:
        cleanup_fixture([farmer.id, other_farmer.id], farmer_profile.id, listing.id, crop.id)


def test_quality_prediction_unsupported_crop() -> None:
    farmer, other_farmer, farmer_profile, listing, crop = seed_fixture(crop_name=f"Wheat Grain {uuid4()}", category="Grain")
    try:
        with TestClient(create_app()) as client:
            response = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("wheat.png", image_bytes(), "image/png")},
            )
            assert response.status_code == 201
            body = response.json()
            assert body["prediction_status"] == "UNSUPPORTED_CROP"
            assert body["quality_label"] is None
            assert body["confidence"] is None

            metadata = body.get("result_metadata", {})
            assert "reason" in metadata
            assert "not supported" in metadata["reason"]
    finally:
        cleanup_fixture([farmer.id, other_farmer.id], farmer_profile.id, listing.id, crop.id)


def test_quality_prediction_missing_artifact_fallback() -> None:
    farmer, other_farmer, farmer_profile, listing, crop = seed_fixture(crop_name=f"Apple {uuid4()}")
    app = create_app()

    def override_quality_service(session=None):
        nonexistent_path = Path(__file__).resolve().parent / "does_not_exist.onnx"
        inference = CropQualityInference(model_path=nonexistent_path)
        storage_root = Path(__file__).resolve().parents[2] / "storage"
        return QualityService(QualityRepository(session), storage_root, inference=inference)

    from fastapi import Depends

    app.dependency_overrides[get_quality_service] = lambda session=Depends(get_db_session): QualityService(
        QualityRepository(session),
        Path(__file__).resolve().parents[2] / "storage",
        inference=CropQualityInference(model_path=Path(__file__).resolve().parent / "nonexistent.onnx"),
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("apple.png", image_bytes(), "image/png")},
            )
            assert response.status_code == 201
            body = response.json()
            assert body["prediction_status"] == "MODEL_UNAVAILABLE"
            assert body["quality_label"] is None
            assert body["confidence"] is None
    finally:
        cleanup_fixture([farmer.id, other_farmer.id], farmer_profile.id, listing.id, crop.id)


def test_quality_prediction_authorization_and_validation() -> None:
    farmer, other_farmer, farmer_profile, listing, crop = seed_fixture(crop_name=f"Papaya {uuid4()}")
    try:
        with TestClient(create_app()) as client:
            # 1. Missing Authorization header -> 401
            unauthorized = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                files={"image": ("crop.png", image_bytes(), "image/png")},
            )
            assert unauthorized.status_code == 401

            # 2. Accessing another farmer's listing -> 404
            wrong_owner = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(other_farmer),
                files={"image": ("crop.png", image_bytes(), "image/png")},
            )
            assert wrong_owner.status_code == 404

            # 3. Invalid file format (text file) -> 422
            invalid_type = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("crop.txt", b"not-an-image", "text/plain")},
            )
            assert invalid_type.status_code == 422

            # 4. Corrupted image bytes -> 422
            corrupted = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("crop.png", b"\x89PNG\r\n\x1a\ncorrupt", "image/png")},
            )
            assert corrupted.status_code == 422

            # 5. Successful prediction on supported crop Papaya
            valid_response = client.post(
                f"/api/v1/ai/quality/predict?listing_id={listing.id}",
                headers=auth_header(farmer),
                files={"image": ("papaya.png", image_bytes(), "image/png")},
            )
            assert valid_response.status_code == 201
            prediction_id = valid_response.json()["id"]

            # 6. Another farmer attempting to fetch this prediction -> 404
            forbidden = client.get(
                f"/api/v1/ai/quality/{prediction_id}",
                headers=auth_header(other_farmer),
            )
            assert forbidden.status_code == 404
    finally:
        cleanup_fixture([farmer.id, other_farmer.id], farmer_profile.id, listing.id, crop.id)
