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
from backend.app.models import Consumer, Order, OrderStatus, Payment, User, UserRole

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def header(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            users = [User(email=f"payment-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER) for _ in range(2)]
            session.add_all(users)
            await session.flush()
            profiles = [Consumer(user_id=user.id, name=f"Payment Consumer {index}") for index, user in enumerate(users)]
            session.add_all(profiles)
            await session.flush()
            orders = [Order(consumer_id=profiles[0].id, status=OrderStatus.PENDING, total_amount=Decimal("42.50")), Order(consumer_id=profiles[0].id, status=OrderStatus.PENDING, total_amount=Decimal("12.00"))]
            session.add_all(orders)
            await session.commit()
            for entity in [*users, *profiles, *orders]:
                await session.refresh(entity)
        await engine.dispose()
        return users, profiles, orders
    return asyncio.run(create())


def cleanup(data):
    users, profiles, orders = data
    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(Payment).where(Payment.order_id.in_([order.id for order in orders])))
            await session.execute(delete(Order).where(Order.id.in_([order.id for order in orders])))
            await session.execute(delete(Consumer).where(Consumer.id.in_([profile.id for profile in profiles])))
            await session.execute(delete(User).where(User.id.in_([user.id for user in users])))
            await session.commit()
        await engine.dispose()
    asyncio.run(remove())


def test_sandbox_payment_outcomes_ownership_amount_and_duplicate_protection():
    data = seed()
    users, profiles, orders = data
    consumer, other = users
    try:
        with TestClient(create_app()) as client:
            success = client.post(f"/api/v1/payments/test/{orders[0].id}", headers=header(consumer), json={"outcome": "success", "amount": "0.01"})
            assert success.status_code == 201
            body = success.json()
            assert body["status"] == "successful"
            assert body["amount"] == "42.50"
            assert body["payment_method"] == "TEST_SANDBOX"
            assert body["is_test"] is True

            duplicate = client.post(f"/api/v1/payments/test/{orders[0].id}", headers=header(consumer), json={"outcome": "success"})
            assert duplicate.status_code == 409

            retrieved = client.get(f"/api/v1/payments/test/{body['id']}", headers=header(consumer))
            assert retrieved.status_code == 200
            assert retrieved.json()["amount"] == "42.50"

            unauthorized = client.post(f"/api/v1/payments/test/{orders[0].id}", headers=header(other), json={"outcome": "success"})
            assert unauthorized.status_code == 404
            forbidden_read = client.get(f"/api/v1/payments/test/{body['id']}", headers=header(other))
            assert forbidden_read.status_code == 404

            failed = client.post(f"/api/v1/payments/test/{orders[1].id}", headers=header(consumer), json={"outcome": "failed"})
            assert failed.status_code == 201
            assert failed.json()["status"] == "failed"
    finally:
        cleanup(data)


def test_cancelled_and_invalid_payment_requests():
    data = seed()
    users, profiles, orders = data
    consumer = users[0]
    try:
        with TestClient(create_app()) as client:
            cancelled = client.post(f"/api/v1/payments/test/{orders[0].id}", headers=header(consumer), json={"outcome": "cancelled"})
            assert cancelled.status_code == 201
            assert cancelled.json()["status"] == "cancelled"
            invalid = client.post(f"/api/v1/payments/test/{orders[1].id}", headers=header(consumer), json={"outcome": "unknown"})
            assert invalid.status_code == 422
            missing = client.post(f"/api/v1/payments/test/{uuid4()}", headers=header(consumer), json={"outcome": "success"})
            assert missing.status_code == 404
    finally:
        cleanup(data)
