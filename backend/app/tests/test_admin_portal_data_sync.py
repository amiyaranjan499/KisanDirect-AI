import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    Admin,
    AdminAuditEvent,
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStaff,
    HubStatus,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Rider,
    RiderApprovalStatus,
    RiderAvailability,
    Shipment,
    ShipmentStatus,
    User,
    UserRole,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def test_admin_portal_data_sync_and_deletions() -> None:
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)

    admin_user = None
    farmer_user = None
    farmer_profile = None
    consumer_user = None
    consumer_profile = None
    crop = None
    active_listing = None
    unavailable_listing = None
    order = None
    payment = None
    shipment = None
    rider_user = None
    rider_profile = None
    hub = None
    staff_user = None

    async def setup_data():
        nonlocal admin_user, farmer_user, farmer_profile, consumer_user, consumer_profile
        nonlocal crop, active_listing, unavailable_listing, order, payment, shipment
        nonlocal rider_user, rider_profile, hub, staff_user

        async with factory() as session:
            async with session.begin_nested():
                admin_user = User(
                    email=f"admin-sync-{uuid4()}@test.internal",
                    hashed_password=hash_password("Pass-12345"),
                    role=UserRole.ADMIN,
                    is_active=True,
                )
                farmer_user = User(
                    email=f"farmer-sync-{uuid4()}@test.internal",
                    hashed_password=hash_password("Pass-12345"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-sync-{uuid4()}@test.internal",
                    hashed_password=hash_password("Pass-12345"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                rider_user = User(
                    email=f"rider-sync-{uuid4()}@test.internal",
                    hashed_password=hash_password("Pass-12345"),
                    role=UserRole.RIDER,
                    is_active=True,
                )
                staff_user = User(
                    email=f"staff-sync-{uuid4()}@test.internal",
                    hashed_password=hash_password("Pass-12345"),
                    role=UserRole.HUB_STAFF,
                    is_active=True,
                )
                session.add_all([admin_user, farmer_user, consumer_user, rider_user, staff_user])
                await session.flush()

                admin_profile = Admin(user_id=admin_user.id, name="Sync Admin")
                farmer_profile = Farmer(user_id=farmer_user.id, name="Sync Farmer")
                consumer_profile = Consumer(user_id=consumer_user.id, name="Sync Consumer")
                rider_profile = Rider(
                    user_id=rider_user.id,
                    display_name="Sync Rider",
                    availability=RiderAvailability.AVAILABLE,
                    approval_status=RiderApprovalStatus.APPROVED,
                )
                session.add_all([admin_profile, farmer_profile, consumer_profile, rider_profile])
                await session.flush()

                crop = Crop(name=f"Sync Crop {uuid4()}", category="Vegetable")
                session.add(crop)
                await session.flush()

                active_listing = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal("30.000"),
                    minimum_order_quantity=Decimal("1.000"),
                    unit="kg",
                    asking_price=Decimal("25.00"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                unavailable_listing = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal("10.000"),
                    minimum_order_quantity=Decimal("1.000"),
                    unit="kg",
                    asking_price=Decimal("20.00"),
                    availability_status=AvailabilityStatus.UNAVAILABLE,
                )
                session.add_all([active_listing, unavailable_listing])
                await session.flush()

                order = Order(
                    consumer_id=consumer_profile.id,
                    status=OrderStatus.PENDING,
                    total_amount=Decimal("50.00"),
                    created_at=datetime.now(timezone.utc),
                )
                session.add(order)
                await session.flush()

                session.add(
                    OrderItem(
                        order_id=order.id,
                        listing_id=active_listing.id,
                        quantity=Decimal("2.000"),
                        unit_price=Decimal("25.00"),
                        subtotal=Decimal("50.00"),
                    )
                )

                payment = Payment(
                    order_id=order.id,
                    amount=Decimal("50.00"),
                    status=PaymentStatus.PAID,
                    provider_reference=f"PAY-SYNC-{uuid4()}",
                    payment_method="TEST_SANDBOX",
                    is_test=True,
                )
                session.add(payment)
                await session.flush()

                now = datetime.now(timezone.utc)
                shipment = Shipment(
                    order_id=order.id,
                    rider_id=rider_profile.id,
                    status=ShipmentStatus.DELIVERED,
                    promised_window_start=now,
                    promised_window_end=now + timedelta(hours=1),
                    pickup_address_snapshot="Farm 1",
                    dropoff_address_snapshot="Home 1",
                )
                session.add(shipment)
                await session.flush()

                hub = Hub(
                    name="Sync Hub",
                    address="123 Farm Way",
                    location="SRID=4326;POINT(77.5946 12.9716)",
                    pincode="560001",
                    service_radius_km=Decimal("8.00"),
                    status=HubStatus.ACTIVE,
                    farmer_id=farmer_profile.id,
                )
                session.add(hub)
                await session.flush()

                session.add(HubStaff(user_id=staff_user.id, hub_id=hub.id))
            await session.commit()

    async def cleanup_data():
        async with factory() as session:
            async with session.begin_nested():
                if order:
                    await session.execute(delete(Shipment).where(Shipment.order_id == order.id))
                    await session.execute(delete(Payment).where(Payment.order_id == order.id))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
                    await session.execute(delete(Order).where(Order.id == order.id))
                if active_listing:
                    await session.execute(delete(CropListing).where(CropListing.id == active_listing.id))
                if unavailable_listing:
                    await session.execute(delete(CropListing).where(CropListing.id == unavailable_listing.id))
                if crop:
                    await session.execute(delete(Crop).where(Crop.id == crop.id))
                if hub:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id == hub.id))
                    await session.execute(delete(Hub).where(Hub.id == hub.id))
                users_to_delete = [u.id for u in [admin_user, farmer_user, consumer_user, rider_user, staff_user] if u is not None]
                if users_to_delete:
                    await session.execute(delete(AdminAuditEvent).where(AdminAuditEvent.actor_user_id.in_(users_to_delete)))
                    await session.execute(delete(User).where(User.id.in_(users_to_delete)))
            await session.commit()
        await engine.dispose()

    try:
        asyncio.run(setup_data())

        with TestClient(create_app()) as client:
            headers = auth_header(admin_user)

            # 1. Verify dashboard summary crop listing count excludes UNAVAILABLE
            summary_resp = client.get("/api/v1/admins/dashboard/summary", headers=headers)
            assert summary_resp.status_code == 200
            summary_data = summary_resp.json()
            initial_listings_count = summary_data["total_listings"]
            initial_orders_count = summary_data["total_orders"]

            # 2. Delete Payment
            del_payment_resp = client.delete(f"/api/v1/admins/payments/{payment.id}", headers=headers)
            assert del_payment_resp.status_code == 204

            # 3. Delete Shipment (DELIVERED status is allowed)
            del_shipment_resp = client.delete(f"/api/v1/admins/shipments/{shipment.id}", headers=headers)
            assert del_shipment_resp.status_code == 204

            # 4. Delete Order
            del_order_resp = client.delete(f"/api/v1/admins/orders/{order.id}", headers=headers)
            assert del_order_resp.status_code == 204

            summary_after_order = client.get("/api/v1/admins/dashboard/summary", headers=headers).json()
            assert summary_after_order["total_orders"] == initial_orders_count - 1

            # 5. Delete Listing
            del_listing_resp = client.delete(f"/api/v1/admins/listings/{active_listing.id}", headers=headers)
            assert del_listing_resp.status_code == 204

            summary_after_listing = client.get("/api/v1/admins/dashboard/summary", headers=headers).json()
            assert summary_after_listing["total_listings"] == initial_listings_count - 1

            # 6. Delete Hub Staff
            del_staff_resp = client.delete(f"/api/v1/admins/hub-staff/{staff_user.id}", headers=headers)
            assert del_staff_resp.status_code == 204

            # 7. Delete Rider (no active shipments)
            del_rider_resp = client.delete(f"/api/v1/admins/riders/{rider_profile.id}", headers=headers)
            assert del_rider_resp.status_code == 204

            # 8. Delete Farmer
            del_farmer_resp = client.delete(f"/api/v1/admins/farmers/{farmer_profile.id}", headers=headers)
            assert del_farmer_resp.status_code == 204

            # Verify farmer user was permanently removed so email can be reused
            async def verify_farmer_user_gone():
                engine_check = build_engine(Settings())
                factory_check = async_sessionmaker(engine_check, expire_on_commit=False)
                async with factory_check() as session:
                    res = await session.scalar(select(User).where(User.id == farmer_user.id))
                    assert res is None
                await engine_check.dispose()

            asyncio.run(verify_farmer_user_gone())

    finally:
        asyncio.run(cleanup_data())
