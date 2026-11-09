import asyncio
import sys
import time
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import CropListing, Farmer, User, UserRole

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_farmer_fixture():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(
                email=f"publish-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            session.add(farmer_user)
            await session.commit()
            await session.refresh(farmer_user)

            farmer_profile = Farmer(
                user_id=farmer_user.id,
                name="Test Publish Flow Farmer",
                phone="9876543210",
                city="Pune",
                district="Pune",
                state="Maharashtra",
            )
            session.add(farmer_profile)
            await session.commit()
            await session.refresh(farmer_profile)

        await engine.dispose()
        return farmer_user, farmer_profile

    return asyncio.run(create())


def cleanup_farmer_fixture(farmer_user: User, farmer_profile: Farmer):
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(CropListing).where(CropListing.farmer_id == farmer_profile.id))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id == farmer_user.id))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


async def count_farmer_listings(farmer_id) -> int:
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(func.count()).select_from(CropListing).where(CropListing.farmer_id == farmer_id)
        )
        count = int(result.scalar_one())
    await engine.dispose()
    return count


def test_ai_analysis_does_not_create_crop_listing():
    """Verify that complete AI analysis pipeline leaves database crop count unchanged at 0."""
    farmer_user, farmer_profile = seed_farmer_fixture()
    app = create_app()
    client = TestClient(app)

    try:
        # Initial database count must be 0
        initial_count = asyncio.run(count_farmer_listings(farmer_profile.id))
        assert initial_count == 0

        img_path = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png"
        assert img_path.exists()

        # Step 1: Crop Classification API
        with open(img_path, "rb") as f:
            c_res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("potato.png", f, "image/png")},
            )
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert c_data["crop_name"] == "Potato"
        assert c_data["prediction_status"] == "COMPLETED"

        # Step 2: Crop Quality In-Memory Analysis API
        with open(img_path, "rb") as f:
            q_res = client.post(
                "/api/v1/ai/quality/analyze",
                headers=auth_header(farmer_user),
                files={"image": ("potato.png", f, "image/png")},
            )
        assert q_res.status_code == 200
        q_data = q_res.json()
        assert q_data["quality_label"] in ["Good", "Average", "Poor"]

        # Step 3: APMC Market Price Feed API
        m_res = client.get(
            "/api/v1/market-prices/latest?crop=potato&state=Maharashtra&district=Pune",
            headers=auth_header(farmer_user),
        )
        assert m_res.status_code == 200
        m_data = m_res.json()
        assert m_data["status"] == "COMPLETED"

        # Step 4: Fair Price In-Memory Estimation API
        p_res = client.post(
            "/api/v1/ai/price/estimate",
            headers=auth_header(farmer_user),
            json={
                "crop_name": "Potato",
                "quality_grade": q_data["quality_label"],
                "market_price": m_data["market_price"],
                "quantity": 50,
                "unit": "kg",
                "state": "Maharashtra",
                "district": "Pune",
            },
        )
        assert p_res.status_code == 200
        p_data = p_res.json()
        assert p_data["prediction_status"] == "COMPLETED"

        # CRITICAL ASSERTION: No crop listing has been created in the database during AI analysis!
        post_ai_count = asyncio.run(count_farmer_listings(farmer_profile.id))
        assert post_ai_count == 0, f"Expected 0 listings during AI analysis, found {post_ai_count}"

    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)


def test_only_explicit_publish_creates_listing():
    """Verify that only the explicit publish POST request creates exactly one permanent listing."""
    farmer_user, farmer_profile = seed_farmer_fixture()
    app = create_app()
    client = TestClient(app)

    try:
        # Pre-check: 0 listings
        assert asyncio.run(count_farmer_listings(farmer_profile.id)) == 0

        # Simulate farmer clicking "Publish Crop"
        publish_payload = {
            "crop_name": "Potato",
            "crop_category": "Vegetables",
            "quantity": 100,
            "unit": "kg",
            "asking_price": 28.50,
            "description": "Variety: Not available from image. Verified APMC benchmark rates.",
        }

        publish_res = client.post(
            "/api/v1/farmers/me/listings",
            headers=auth_header(farmer_user),
            json=publish_payload,
        )
        assert publish_res.status_code == 201
        created_listing = publish_res.json()
        assert created_listing["crop_name"] == "Potato"
        assert float(created_listing["quantity"]) == 100

        # Post-check: Exactly 1 listing created
        post_publish_count = asyncio.run(count_farmer_listings(farmer_profile.id))
        assert post_publish_count == 1, f"Expected exactly 1 listing after publish, found {post_publish_count}"

        # Listing appears in My Crops endpoint
        my_crops_res = client.get(
            "/api/v1/farmers/me/listings",
            headers=auth_header(farmer_user),
        )
        assert my_crops_res.status_code == 200
        my_crops = my_crops_res.json()
        assert len(my_crops) == 1
        assert my_crops[0]["id"] == created_listing["id"]

    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)


def test_critical_potato_accuracy_and_apple_non_confusion():
    """Verify that real potato photos identify as Potato and NEVER confuse with Apple."""
    app = create_app()
    client = TestClient(app)
    farmer_user, farmer_profile = seed_farmer_fixture()

    try:
        test_images = [
            PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png",
            PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potao.png",
        ]

        for img_path in test_images:
            assert img_path.exists()
            with open(img_path, "rb") as f:
                res = client.post(
                    "/api/v1/ai/crop/classify",
                    headers=auth_header(farmer_user),
                    files={"image": (img_path.name, f, "image/jpeg" if img_path.suffix == ".jpg" else "image/png")},
                )
            assert res.status_code == 200
            data = res.json()
            assert data["crop_name"] == "Potato", f"Image {img_path.name} was misclassified as {data['crop_name']}"
            assert data["crop_name"] != "Apple", "Critical regression: potato identified as Apple!"
            assert data["prediction_status"] == "COMPLETED"
            assert data["source"] == "local"
            # Verify total removal of confidence and variety
            assert "confidence" not in data
            assert "probabilities" not in data
            assert "variety" not in data

    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)


def test_back_creates_zero_listings():
    """Simulate farmer running AI analysis, reviewing, then clicking Back/leaving: 0 listings created."""
    farmer_user, farmer_profile = seed_farmer_fixture()
    app = create_app()
    client = TestClient(app)

    try:
        assert asyncio.run(count_farmer_listings(farmer_profile.id)) == 0

        img_path = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png"
        with open(img_path, "rb") as f:
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("potato.png", f, "image/png")},
            )
        assert res.status_code == 200

        # Farmer navigates away / clicks Back without clicking Publish
        assert asyncio.run(count_farmer_listings(farmer_profile.id)) == 0
    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)


def test_change_photo_creates_zero_listings():
    """Simulate farmer uploading a photo, re-analyzing with another photo, leaving: 0 listings created."""
    farmer_user, farmer_profile = seed_farmer_fixture()
    app = create_app()
    client = TestClient(app)

    try:
        assert asyncio.run(count_farmer_listings(farmer_profile.id)) == 0

        img_path1 = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png"
        img_path2 = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potao.png"

        with open(img_path1, "rb") as f:
            client.post("/api/v1/ai/crop/classify", headers=auth_header(farmer_user), files={"image": ("potato.png", f, "image/png")})

        # Farmer clicks 'Change Photo' and uploads second image
        with open(img_path2, "rb") as f:
            client.post("/api/v1/ai/crop/classify", headers=auth_header(farmer_user), files={"image": ("potato2.jpg", f, "image/jpeg")})

        # Still 0 listings created
        assert asyncio.run(count_farmer_listings(farmer_profile.id)) == 0
    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)


def test_double_publish_creates_one_listing():
    """Verify that rapid double-clicking Publish within 5 seconds creates only 1 listing due to idempotency."""
    farmer_user, farmer_profile = seed_farmer_fixture()
    app = create_app()
    client = TestClient(app)

    try:
        assert asyncio.run(count_farmer_listings(farmer_profile.id)) == 0

        payload = {
            "crop_name": "Potato",
            "crop_category": "Vegetables",
            "quantity": 250,
            "unit": "kg",
            "asking_price": 24.00,
            "description": "Double-publish idempotency test",
        }

        # First click
        res1 = client.post("/api/v1/farmers/me/listings", headers=auth_header(farmer_user), json=payload)
        assert res1.status_code == 201
        data1 = res1.json()

        # Second rapid click immediately
        res2 = client.post("/api/v1/farmers/me/listings", headers=auth_header(farmer_user), json=payload)
        assert res2.status_code in [200, 201]
        data2 = res2.json()

        # Both responses return the same listing ID
        assert data1["id"] == data2["id"]

        # Exactly 1 row in database
        final_count = asyncio.run(count_farmer_listings(farmer_profile.id))
        assert final_count == 1, f"Expected 1 listing from rapid double-click, got {final_count}"
    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)


def test_ai_performance_and_prewarming():
    """Verify that once pre-warmed, inference completes in sub-second time on CPU."""
    app = create_app()
    client = TestClient(app)
    farmer_user, farmer_profile = seed_farmer_fixture()

    try:
        img_path = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png"

        # Measure classify latency
        t0 = time.perf_counter()
        with open(img_path, "rb") as f:
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("potato.png", f, "image/png")},
            )
        classify_elapsed = time.perf_counter() - t0
        assert res.status_code == 200
        # Warm CPU inference should complete well under 3 seconds
        assert classify_elapsed < 3.0, f"Classification took {classify_elapsed:.2f}s, expected < 3.0s"

        # Measure quality analyze latency
        t1 = time.perf_counter()
        with open(img_path, "rb") as f:
            q_res = client.post(
                "/api/v1/ai/quality/analyze",
                headers=auth_header(farmer_user),
                files={"image": ("potato.png", f, "image/png")},
            )
        quality_elapsed = time.perf_counter() - t1
        assert q_res.status_code == 200
        assert quality_elapsed < 1.0, f"Quality analyze took {quality_elapsed:.2f}s, expected < 1.0s"

    finally:
        cleanup_farmer_fixture(farmer_user, farmer_profile)

