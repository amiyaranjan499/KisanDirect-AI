import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import User, UserRole
from ml.price_prediction.inference import FairPriceInference

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_farmer_user() -> User:
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            user = User(
                email=f"fair-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
        await engine.dispose()
        return user

    return asyncio.run(create())


def cleanup_user(user: User):
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(User).where(User.id == user.id))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_fair_price_inference_potato():
    inference = FairPriceInference()
    res = inference.predict({
        "crop_name": "Potato",
        "quality_grade": "Grade A",
        "quantity": 100,
        "unit": "kg",
        "state": "Maharashtra",
        "district": "Pune",
        "market_price": 24.0,
    })
    assert res.prediction_status == "COMPLETED"
    assert res.predicted_price is not None and res.predicted_price > Decimal("0")
    assert res.currency == "INR"
    assert res.unit == "kg"
    assert res.confidence is not None and res.confidence >= 0.75
    assert res.model_name == "fair-price-random-forest"


def test_fair_price_inference_quality_premium():
    inference = FairPriceInference()
    # Grade A vs Grade C on same crop and base price
    res_a = inference.predict({
        "crop_name": "Tomato",
        "quality_grade": "Grade A",
        "quantity": 50,
        "market_price": 35.0,
    })
    res_c = inference.predict({
        "crop_name": "Tomato",
        "quality_grade": "Grade C",
        "quantity": 50,
        "market_price": 35.0,
    })
    assert res_a.predicted_price is not None and res_c.predicted_price is not None
    # Grade A produce should command a higher fair price than Grade C
    assert res_a.predicted_price > res_c.predicted_price


def test_fair_price_inference_unsupported():
    inference = FairPriceInference()
    res = inference.predict({"crop_name": "unknown_vegetable_xyz"})
    assert res.prediction_status == "MODEL_UNAVAILABLE"
    assert res.predicted_price is None


def test_fair_price_estimate_endpoint():
    app = create_app()
    client = TestClient(app)
    farmer_user = seed_farmer_user()

    try:
        payload = {
            "crop_name": "Potato",
            "quality_grade": "Grade A",
            "quantity": 150,
            "unit": "kg",
            "market_price": 24.0,
            "state": "Maharashtra",
            "district": "Pune",
        }

        # 1. Unauthenticated -> 401
        unauth = client.post("/api/v1/ai/price/estimate", json=payload)
        assert unauth.status_code == 401

        # 2. Authenticated farmer -> 200
        response = client.post(
            "/api/v1/ai/price/estimate",
            headers=auth_header(farmer_user),
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["prediction_status"] == "COMPLETED"
        assert data["crop_name"] == "Potato"
        assert float(data["predicted_price"]) > 0
        assert float(data["total_estimated_value"]) > 0
        assert float(data["total_estimated_value"]) == pytest.approx(
            float(data["predicted_price"]) * 150, rel=1e-2
        )
    finally:
        cleanup_user(farmer_user)

