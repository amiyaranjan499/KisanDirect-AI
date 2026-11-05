import asyncio
from pathlib import Path
import sys
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
from backend.app.services.market_price_service import MarketPriceService

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_user() -> User:
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            user = User(
                email=f"market-user-{uuid4()}@example.com",
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


def test_market_price_service_potato():
    service = MarketPriceService()
    res = service.get_market_price("potato", state="Maharashtra", district="Pune")
    assert res.status == "COMPLETED"
    assert res.commodity == "potato"
    assert res.commodity_display == "Potato"
    assert res.market_price is not None and res.market_price > 0
    assert "Pune APMC" in res.market_source
    assert res.currency == "INR"
    assert res.unit == "kg"


def test_market_price_service_tomato():
    service = MarketPriceService()
    res = service.get_market_price("tomato", state="Karnataka", district="Kolar")
    assert res.status == "COMPLETED"
    assert res.commodity == "tomato"
    assert res.market_price is not None and res.market_price > 0
    assert res.min_price is not None and res.max_price is not None
    assert res.min_price <= res.market_price <= res.max_price


def test_market_price_service_unsupported():
    service = MarketPriceService()
    res = service.get_market_price("exotic_dragon_fruit_xyz")
    assert res.status == "UNSUPPORTED_CROP"
    assert res.market_price is None


def test_market_price_api_endpoint():
    app = create_app()
    client = TestClient(app)
    user = seed_user()

    try:
        # 1. Without auth -> 401
        no_auth = client.get("/api/v1/market-prices/latest?crop=potato")
        assert no_auth.status_code == 401

        # 2. With auth -> 200
        res = client.get(
            "/api/v1/market-prices/latest?crop=potato&state=Maharashtra&district=Pune",
            headers=auth_header(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "COMPLETED"
        assert data["commodity"] == "potato"
        assert float(data["market_price"]) > 0
        assert "Agmarknet APMC" in data["market_source"]
    finally:
        cleanup_user(user)

