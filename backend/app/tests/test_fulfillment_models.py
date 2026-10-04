import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker
from pydantic import ValidationError

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from backend.app.models import (
    AvailabilityStatus,
    Crop,
    CropListing,
    DeliverySlot,
    Farmer,
    Hub,
    HubStock,
    RiderAvailability,
    RiderApprovalStatus,
    ShipmentStatus,
    User,
    UserRole,
)
from backend.app.schemas.auth import RegistrationRequest


def test_new_role_and_fulfillment_enum_values() -> None:
    assert UserRole.RIDER.value == "RIDER"
    assert UserRole.HUB_STAFF.value == "HUB_STAFF"
    assert {status.value for status in ShipmentStatus} == {
        "PACKING",
        "READY_FOR_PICKUP",
        "RIDER_ASSIGNED",
        "PICKED_UP",
        "OUT_FOR_DELIVERY",
        "ARRIVED",
        "DELIVERED",
        "FAILED_DELIVERY",
        "RETURNED",
        "CANCELLED",
    }
    assert {value.value for value in RiderAvailability} == {"OFFLINE", "AVAILABLE", "BUSY"}
    assert {value.value for value in RiderApprovalStatus} == {
        "PENDING_APPROVAL",
        "APPROVED",
        "SUSPENDED",
    }


def test_public_registration_rejects_admin_hub_staff_and_rider() -> None:
    for role in ("ADMIN", "HUB_STAFF", "RIDER"):
        with pytest.raises(ValidationError):
            RegistrationRequest(
                email=f"{role.lower()}@example.com",
                password="Password123!",
                role=role,
            )


def test_database_rejects_negative_hub_stock_and_overbooked_slot() -> None:
    suffix = uuid4().hex
    user_id = uuid4()
    rider_user_id = uuid4()
    hub_staff_user_id = uuid4()
    farmer_id = uuid4()
    crop_id = uuid4()
    listing_id = uuid4()
    hub_id = uuid4()

    async def check_constraints() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            session.add_all(
                [
                    User(
                        id=user_id,
                        email=f"fulfillment-{suffix}@example.com",
                        hashed_password="test-hash",
                        role=UserRole.FARMER,
                    ),
                    User(
                        id=rider_user_id,
                        email=f"rider-{suffix}@example.com",
                        hashed_password="test-hash",
                        role=UserRole.RIDER,
                    ),
                    User(
                        id=hub_staff_user_id,
                        email=f"hub-staff-{suffix}@example.com",
                        hashed_password="test-hash",
                        role=UserRole.HUB_STAFF,
                    ),
                    Farmer(id=farmer_id, user_id=user_id, name="Constraint Test Farmer"),
                    Crop(id=crop_id, name=f"Constraint Test Crop {suffix}"),
                    Hub(
                        id=hub_id,
                        name="Constraint Test Hub",
                        address="Test address",
                        location=WKTElement("POINT(85 20)", srid=4326),
                        pincode="751001",
                    ),
                ]
            )
            await session.flush()
            session.add(
                CropListing(
                    id=listing_id,
                    crop_id=crop_id,
                    farmer_id=farmer_id,
                    quantity=Decimal("5.000"),
                    unit="kg",
                    asking_price=Decimal("20.00"),
                    minimum_order_quantity=Decimal("1.000"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
            )
            await session.commit()

            with pytest.raises(IntegrityError):
                async with session.begin():
                    session.add(
                        HubStock(
                            hub_id=hub_id,
                            listing_id=listing_id,
                            available_quantity=Decimal("-0.001"),
                        )
                    )

            starts_at = datetime.now(timezone.utc) + timedelta(days=1)
            with pytest.raises(IntegrityError):
                async with session.begin():
                    session.add(
                        DeliverySlot(
                            hub_id=hub_id,
                            starts_at=starts_at,
                            ends_at=starts_at + timedelta(hours=1),
                            capacity=2,
                            booked_count=3,
                        )
                    )

            await session.execute(delete(CropListing).where(CropListing.id == listing_id))
            await session.execute(delete(Crop).where(Crop.id == crop_id))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_id))
            await session.execute(delete(Hub).where(Hub.id == hub_id))
            await session.execute(
                delete(User).where(User.id.in_((user_id, rider_user_id, hub_staff_user_id)))
            )
            await session.commit()
        await engine.dispose()

    asyncio.run(check_constraints())
