import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    AvailabilityStatus,
    Consumer,
    Crop,
    CropImage,
    CropListing,
    Farmer,
    User,
    UserRole,
)


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_fixture() -> tuple[User, User, Farmer, list[CropListing], list[str]]:
    async def seed():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer_user = User(
                email=f"consumer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.CONSUMER,
            )
            farmer_user = User(
                email=f"farmer-consumer-test-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            session.add_all([consumer_user, farmer_user])
            await session.flush()
            farmer = Farmer(
                user_id=farmer_user.id,
                name="Public Farm Name",
                phone="private-phone",
                address="private-address",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
            )
            session.add(farmer)
            await session.flush()
            names = [f"Consumer Test Rice {uuid4()}", f"Consumer Test Wheat {uuid4()}"]
            crops = [Crop(name=names[0], category="Grain"), Crop(name=names[1], category="Cereal")]
            session.add_all(crops)
            await session.flush()
            listings = [
                CropListing(
                    crop_id=crops[0].id,
                    farmer_id=farmer.id,
                    quantity=Decimal("20"),
                    unit="kg",
                    asking_price=Decimal("80"),
                    description="Active consumer listing",
                    location=WKTElement("POINT(85.8 20.3)", srid=4326),
                    availability_status=AvailabilityStatus.AVAILABLE,
                ),
                CropListing(
                    crop_id=crops[1].id,
                    farmer_id=farmer.id,
                    quantity=Decimal("30"),
                    unit="kg",
                    asking_price=Decimal("160"),
                    description="Inactive consumer listing",
                    availability_status=AvailabilityStatus.UNAVAILABLE,
                ),
            ]
            session.add_all(listings)
            await session.commit()
            await session.refresh(consumer_user)
            await session.refresh(farmer_user)
            for listing in listings:
                await session.refresh(listing)
        await engine.dispose()
        return consumer_user, farmer_user, farmer, listings, names

    return asyncio.run(seed())


def cleanup_fixture(consumer_id, farmer_user_id, farmer_id, listing_ids, crop_names) -> None:
    async def cleanup():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(CropImage).where(CropImage.listing_id.in_(listing_ids)))
            await session.execute(delete(CropListing).where(CropListing.id.in_(listing_ids)))
            await session.execute(delete(Crop).where(Crop.name.in_(crop_names)))
            await session.execute(delete(Consumer).where(Consumer.user_id == consumer_id))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_id))
            await session.execute(delete(User).where(User.id.in_([consumer_id, farmer_user_id])))
            await session.commit()
        await engine.dispose()

    asyncio.run(cleanup())


def test_consumer_profile_browse_search_filters_and_authorization() -> None:
    consumer, farmer_user, farmer, listings, crop_names = seed_fixture()
    try:
        with TestClient(create_app()) as client:
            unauthorized = client.get("/api/v1/consumers/me")
            assert unauthorized.status_code == 401

            farmer_blocked = client.get("/api/v1/consumers/me", headers=auth_header(farmer_user))
            assert farmer_blocked.status_code == 403

            updated = client.put(
                "/api/v1/consumers/me",
                headers=auth_header(consumer),
                json={"name": "Test Consumer", "phone": "5550200", "address": "Delivery address"},
            )
            assert updated.status_code == 200
            assert updated.json()["address"] == "Delivery address"
            assert client.get("/api/v1/consumers/me", headers=auth_header(consumer)).status_code == 200

            farmer_write_blocked = client.patch(
                f"/api/v1/farmers/me/listings/{listings[0].id}",
                headers=auth_header(consumer),
                json={"description": "Consumer must not modify farmer data"},
            )
            assert farmer_write_blocked.status_code == 403

            listings_response = client.get("/api/v1/marketplace/listings", headers=auth_header(consumer))
            assert listings_response.status_code == 200
            visible = listings_response.json()
            assert listings_response.json()["total"] == 1
            visible = listings_response.json()["items"]
            assert visible[0]["crop_name"] == crop_names[0]
            assert visible[0]["farmer_name"] == "Public Farm Name"
            assert "phone" not in visible[0]

            search = client.get(
                "/api/v1/marketplace/listings",
                headers=auth_header(consumer),
                params={"search": "Rice"},
            )
            assert len(search.json()["items"]) == 1

            category = client.get(
                "/api/v1/marketplace/listings",
                headers=auth_header(consumer),
                params={"category": "Grain"},
            )
            assert len(category.json()["items"]) == 1

            price = client.get(
                "/api/v1/marketplace/listings",
                headers=auth_header(consumer),
                params={"max_price": "100", "sort": "price_asc"},
            )
            assert len(price.json()["items"]) == 1
            assert Decimal(price.json()["items"][0]["asking_price"]) <= Decimal("100")

            paged = client.get(
                "/api/v1/marketplace/listings",
                headers=auth_header(consumer),
                params={"page": 1, "page_size": 1},
            )
            assert paged.json()["page"] == 1
            assert paged.json()["page_size"] == 1

            invalid_range = client.get(
                "/api/v1/marketplace/listings",
                headers=auth_header(consumer),
                params={"min_price": "200", "max_price": "100"},
            )
            assert invalid_range.status_code == 422

            farmer_details = client.get(
                f"/api/v1/marketplace/farmers/{farmer.id}",
                headers=auth_header(consumer),
            )
            assert farmer_details.status_code == 200
            assert farmer_details.json()["name"] == "Public Farm Name"
            assert len(farmer_details.json()["listings"]) == 1
            assert farmer_details.json()["listings"][0]["quality"] is None
            assert farmer_details.json()["listings"][0]["ai_recommended_price"] is None

            details = client.get(
                f"/api/v1/marketplace/listings/{listings[0].id}",
                headers=auth_header(consumer),
            )
            assert details.status_code == 200
            assert details.json()["description"] == "Active consumer listing"

            inactive = client.get(
                f"/api/v1/marketplace/listings/{listings[1].id}",
                headers=auth_header(consumer),
            )
            assert inactive.status_code == 404
    finally:
        cleanup_fixture(consumer.id, farmer_user.id, farmer.id, [item.id for item in listings], crop_names)
