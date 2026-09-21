from datetime import timedelta

import pytest

from backend.app.core.config import Settings, get_settings
from backend.app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from backend.app.models.user import UserRole


@pytest.fixture
def settings() -> Settings:
    return Settings(
        jwt_secret_key="test-only-secret-key-with-at-least-32-characters",
        access_token_expire_minutes=30,
    )


def test_password_is_hashed_and_verifies() -> None:
    password = "test-password-123"
    hashed_password = hash_password(password)

    assert hashed_password != password
    assert verify_password(password, hashed_password)
    assert not verify_password("wrong-password", hashed_password)


def test_jwt_round_trip(settings: Settings) -> None:
    token = create_access_token(
        "user-id",
        UserRole.CONSUMER,
        settings,
        expires_delta=timedelta(minutes=5),
    )

    token_data = decode_access_token(token, settings)

    assert token_data.subject == "user-id"
    assert token_data.role is UserRole.CONSUMER


def test_jwt_rejects_invalid_token(settings: Settings) -> None:
    with pytest.raises(ValueError, match="Invalid or expired"):
        decode_access_token("invalid-token", settings)


def test_jwt_requires_configured_secret() -> None:
    settings = Settings(_env_file=None, jwt_secret_key="")

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        create_access_token("user-id", UserRole.CONSUMER, settings)


def test_sandbox_defaults_and_production_rejection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-secret-key-with-at-least-32-characters")
    monkeypatch.delenv("ENABLE_SANDBOX_PAYMENTS", raising=False)
    get_settings.cache_clear()
    assert get_settings().enable_sandbox_payments is True

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_SANDBOX_PAYMENTS", "true")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="ENABLE_SANDBOX_PAYMENTS"):
        get_settings()
    get_settings.cache_clear()
