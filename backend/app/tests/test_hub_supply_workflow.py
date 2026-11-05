import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Hub,
    HubStaff,
    HubStatus,
    HubStock,
    HubStockDelivery,
    User,
    UserRole,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed_hub_supply_data():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(
                email=f"supply-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Password123!"),
                role=UserRole.FARMER,
            )
            staff_user = User(
                email=f"supply-staff-{uuid4()}@example.com",
                hashed_password=hash_password("Password123!"),
                role=UserRole.HUB_STAFF,
            )
            session.add_all([farmer_user, staff_user])
            await session.flush()

            farmer_profile = Farmer(
                user_id=farmer_user.id,
                name="Supply Farmer",
                location=WKTElement("POINT(85.82 20.29)", srid=4326),
            )
            hub = Hub(
                name="Central Fresh Hub",
                address="Plot 42, Green Belt, Bhubaneswar",
                location=WKTElement("POINT(85.82 20.29)", srid=4326),
                pincode="751001",
                service_radius_km=Decimal("10"),
                status=HubStatus.ACTIVE,
            )
            session.add_all([farmer_profile, hub])
            await session.flush()

            hub_staff = HubStaff(user_id=staff_user.id, hub_id=hub.id)
            crop = Crop(name=f"Hub Supply Crop {uuid4()}", category="Vegetables")
            session.add_all([hub_staff, crop])
            await session.flush()

            listing = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("100"),
                minimum_order_quantity=Decimal("5"),
                unit="kg",
                asking_price=Decimal("40"),
                availability_status=AvailabilityStatus.AVAILABLE,
            )
            session.add(listing)
            await session.commit()

            for item in [farmer_user, staff_user, farmer_profile, hub, crop, listing]:
                await session.refresh(item)

        await engine.dispose()
        return farmer_user, staff_user, farmer_profile, hub, crop, listing

    return asyncio.run(create())


def cleanup_hub_supply_data(data):
    farmer_user, staff_user, farmer_profile, hub, crop, listing = data

    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(HubStockDelivery).where(HubStockDelivery.hub_id == hub.id))
            await session.execute(delete(HubStock).where(HubStock.hub_id == hub.id))
            await session.execute(delete(HubStaff).where(HubStaff.hub_id == hub.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Hub).where(Hub.id == hub.id))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([farmer_user.id, staff_user.id])))
            await session.commit()

        await engine.dispose()

    asyncio.run(remove())


def test_farmer_hub_supply_and_receipt_lifecycle():
    data = seed_hub_supply_data()
    farmer_user, staff_user, farmer_profile, hub, crop, listing = data

    try:
        with TestClient(create_app()) as client:
            # 1. Farmer queries eligible hubs
            hubs_res = client.get(
                "/api/v1/hub-operations/farmer/hubs",
                headers=auth_header(farmer_user),
            )
            assert hubs_res.status_code == 200
            hubs_list = hubs_res.json()
            assert any(h["id"] == str(hub.id) for h in hubs_list)

            # 2. Farmer submits a stock delivery to the hub
            delivery_res = client.post(
                "/api/v1/hub-operations/farmer/stock-deliveries",
                headers=auth_header(farmer_user),
                json={
                    "listing_id": str(listing.id),
                    "hub_id": str(hub.id),
                    "quantity": 25.0,
                },
            )
            assert delivery_res.status_code == 201
            delivery = delivery_res.json()
            assert delivery["status"] == "PENDING"
            assert delivery["hub_id"] == str(hub.id)
            assert delivery["listing_id"] == str(listing.id)
            assert float(delivery["quantity"]) == 25.0

            delivery_id = delivery["id"]

            # 3. Staff receives notification about incoming produce
            staff_notifs = client.get(
                "/api/v1/notifications",
                headers=auth_header(staff_user),
            )
            assert staff_notifs.status_code == 200
            assert any(
                "Incoming produce delivery" in n["title"]
                for n in staff_notifs.json()["items"]
            )

            # 4. Farmer lists their stock deliveries
            farmer_deliveries = client.get(
                "/api/v1/hub-operations/farmer/stock-deliveries",
                headers=auth_header(farmer_user),
            )
            assert farmer_deliveries.status_code == 200
            assert any(d["id"] == delivery_id for d in farmer_deliveries.json())

            # 5. Hub Staff receives the delivery with verified quantity (discrepancy handling: 20.0 of 25.0 accepted)
            receive_res = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/stock-deliveries/{delivery_id}/receive",
                headers=auth_header(staff_user),
                json={"received_quantity": 20.0},
            )
            assert receive_res.status_code == 200
            received_delivery = receive_res.json()
            assert received_delivery["status"] == "RECEIVED"
            assert received_delivery["id"] == delivery_id
            assert float(received_delivery["quantity"]) == 20.0

            # 6. Farmer receives notification confirming produce receipt and verified quantity
            farmer_notifs = client.get(
                "/api/v1/notifications",
                headers=auth_header(farmer_user),
            )
            assert farmer_notifs.status_code == 200
            assert any(
                "Produce received at hub" in n["title"] and "20.0" in n["message"]
                for n in farmer_notifs.json()["items"]
            )

            # 7. Idempotency check: receiving again returns the received delivery
            receive_again = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/stock-deliveries/{delivery_id}/receive",
                headers=auth_header(staff_user),
            )
            assert receive_again.status_code == 200
            assert receive_again.json()["status"] == "RECEIVED"
            assert float(receive_again.json()["quantity"]) == 20.0
    finally:
        cleanup_hub_supply_data(data)


def test_login_and_role_permissions():
    password = "SecurePassword123!"
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)

    users = {}

    async def seed_users():
        async with factory() as session:
            for role in [UserRole.CONSUMER, UserRole.FARMER, UserRole.HUB_STAFF, UserRole.RIDER]:
                user = User(
                    email=f"perm-{role.value.lower()}-{uuid4()}@example.com",
                    hashed_password=hash_password(password),
                    role=role,
                )
                session.add(user)
                await session.flush()
                users[role] = user

                if role is UserRole.CONSUMER:
                    session.add(Consumer(user_id=user.id, name="Test Consumer"))
                elif role is UserRole.FARMER:
                    session.add(Farmer(user_id=user.id, name="Test Farmer", location=WKTElement("POINT(85.8 20.3)", srid=4326)))
            await session.commit()

    async def cleanup_users():
        async with factory() as session:
            user_ids = [u.id for u in users.values()]
            await session.execute(delete(Consumer).where(Consumer.user_id.in_(user_ids)))
            await session.execute(delete(Farmer).where(Farmer.user_id.in_(user_ids)))
            await session.execute(delete(User).where(User.id.in_(user_ids)))
            await session.commit()
        await engine.dispose()

    asyncio.run(seed_users())

    try:
        with TestClient(create_app()) as client:
            tokens = {}
            # 1. Verify authentication and token issue for all 4 roles
            for role, user in users.items():
                resp = client.post(
                    "/api/v1/auth/login",
                    json={"email": user.email, "password": password},
                )
                assert resp.status_code == 200, f"Login failed for {role.value}: {resp.text}"
                tokens[role] = resp.json()["access_token"]

                # 2. Verify /auth/me returns the exact authenticated role
                me_resp = client.get(
                    "/api/v1/auth/me",
                    headers={"Authorization": f"Bearer {tokens[role]}"},
                )
                assert me_resp.status_code == 200
                assert me_resp.json()["role"] == role.value

            # 3. Test cross-role authorization restrictions:
            # Hub Staff cannot access Farmer listings endpoint
            hub_staff_on_farmer = client.get(
                "/api/v1/farmers/me/listings",
                headers={"Authorization": f"Bearer {tokens[UserRole.HUB_STAFF]}"},
            )
            assert hub_staff_on_farmer.status_code == 403

            # Farmer cannot access Hub Staff operations
            farmer_on_hub_staff = client.get(
                "/api/v1/hub-operations/hub-staff/hubs",
                headers={"Authorization": f"Bearer {tokens[UserRole.FARMER]}"},
            )
            assert farmer_on_hub_staff.status_code == 403

            # Consumer cannot access Hub Staff operations
            consumer_on_hub_staff = client.get(
                "/api/v1/hub-operations/hub-staff/hubs",
                headers={"Authorization": f"Bearer {tokens[UserRole.CONSUMER]}"},
            )
            assert consumer_on_hub_staff.status_code == 403

            # Rider cannot access Farmer hubs endpoint
            rider_on_farmer = client.get(
                "/api/v1/hub-operations/farmer/hubs",
                headers={"Authorization": f"Bearer {tokens[UserRole.RIDER]}"},
            )
            assert rider_on_farmer.status_code == 403
    finally:
        asyncio.run(cleanup_users())


def test_hub_staff_isolation_and_cross_hub_rejection():
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup_test_hubs():
        async with factory() as session:
            staff_a = User(
                email=f"staff-a-{uuid4()}@example.com",
                hashed_password=hash_password("Pass123!"),
                role=UserRole.HUB_STAFF,
            )
            staff_b = User(
                email=f"staff-b-{uuid4()}@example.com",
                hashed_password=hash_password("Pass123!"),
                role=UserRole.HUB_STAFF,
            )
            farmer = User(
                email=f"hub-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Pass123!"),
                role=UserRole.FARMER,
            )
            session.add_all([staff_a, staff_b, farmer])
            await session.flush()

            farmer_profile = Farmer(
                user_id=farmer.id,
                name="Hub Isolation Farmer",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
            )
            hub_active_1 = Hub(
                name="Active Hub 1",
                address="Address 1",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751001",
                service_radius_km=Decimal("10"),
                status=HubStatus.ACTIVE,
            )
            hub_active_2 = Hub(
                name="Active Hub 2",
                address="Address 2",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751002",
                service_radius_km=Decimal("10"),
                status=HubStatus.ACTIVE,
            )
            hub_inactive = Hub(
                name="Inactive Hub 3",
                address="Address 3",
                location=WKTElement("POINT(85.8 20.3)", srid=4326),
                pincode="751003",
                service_radius_km=Decimal("10"),
                status=HubStatus.INACTIVE,
            )
            session.add_all([farmer_profile, hub_active_1, hub_active_2, hub_inactive])
            await session.flush()

            # Staff A is assigned ONLY to Hub 1; Staff B is assigned ONLY to Hub 2
            assign_a = HubStaff(user_id=staff_a.id, hub_id=hub_active_1.id)
            assign_b = HubStaff(user_id=staff_b.id, hub_id=hub_active_2.id)
            session.add_all([assign_a, assign_b])
            await session.commit()

            return staff_a, staff_b, farmer, hub_active_1, hub_active_2, hub_inactive

    staff_a, staff_b, farmer, hub_1, hub_2, hub_3 = asyncio.run(setup_test_hubs())

    async def cleanup_test_hubs():
        async with factory() as session:
            await session.execute(delete(HubStaff).where(HubStaff.hub_id.in_([hub_1.id, hub_2.id, hub_3.id])))
            await session.execute(delete(Hub).where(Hub.id.in_([hub_1.id, hub_2.id, hub_3.id])))
            await session.execute(delete(Farmer).where(Farmer.user_id == farmer.id))
            await session.execute(delete(User).where(User.id.in_([staff_a.id, staff_b.id, farmer.id])))
            await session.commit()
        await engine.dispose()

    try:
        with TestClient(create_app()) as client:
            # 1. Active hubs filtering: Farmer sees active hubs, but INACTIVE hub is excluded
            farmer_hubs = client.get(
                "/api/v1/hub-operations/farmer/hubs",
                headers=auth_header(farmer),
            )
            assert farmer_hubs.status_code == 200
            returned_ids = {h["id"] for h in farmer_hubs.json()}
            assert str(hub_1.id) in returned_ids
            assert str(hub_2.id) in returned_ids
            assert str(hub_3.id) not in returned_ids, "Inactive hub must not be presented to farmers"

            # 2. Staff A only sees their assigned hub
            staff_a_hubs = client.get(
                "/api/v1/hub-operations/hub-staff/hubs",
                headers=auth_header(staff_a),
            )
            assert staff_a_hubs.status_code == 200
            staff_a_hub_ids = {h["id"] for h in staff_a_hubs.json()}
            assert str(hub_1.id) in staff_a_hub_ids
            assert str(hub_2.id) not in staff_a_hub_ids

            # 3. Staff A attempting to access Hub 2 overview is rejected with 403 Forbidden
            unauthorized_overview = client.get(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub_2.id}/overview",
                headers=auth_header(staff_a),
            )
            assert unauthorized_overview.status_code == 403

            # 4. Staff A attempting to receive delivery at unassigned Hub 2 is rejected with 403 Forbidden
            unauthorized_receive = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub_2.id}/stock-deliveries/{uuid4()}/receive",
                headers=auth_header(staff_a),
            )
            assert unauthorized_receive.status_code == 403
    finally:
        asyncio.run(cleanup_test_hubs())

