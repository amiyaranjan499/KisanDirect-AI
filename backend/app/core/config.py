import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KisanDirect AI API"
    app_env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    api_v1_prefix: str = "/api/v1"
    database_url: str = ""
    test_database_url: str = ""
    jwt_secret_key: str = ""
    gemini_api_key: str = ""
    enable_sandbox_payments: bool | None = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0)
    hub_service_radius_km: Decimal = Field(default=Decimal("8"), gt=0)
    packing_minutes: int = Field(default=15, gt=0)
    rider_speed_kmph: Decimal = Field(default=Decimal("20"), gt=0)
    delivery_buffer_minutes: int = Field(default=10, ge=0)
    reservation_ttl_minutes: int = Field(default=10, gt=0)
    otp_ttl_minutes: int = Field(default=120, gt=0)
    otp_max_attempts: int = Field(default=5, gt=0)
    rider_offer_timeout_seconds: int = Field(default=60, gt=0)
    rider_location_stale_seconds: int = Field(default=30, gt=0)
    delivery_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    platform_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    auth_rate_limit_requests: int = Field(default=5, gt=0)
    auth_rate_limit_window_seconds: int = Field(default=60, gt=0)
    cors_origins: list[str] | str = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    cors_origin_regex: str | None = Field(default=r"^https://.*\.onrender\.com$")

    @field_validator("cors_origins", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @field_validator("database_url", "test_database_url", mode="after")
    @classmethod
    def assemble_database_url(cls, v: str) -> str:
        if v:
            if v.startswith("postgres://"):
                v = "postgresql+psycopg://" + v[len("postgres://"):]
            elif v.startswith("postgresql://") and not v.startswith("postgresql+"):
                v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        env_prefix="",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.enable_sandbox_payments is None:
        settings.enable_sandbox_payments = settings.app_env.lower() in {"development", "test"}
    if settings.app_env.lower() == "production" and settings.enable_sandbox_payments:
        raise RuntimeError("ENABLE_SANDBOX_PAYMENTS cannot be true in production")
    if settings.app_env.lower() != "development" and settings.jwt_secret_key in {
        "",
        "change-this-to-a-long-random-secret",
    }:
        raise RuntimeError(
            "JWT_SECRET_KEY must be set to a non-placeholder value outside development"
        )
    return settings
