import asyncio
import io
from pathlib import Path
import sys
from uuid import uuid4
from PIL import Image

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import User, UserRole
from backend.app.services.gemini_service import GeminiVisionService
from backend.app.services.market_price_service import MarketPriceService
from ml.crop_classification.inference import CropClassifierInference
from ml.price_prediction.inference import FairPriceInference

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = PROJECT_ROOT / "ml" / "datasets" / "ten_crops" / "demo_test_images"


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_users() -> tuple[User, User]:
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(
                email=f"crop-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            consumer_user = User(
                email=f"crop-consumer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.CONSUMER,
            )
            session.add_all([farmer_user, consumer_user])
            await session.commit()
            await session.refresh(farmer_user)
            await session.refresh(consumer_user)
        await engine.dispose()
        return farmer_user, consumer_user

    return asyncio.run(create())


def cleanup_users(farmer_user: User, consumer_user: User):
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(
                delete(User).where(User.id.in_([farmer_user.id, consumer_user.id]))
            )
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


# 1. Tests for all 10 trained crops
def test_potato_prediction():
    img_path = DEMO_DIR / "potato.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Potato"
    assert res.category == "Vegetables"
    assert res.prediction_status == "COMPLETED"


def test_tomato_prediction():
    img_path = DEMO_DIR / "tomato.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Tomato"
    assert res.category == "Vegetables"


def test_onion_prediction():
    img_path = DEMO_DIR / "onion.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Onion"
    assert res.category == "Vegetables"


def test_apple_prediction():
    img_path = DEMO_DIR / "apple.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Apple"
    assert res.category == "Fruits"


def test_mango_prediction():
    img_path = DEMO_DIR / "mango.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Mango"
    assert res.category == "Fruits"


def test_banana_prediction():
    img_path = DEMO_DIR / "banana.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Banana"
    assert res.category == "Fruits"


def test_orange_prediction():
    img_path = DEMO_DIR / "orange.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Orange"
    assert res.category == "Fruits"


def test_carrot_prediction():
    img_path = DEMO_DIR / "carrot.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Carrot"
    assert res.category == "Vegetables"


def test_brinjal_prediction():
    img_path = DEMO_DIR / "brinjal.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Brinjal"
    assert res.category == "Vegetables"


def test_cabbage_prediction():
    img_path = DEMO_DIR / "cabbage.jpg"
    assert img_path.exists()
    inf = CropClassifierInference()
    with Image.open(img_path) as img:
        res = inf.predict(img)
    assert res.crop_name == "Cabbage"
    assert res.category == "Vegetables"


# 2. Complete 10/10 demonstration test
def test_all_10_crop_predictions():
    crops = [
        ("potato.jpg", "Potato"),
        ("tomato.jpg", "Tomato"),
        ("onion.jpg", "Onion"),
        ("apple.jpg", "Apple"),
        ("mango.jpg", "Mango"),
        ("banana.jpg", "Banana"),
        ("orange.jpg", "Orange"),
        ("carrot.jpg", "Carrot"),
        ("brinjal.jpg", "Brinjal"),
        ("cabbage.jpg", "Cabbage"),
    ]
    inf = CropClassifierInference()
    correct = 0
    for filename, expected in crops:
        img_path = DEMO_DIR / filename
        assert img_path.exists()
        with Image.open(img_path) as img:
            res = inf.predict(img)
        if res.crop_name == expected:
            correct += 1
    assert correct == 10, f"Expected 10/10 correct demo images, got {correct}/10"


# 3. Test Supported Crop Uses Local Model
def test_supported_crop_uses_local_model():
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()
    try:
        img_path = DEMO_DIR / "potato.jpg"
        with open(img_path, "rb") as f:
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("potato.jpg", f, "image/jpeg")},
            )
        assert res.status_code == 200
        data = res.json()
        assert data["crop_name"] == "Potato"
        assert data["category"] == "Vegetables"
        assert data["source"] == "local"
        assert data["prediction_status"] == "COMPLETED"
    finally:
        cleanup_users(farmer_user, consumer_user)


# 4. Test Unknown Crop Uses Gemini Automatically
def test_unknown_crop_uses_gemini_automatically():
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()

    # Set mock override for Gemini Vision fallback
    GeminiVisionService.set_test_override(lambda _b: {"crop_name": "Dragon Fruit", "category": "Fruits"})

    try:
        img_path = DEMO_DIR / "dragon_fruit.jpg"
        assert img_path.exists()
        with open(img_path, "rb") as f:
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("dragon_fruit.jpg", f, "image/jpeg")},
            )
        assert res.status_code == 200
        data = res.json()
        assert data["crop_name"] == "Dragon Fruit"
        assert data["category"] == "Fruits"
        assert data["source"] == "gemini"
        assert data["prediction_status"] == "COMPLETED"
    finally:
        GeminiVisionService.set_test_override(None)
        cleanup_users(farmer_user, consumer_user)


# 5. Test No Manual Gemini Selection & Same Response Schema
def test_no_manual_gemini_selection():
    """Verify that client sends only the image with no manual model/source parameters."""
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()
    try:
        img_path = DEMO_DIR / "onion.jpg"
        with open(img_path, "rb") as f:
            # Client posts ONLY the image
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("onion.jpg", f, "image/jpeg")},
            )
        assert res.status_code == 200
        data = res.json()
        assert "source" in data
        assert data["source"] == "local"
    finally:
        cleanup_users(farmer_user, consumer_user)


def test_local_and_gemini_same_response_schema():
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()

    GeminiVisionService.set_test_override(lambda _b: {"crop_name": "Dragon Fruit", "category": "Fruits"})
    try:
        # Local
        with open(DEMO_DIR / "tomato.jpg", "rb") as f:
            res_local = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("tomato.jpg", f, "image/jpeg")},
            ).json()

        # Gemini
        with open(DEMO_DIR / "dragon_fruit.jpg", "rb") as f:
            res_gemini = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("dragon_fruit.jpg", f, "image/jpeg")},
            ).json()

        assert set(res_local.keys()) == set(res_gemini.keys())
        expected_keys = {"crop_name", "category", "source", "prediction_status", "metadata"}
        assert expected_keys.issubset(set(res_local.keys()))
    finally:
        GeminiVisionService.set_test_override(None)
        cleanup_users(farmer_user, consumer_user)


# 6. Test No Confidence and No Variety
def test_no_confidence():
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()
    try:
        with open(DEMO_DIR / "potato.jpg", "rb") as f:
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("potato.jpg", f, "image/jpeg")},
            ).json()
        assert "confidence" not in res
        assert "prediction_confidence" not in res
        assert "gemini_confidence" not in res
    finally:
        cleanup_users(farmer_user, consumer_user)


def test_no_variety():
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()
    try:
        with open(DEMO_DIR / "potato.jpg", "rb") as f:
            res = client.post(
                "/api/v1/ai/crop/classify",
                headers=auth_header(farmer_user),
                files={"image": ("potato.jpg", f, "image/jpeg")},
            ).json()
        assert "variety" not in res
        assert "variety_confidence" not in res
    finally:
        cleanup_users(farmer_user, consumer_user)


# 7. Test Category, Quality, Market Price, Fair Price, Price Trend
def test_category():
    inf = CropClassifierInference()
    with Image.open(DEMO_DIR / "apple.jpg") as img:
        assert inf.predict(img).category == "Fruits"
    with Image.open(DEMO_DIR / "potato.jpg") as img:
        assert inf.predict(img).category == "Vegetables"


def test_quality():
    app = create_app()
    client = TestClient(app)
    farmer_user, consumer_user = seed_users()
    try:
        with open(DEMO_DIR / "potato.jpg", "rb") as f:
            res = client.post(
                "/api/v1/ai/quality/analyze",
                headers=auth_header(farmer_user),
                files={"image": ("potato.jpg", f, "image/jpeg")},
            )
        assert res.status_code == 200
        data = res.json()
        assert data["quality_label"] in ["Good", "Average", "Poor"]
        assert data["prediction_status"] == "COMPLETED"
    finally:
        cleanup_users(farmer_user, consumer_user)


def test_market_price():
    svc = MarketPriceService()
    res = svc.get_market_price("potato", state="Maharashtra", district="Pune")
    assert res.status_code if hasattr(res, "status_code") else res.status == "COMPLETED"
    assert res.market_price is not None and float(res.market_price) > 0


def test_fair_price():
    inf = FairPriceInference()
    pred = inf.predict({
        "crop_name": "Potato",
        "quality_grade": "Grade A",
        "market_price": 24.0,
        "quantity": 100,
        "state": "Maharashtra",
        "district": "Pune",
    })
    assert pred.prediction_status == "COMPLETED"
    assert pred.predicted_price is not None and float(pred.predicted_price) > 0


def test_price_trend():
    svc = MarketPriceService()
    # Orange has rising trend in mandi rates
    res_orange = svc.get_market_price("orange", state="Maharashtra", district="Nagpur")
    assert res_orange.price_trend in ["Rising", "Stable", "Falling"]
    # Cabbage has falling trend
    res_cabbage = svc.get_market_price("cabbage", state="Maharashtra", district="Pune")
    assert res_cabbage.price_trend in ["Rising", "Stable", "Falling"]
