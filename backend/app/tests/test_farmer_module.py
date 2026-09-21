import asyncio
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import Crop, CropImage, CropListing, Farmer, User, UserRole


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def create_user(role: UserRole, email: str) -> User:
    async def create() -> User:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            user = User(email=email, hashed_password=hash_password("Test-password-123"), role=role)
            session.add(user)
            await session.commit()
            await session.refresh(user)
            result = User(
                id=user.id,
                email=user.email,
                hashed_password=user.hashed_password,
                role=user.role,
            )
        await engine.dispose()
        return result

    return asyncio.run(create())


def cleanup_users(*user_ids, crop_name: str | None = None) -> None:
    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_ids = [
                row[0]
                for row in (
                    await session.execute(
                        select(Farmer.id).where(Farmer.user_id.in_(user_ids))
                    )
                ).all()
            ]
            listing_ids = [
                row[0]
                for row in (
                    await session.execute(
                        select(CropListing.id).where(CropListing.farmer_id.in_(farmer_ids))
                    )
                ).all()
            ] if farmer_ids else []
            if listing_ids:
                await session.execute(delete(CropImage).where(CropImage.listing_id.in_(listing_ids)))
                await session.execute(delete(CropListing).where(CropListing.id.in_(listing_ids)))
            if farmer_ids:
                await session.execute(delete(Farmer).where(Farmer.id.in_(farmer_ids)))
            await session.execute(delete(User).where(User.id.in_(user_ids)))
            if crop_name:
                await session.execute(delete(Crop).where(Crop.name == crop_name))
            await session.commit()
        await engine.dispose()

    asyncio.run(cleanup())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def test_farmer_profile_requires_authentication() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/farmers/me")

    assert response.status_code == 401


def test_farmer_profile_returns_not_found_when_profile_is_missing() -> None:
    farmer = create_user(UserRole.FARMER, f"farmer-no-profile-{uuid4()}@example.com")
    try:
        with TestClient(create_app()) as client:
            response = client.get("/api/v1/farmers/me", headers=auth_header(farmer))

        assert response.status_code == 404
        assert response.json()["detail"] == "Farmer profile not found"
    finally:
        cleanup_users(farmer.id)


def test_farmer_profile_listing_ownership_and_image_validation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app = create_app()
    farmer = create_user(UserRole.FARMER, f"farmer-{uuid4()}@example.com")
    other_farmer = create_user(UserRole.FARMER, f"other-{uuid4()}@example.com")
    consumer = create_user(UserRole.CONSUMER, f"consumer-{uuid4()}@example.com")

    crop_name = f"Test Crop {uuid4()}"
    try:
        with TestClient(app) as client:
            profile = client.put(
                "/api/v1/farmers/me",
                headers=auth_header(farmer),
                json={
                    "name": "Test Farmer",
                    "phone": "5550100",
                    "address": "Test farm",
                    "location": {"latitude": 20.3, "longitude": 85.8},
                },
            )
            assert profile.status_code == 200
            assert profile.json()["location"] == {"latitude": 20.3, "longitude": 85.8}
            assert client.get("/api/v1/farmers/me", headers=auth_header(farmer)).status_code == 200

            invalid_profile = client.put(
                "/api/v1/farmers/me",
                headers=auth_header(farmer),
                json={"name": "", "phone": "5550100"},
            )
            assert invalid_profile.status_code == 422

            listing = client.post(
                "/api/v1/farmers/me/listings",
                headers=auth_header(farmer),
                json={
                    "crop_name": crop_name,
                    "crop_category": "Grain",
                    "quantity": "10.500",
                    "unit": "kg",
                    "asking_price": "125.50",
                    "description": "Temporary test listing",
                    "location": {"latitude": 20.3, "longitude": 85.8},
                },
            )
            assert listing.status_code == 201
            listing_id = listing.json()["id"]
            assert len(client.get("/api/v1/farmers/me/listings", headers=auth_header(farmer)).json()) == 1

            invalid = client.post(
                "/api/v1/farmers/me/listings",
                headers=auth_header(farmer),
                json={"crop_name": "Invalid", "quantity": 0, "unit": "kg", "asking_price": -1},
            )
            assert invalid.status_code == 422

            forbidden = client.patch(
                f"/api/v1/farmers/me/listings/{listing_id}",
                headers=auth_header(other_farmer),
                json={"description": "Should not change"},
            )
            assert forbidden.status_code == 404

            role_blocked = client.get("/api/v1/farmers/me", headers=auth_header(consumer))
            assert role_blocked.status_code == 403

            bad_image = client.post(
                f"/api/v1/farmers/me/listings/{listing_id}/images",
                headers=auth_header(farmer),
                files={"image": ("bad.txt", b"not-an-image", "text/plain")},
            )
            assert bad_image.status_code == 422

            deactivated = client.delete(
                f"/api/v1/farmers/me/listings/{listing_id}",
                headers=auth_header(farmer),
            )
            assert deactivated.status_code == 204
            assert client.get("/api/v1/farmers/me/listings", headers=auth_header(farmer)).json()[0]["availability_status"] == "UNAVAILABLE"
    finally:
        cleanup_users(farmer.id, other_farmer.id, consumer.id, crop_name=crop_name)
