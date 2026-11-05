import asyncio
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.auth_rate_limit import AuthRateLimiter
from backend.app.core.config import Settings
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


def test_public_registration_cannot_register_as_admin_or_hub_staff() -> None:
    with TestClient(create_app()) as client:
        # Schema layer rejects ADMIN role
        response_admin = client.post(
            "/api/v1/auth/register",
            json={"email": f"attacker-admin-{uuid4()}@example.com", "password": "Password123!", "role": "ADMIN"},
        )
        assert response_admin.status_code == 422, "Public registration must reject ADMIN role with 422"

        # Schema layer rejects HUB_STAFF role
        response_staff = client.post(
            "/api/v1/auth/register",
            json={"email": f"attacker-staff-{uuid4()}@example.com", "password": "Password123!", "role": "HUB_STAFF"},
        )
        assert response_staff.status_code == 422, "Public registration must reject HUB_STAFF role with 422"


def test_secure_admin_provisioning_and_login_flow() -> None:
    from backend.app.core.security import verify_password
    from backend.app.models import Admin, UserRole
    from scripts.create_admin import create_admin

    admin_email = f"test-provisioned-admin-{uuid4()}@kisandirect.ai"
    consumer_email = f"test-normal-consumer-{uuid4()}@kisandirect.ai"
    farmer_email = f"test-normal-farmer-{uuid4()}@kisandirect.ai"
    rider_email = f"test-normal-rider-{uuid4()}@kisandirect.ai"
    staff_email = f"test-hub-staff-{uuid4()}@kisandirect.ai"

    admin_password = "SecureAdminPass123!"
    user_password = "UserPassword123!"

    async def cleanup() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            admin_user = await session.scalar(select(User).where(User.email == admin_email.lower()))
            if admin_user is not None:
                await session.execute(delete(Admin).where(Admin.user_id == admin_user.id))
                await session.execute(delete(User).where(User.id == admin_user.id))
            all_emails = [consumer_email.lower(), farmer_email.lower(), rider_email.lower(), staff_email.lower()]
            await session.execute(delete(User).where(User.email.in_(all_emails)))
            await session.commit()
        await engine.dispose()

    try:
        # 1. Provision Admin securely via create_admin backend function
        admin_user = asyncio.run(create_admin(admin_email, admin_password, "Test Platform Admin", allow_additional=True))
        assert admin_user.role == UserRole.ADMIN

        # 2. Verify password is saved as a secure Argon2 hash, never plaintext
        assert admin_user.hashed_password != admin_password
        assert admin_user.hashed_password.startswith("$argon2")
        assert verify_password(admin_password, admin_user.hashed_password)

        # 3. Attempt duplicate initial admin creation without authorization should fail
        with pytest.raises(ValueError, match="already exists"):
            asyncio.run(create_admin(f"second-admin-{uuid4()}@kisandirect.ai", admin_password, allow_additional=False))

        # Attempt creation with duplicate email should fail even with allow_additional
        with pytest.raises(ValueError, match="already exists"):
            asyncio.run(create_admin(admin_email, admin_password, allow_additional=True))

        with TestClient(create_app()) as client:
            # Register Consumer, Farmer, Rider
            created_ids = {}
            for role, email in [
                ("CONSUMER", consumer_email),
                ("FARMER", farmer_email),
                ("RIDER", rider_email),
            ]:
                reg = client.post(
                    "/api/v1/auth/register",
                    json={"email": email, "password": user_password, "role": role},
                )
                assert reg.status_code == 201, f"Registration failed for {role}: {reg.text}"
                created_ids[role] = reg.json()["id"]

            # Manually insert HUB_STAFF user since public registration is blocked
            async def create_hub_staff() -> str:
                engine = build_engine(Settings())
                factory = async_sessionmaker(engine, expire_on_commit=False)
                from backend.app.core.security import hash_password
                async with factory() as session:
                    staff_user = User(
                        email=staff_email.lower(),
                        hashed_password=hash_password(user_password),
                        role=UserRole.HUB_STAFF,
                        is_active=True,
                    )
                    session.add(staff_user)
                    await session.commit()
                    staff_id = str(staff_user.id)
                await engine.dispose()
                return staff_id

            staff_user_id = asyncio.run(create_hub_staff())

            # 4. Test Invalid Admin Login (Wrong Password) -> 401
            bad_login = client.post(
                "/api/v1/auth/login",
                json={"email": admin_email, "password": "WrongPassword123!"},
            )
            assert bad_login.status_code == 401

            # 5. Test Successful Admin Login -> 200 + access_token
            good_login = client.post(
                "/api/v1/auth/login",
                json={"email": admin_email, "password": admin_password},
            )
            assert good_login.status_code == 200
            token_data = good_login.json()
            assert "access_token" in token_data
            admin_token = token_data["access_token"]

            # 6. Verify Identity and Role on /auth/me
            me_resp = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert me_resp.status_code == 200
            assert me_resp.json()["email"] == admin_email
            assert me_resp.json()["role"] == "ADMIN"

            # 7. Access Admin API with Admin Token -> OK (200)
            admin_api_ok = client.get(
                "/api/v1/admins/dashboard/summary",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert admin_api_ok.status_code == 200
            assert "total_users" in admin_api_ok.json()

            # 8. Access Admin API without token -> 401 Unauthorized
            admin_api_unauth = client.get("/api/v1/admins/dashboard/summary")
            assert admin_api_unauth.status_code == 401

            # 9. Verify Customer, Farmer, Rider, and Hub Staff accounts CANNOT access Admin APIs -> 403 Forbidden
            from backend.app.core.security import create_access_token
            settings = Settings()
            role_tokens = [
                ("CONSUMER", create_access_token(str(created_ids["CONSUMER"]), UserRole.CONSUMER, settings)),
                ("FARMER", create_access_token(str(created_ids["FARMER"]), UserRole.FARMER, settings)),
                ("RIDER", create_access_token(str(created_ids["RIDER"]), UserRole.RIDER, settings)),
                ("HUB_STAFF", create_access_token(str(staff_user_id), UserRole.HUB_STAFF, settings)),
            ]
            for role_name, token in role_tokens:
                forbidden_resp = client.get(
                    "/api/v1/admins/dashboard/summary",
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert forbidden_resp.status_code == 403, f"{role_name} should receive 403 Forbidden"
                assert forbidden_resp.json()["detail"] == "Admin role required"
    finally:
        asyncio.run(cleanup())


def test_admin_provisioning_error_rolls_back_cleanly() -> None:
    from scripts.create_admin import create_admin

    bad_email = f"fail-admin-{uuid4()}@kisandirect.ai"
    oversized_name = "X" * 200  # Exceeds max 160 characters

    async def verify_no_orphan_user() -> bool:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            user = await session.scalar(select(User).where(User.email == bad_email.lower()))
        await engine.dispose()
        return user is None

    # create_admin should raise ValueError and leave NO User row
    with pytest.raises(ValueError, match="Admin name cannot exceed 160 characters"):
        asyncio.run(create_admin(bad_email, "ValidPassword123!", name=oversized_name, allow_additional=True))

    assert asyncio.run(verify_no_orphan_user()), "Orphan User row should not exist after rollback"

