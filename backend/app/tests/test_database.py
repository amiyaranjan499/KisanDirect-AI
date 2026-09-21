import asyncio
import sys

import pytest
from sqlalchemy import inspect, text

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from backend.app.models.base import Base
from backend.app.models import CropListing, Farmer, User


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


EXPECTED_TABLES = {
    "users",
    "farmers",
    "consumers",
    "admins",
    "crops",
    "crop_listings",
    "crop_images",
    "carts",
    "cart_items",
    "orders",
    "order_items",
    "payments",
    "deliveries",
    "reviews",
    "notifications",
    "ai_quality_predictions",
    "ai_price_predictions",
}


def test_model_metadata_contains_phase_one_tables() -> None:
    assert EXPECTED_TABLES.issubset(Base.metadata.tables)
    assert User.__tablename__ == "users"
    assert CropListing.__tablename__ == "crop_listings"


def test_model_relationships_and_constraints() -> None:
    assert Farmer.__table__.c.user_id.unique is True
    assert CropListing.__table__.c.quantity.nullable is False
    constraint_names = {constraint.name for constraint in CropListing.__table__.constraints}
    assert "ck_crop_listings_quantity_positive" in constraint_names
    assert "ck_crop_listings_price_nonnegative" in constraint_names


@pytest.mark.parametrize("table_name", sorted(EXPECTED_TABLES))
def test_database_table_exists(table_name: str) -> None:
    async def check() -> bool:
        engine = build_engine(Settings())
        async with engine.connect() as connection:
            exists = await connection.run_sync(
                lambda sync_connection: inspect(sync_connection).has_table(table_name)
            )
        await engine.dispose()
        return exists

    assert asyncio.run(check())


def test_postgis_and_location_columns() -> None:
    async def check() -> tuple[bool, list[str]]:
        engine = build_engine(Settings())
        async with engine.connect() as connection:
            extension = (await connection.execute(text("SELECT PostGIS_Full_Version()"))).scalar_one()
            locations = (
                await connection.execute(
                    text(
                        "SELECT table_name FROM information_schema.columns "
                        "WHERE table_schema='public' AND column_name='location'"
                    )
                )
            ).scalars().all()
        await engine.dispose()
        return bool(extension), locations

    postgis_available, location_tables = asyncio.run(check())
    assert postgis_available
    assert set(location_tables) == {"farmers", "crop_listings"}
