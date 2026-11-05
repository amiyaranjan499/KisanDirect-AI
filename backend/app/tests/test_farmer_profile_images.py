import asyncio
import io
import shutil
import sys
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import Farmer, User, UserRole
from backend.app.models.base import Base

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


async def seed_farmer_profile_test_data():
    engine = build_engine(Settings())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        user = User(
            email=f"profile-img-farmer-{uuid4()}@example.com",
            hashed_password=hash_password("Password123!"),
            role=UserRole.FARMER,
        )
        session.add(user)
        await session.flush()

        farmer = Farmer(
            user_id=user.id,
            name="Profile Image Farmer",
            phone="+919876543210",
            village="Sundarpur",
            district="Khurda",
            state="Odisha",
        )
        session.add(farmer)
        await session.commit()
        await session.refresh(user)
        await session.refresh(farmer)

        return {
            "engine": engine,
            "user": user,
            "farmer": farmer,
        }


async def cleanup_farmer_profile_test_data(data: dict):
    engine = data["engine"]
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await session.execute(delete(Farmer).where(Farmer.id == data["farmer"].id))
        await session.execute(delete(User).where(User.id == data["user"].id))
        await session.commit()
    await engine.dispose()

    # Clean up uploaded files directory
    upload_dir = Path("storage") / "uploads" / "farmers" / str(data["farmer"].id)
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)


def test_farmer_profile_and_cover_image_workflows():
    data = asyncio.run(seed_farmer_profile_test_data())
    app = create_app()
    client = TestClient(app)
    headers = auth_header(data["user"])

    try:
        # 1. Valid JPEG profile image upload
        # Standard minimal JPEG header
        fake_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00" + b"\x00" * 100 + b"\xff\xd9"
        res_profile = client.post(
            "/api/v1/farmers/me/profile-image",
            headers=headers,
            files={"image": ("profile.jpg", io.BytesIO(fake_jpeg), "image/jpeg")},
        )
        assert res_profile.status_code == 200, res_profile.text
        res_profile_data = res_profile.json()
        assert res_profile_data["profile_image"] is not None
        assert "uploads/farmers" in res_profile_data["profile_image"]
        assert res_profile_data["profile_image"].endswith(".jpg")

        # 2. Valid PNG cover image upload
        fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4" + b"\x00" * 50
        res_cover = client.post(
            "/api/v1/farmers/me/cover-image",
            headers=headers,
            files={"image": ("cover.png", io.BytesIO(fake_png), "image/png")},
        )
        assert res_cover.status_code == 200, res_cover.text
        res_cover_data = res_cover.json()
        assert res_cover_data["cover_image"] is not None
        assert "uploads/farmers" in res_cover_data["cover_image"]
        assert res_cover_data["cover_image"].endswith(".png")

        # 3. Verify GET /api/v1/farmers/me returns both images
        get_res = client.get("/api/v1/farmers/me", headers=headers)
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["profile_image"] == res_profile_data["profile_image"]
        assert get_data["cover_image"] == res_cover_data["cover_image"]

        # 4. Reject unsupported MIME type or spoofed file
        fake_text = b"This is plain text and not an image file at all."
        res_bad_mime = client.post(
            "/api/v1/farmers/me/profile-image",
            headers=headers,
            files={"image": ("script.txt", io.BytesIO(fake_text), "text/plain")},
        )
        assert res_bad_mime.status_code == 422

        # Reject spoofed extension with invalid magic signature
        res_spoofed = client.post(
            "/api/v1/farmers/me/profile-image",
            headers=headers,
            files={"image": ("fake.jpg", io.BytesIO(fake_text), "image/jpeg")},
        )
        assert res_spoofed.status_code == 422

        # 5. Reject file exceeding 5MB
        oversized = b"\xff\xd8\xff\xe0" + (b"0" * (5 * 1024 * 1024 + 1024))
        res_oversized = client.post(
            "/api/v1/farmers/me/cover-image",
            headers=headers,
            files={"image": ("large.jpg", io.BytesIO(oversized), "image/jpeg")},
        )
        assert res_oversized.status_code == 422

        # 6. Apply preset cover theme via PUT /api/v1/farmers/me
        preset_url = "/assets/covers/organic-fields.jpg"
        put_res = client.put(
            "/api/v1/farmers/me",
            headers=headers,
            json={"cover_image": preset_url},
        )
        assert put_res.status_code == 200
        assert put_res.json()["cover_image"] == preset_url

        # 7. Remove profile image via PUT /api/v1/farmers/me
        clear_res = client.put(
            "/api/v1/farmers/me",
            headers=headers,
            json={"profile_image": ""},
        )
        assert clear_res.status_code == 200
        assert clear_res.json()["profile_image"] is None
    finally:
        asyncio.run(cleanup_farmer_profile_test_data(data))
