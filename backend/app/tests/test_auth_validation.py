import asyncio
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.auth_rate_limit import AuthRateLimiter
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import User
from backend.app.repositories.user_repository import (
    DatabaseNotConfiguredError,
    UnconfiguredUserRepository,
)
from backend.app.schemas.auth import LoginRequest, RegistrationRequest


def test_registration_requires_a_strong_enough_password() -> None:
    with pytest.raises(ValidationError):
        RegistrationRequest(email="farmer@example.com", password="short")


def test_login_requires_an_email_address() -> None:
    with pytest.raises(ValidationError):
        LoginRequest(email="not-an-email", password="password")


def test_json_and_oauth2_login_return_a_token_and_protected_endpoint_accepts_it() -> None:
    email = f"login-regression-{uuid4()}@example.com"

    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async with factory() as session:
            await session.execute(delete(User).where(User.email == email.lower()))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            registration = client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": "Password123!", "role": "CONSUMER"},
            )
            assert registration.status_code == 201, registration.text

            json_login = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "Password123!"},
            )
            assert json_login.status_code == 200, json_login.text
            assert json_login.json()["access_token"]

            form_login = client.post(
                "/api/v1/auth/login",
                data={"username": email, "password": "Password123!", "grant_type": "password"},
            )
            assert form_login.status_code == 200, form_login.text
            token = form_login.json()["access_token"]

            protected = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert protected.status_code == 200, protected.text
            assert protected.json()["email"] == email
    finally:
        asyncio.run(cleanup())


def test_openapi_documents_json_and_oauth2_login_bodies() -> None:
    with TestClient(create_app()) as client:
        operation = client.get("/openapi.json").json()["paths"]["/api/v1/auth/login"]["post"]
        content = operation["requestBody"]["content"]

    assert "application/json" in content
    assert "application/x-www-form-urlencoded" in content
    assert content["application/x-www-form-urlencoded"]["schema"]["required"] == ["username", "password"]


@pytest.mark.parametrize(
    ("role", "email_prefix"),
    [("FARMER", "farmer-registration"), ("CONSUMER", "consumer-registration")],
)
def test_registration_persists_a_new_user(role: str, email_prefix: str) -> None:
    email = f"{email_prefix}-{uuid4()}@example.com"

    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async with factory() as session:
            await session.execute(delete(User).where(User.email == email.lower()))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": "Password123!", "role": role},
            )

        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["email"] == email.lower()
        assert payload["role"] == role
        assert payload["is_active"] is True
    finally:
        asyncio.run(cleanup())


def test_new_farmer_registration_initializes_profile_and_supports_profile_api() -> None:
    email = f"farmer-profile-registration-{uuid4()}@example.com"

    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(User).where(User.email == email.lower()))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            registration = client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": "Password123!", "role": "FARMER"},
            )
            assert registration.status_code == 201, registration.text

            login = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "Password123!"},
            )
            assert login.status_code == 200, login.text
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            profile = client.get("/api/v1/farmers/me", headers=headers)
            assert profile.status_code == 200, profile.text
            assert profile.json()["user_id"] == registration.json()["id"]

            updated = client.put(
                "/api/v1/farmers/me",
                headers=headers,
                json={"name": "Registered Farmer", "state": "Odisha"},
            )
            assert updated.status_code == 200, updated.text
            assert updated.json()["state"] == "Odisha"
    finally:
        asyncio.run(cleanup())


def test_unconfigured_repository_never_fakes_persistence() -> None:
    repository = UnconfiguredUserRepository()

    async def check_repository() -> None:
        with pytest.raises(DatabaseNotConfiguredError):
            await repository.get_by_email("user@example.com")

    asyncio.run(check_repository())


def test_failed_login_does_not_create_numeric_kisan_account() -> None:
    email = f"{uuid4().int}@kisan.direct"

    async def find_user() -> User | None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
        await engine.dispose()
        return user

    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(User).where(User.email == email))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "WrongPassword123!"},
            )

        assert response.status_code == 401
        assert asyncio.run(find_user()) is None
    finally:
        asyncio.run(cleanup())


def test_registration_requires_password_and_rejects_duplicate_email() -> None:
    email = f"duplicate-registration-{uuid4()}@example.com"

    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(User).where(User.email == email.lower()))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            missing_password = client.post(
                "/api/v1/auth/register", json={"email": email, "role": "CONSUMER"}
            )
            created = client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": "Password123!", "role": "CONSUMER"},
            )
            duplicate = client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": "Password123!", "role": "CONSUMER"},
            )

        assert missing_password.status_code == 422
        assert created.status_code == 201, created.text
        assert duplicate.status_code == 409
    finally:
        asyncio.run(cleanup())


def test_auth_rate_limit_returns_429_with_retry_after() -> None:
    app = create_app()
    app.state.auth_rate_limiter = AuthRateLimiter(max_requests=1, window_seconds=60)

    with TestClient(app) as client:
        first = client.post(
            "/api/v1/auth/login",
            json={"email": f"throttle-{uuid4()}@example.com", "password": "WrongPassword123!"},
        )
        second = client.post(
            "/api/v1/auth/login",
            json={"email": f"throttle-{uuid4()}@example.com", "password": "WrongPassword123!"},
        )

    assert first.status_code == 401
    assert second.status_code == 429
    assert int(second.headers["retry-after"]) > 0
