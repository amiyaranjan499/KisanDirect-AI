import asyncio
from datetime import datetime, timedelta, timezone
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
    Cart,
    CartItem,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    FarmerHiddenOrder,
    Hub,
    HubStaff,
    HubStock,
    HubStatus,
    Notification,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Shipment,
    ShipmentStatus,
    StockReservation,
    User,
    UserRole,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def test_farmer_facility_and_staff_lifecycle():
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []

        try:
            # Seed 2 farmers
            async with factory() as session:
                farmer1_user = User(
                    email=f"farmer1-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                )
                farmer2_user = User(
                    email=f"farmer2-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                )
                session.add_all([farmer1_user, farmer2_user])
                await session.flush()
                created_user_ids.extend([farmer1_user.id, farmer2_user.id])

                farmer1_profile = Farmer(
                    user_id=farmer1_user.id,
                    name="Farmer One",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pin_code="751001",
                )
                farmer2_profile = Farmer(
                    user_id=farmer2_user.id,
                    name="Farmer Two",
                    location=WKTElement("POINT(85.80 20.28)", srid=4326),
                    pin_code="751002",
                )
                session.add_all([farmer1_profile, farmer2_profile])
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # 1. Farmer 1 creates a storage facility
            create_payload = {
                "name": "Barabanki Cold Storage",
                "address": "Plot 12, Kisan Complex, Barabanki",
                "pincode": "225001",
                "latitude": 26.92,
                "longitude": 81.18,
                "service_radius_km": 10.0,
            }
            res = client.post(
                "/api/v1/farmers/me/facilities",
                json=create_payload,
                headers=auth_header(farmer1_user),
            )
            assert res.status_code == 201, res.text
            facility = res.json()
            assert facility["name"] == "Barabanki Cold Storage"
            assert facility["pincode"] == "225001"
            assert facility["status"] == "ACTIVE"
            assert facility["staff_count"] == 0
            facility_id = facility["id"]
            created_hub_ids.append(facility_id)

            # 1b. Farmer 2 creates a facility without latitude/longitude (only address & pincode)
            no_gps_payload = {
                "name": "Bhubaneswar Farmer Hub",
                "address": "Khandagiri Square, Near Post Office",
                "village_or_locality": "Khandagiri",
                "district": "Khordha",
                "state": "Odisha",
                "pincode": "751030",
            }
            res_no_gps = client.post(
                "/api/v1/farmers/me/facilities",
                json=no_gps_payload,
                headers=auth_header(farmer2_user),
            )
            assert res_no_gps.status_code == 201, res_no_gps.text
            facility2 = res_no_gps.json()
            assert facility2["name"] == "Bhubaneswar Farmer Hub"
            assert "Khandagiri" in facility2["address"]
            assert facility2["pincode"] == "751030"
            created_hub_ids.append(facility2["id"])

            # 1c. Invalid pincode (starting with 0 or wrong length) is rejected with 422
            invalid_pin_res = client.post(
                "/api/v1/farmers/me/facilities",
                json={
                    "name": "Invalid Pin Hub",
                    "address": "Village Road, Some Area",
                    "pincode": "012345",
                },
                headers=auth_header(farmer2_user),
            )
            assert invalid_pin_res.status_code == 422

            # 2. Farmer 1 lists facilities
            list_res = client.get(
                "/api/v1/farmers/me/facilities",
                headers=auth_header(farmer1_user),
            )
            assert list_res.status_code == 200
            facilities = list_res.json()
            assert len(facilities) == 1
            assert facilities[0]["id"] == facility_id

            # 3. Farmer 1 updates facility
            update_res = client.patch(
                f"/api/v1/farmers/me/facilities/{facility_id}",
                json={"name": "Barabanki Premium Agro Hub", "service_radius_km": 12.5},
                headers=auth_header(farmer1_user),
            )
            assert update_res.status_code == 200
            assert update_res.json()["name"] == "Barabanki Premium Agro Hub"
            assert float(update_res.json()["service_radius_km"]) == 12.5

            # 4. Farmer 2 cannot access or update Farmer 1's facility
            f2_update = client.patch(
                f"/api/v1/farmers/me/facilities/{facility_id}",
                json={"name": "Hacked Name"},
                headers=auth_header(farmer2_user),
            )
            assert f2_update.status_code == 404

            # 5. Farmer 1 creates staff account for the facility
            staff_email = f"staff-{uuid4()}@example.com"
            staff_payload = {
                "email": staff_email,
                "initial_password": "StaffPassword123!",
                "display_name": "Ramesh Staff Operator",
            }
            staff_res = client.post(
                f"/api/v1/farmers/me/facilities/{facility_id}/staff",
                json=staff_payload,
                headers=auth_header(farmer1_user),
            )
            assert staff_res.status_code == 201, staff_res.text
            staff_data = staff_res.json()
            assert staff_data["email"] == staff_email
            assert staff_data["facility_id"] == facility_id
            staff_user_id = staff_data["user_id"]
            created_user_ids.append(staff_user_id)

            # 5a. Created staff logs in through the existing login endpoint
            staff_login = client.post(
                "/api/v1/auth/login",
                json={"email": staff_email, "password": "StaffPassword123!"},
            )
            assert staff_login.status_code == 200, staff_login.text
            staff_token = staff_login.json()["access_token"]
            staff_auth = {"Authorization": f"Bearer {staff_token}"}

            # 5b. Authenticated role is confirmed as HUB_STAFF
            staff_me = client.get("/api/v1/auth/me", headers=staff_auth)
            assert staff_me.status_code == 200
            assert staff_me.json()["role"] == "HUB_STAFF"
            assert staff_me.json()["is_active"] is True

            # 5c. Staff cannot access farmer-only endpoints (403 Forbidden)
            staff_forbidden = client.get("/api/v1/farmers/me", headers=staff_auth)
            assert staff_forbidden.status_code == 403

            # 5d. Staff can access their authorized hub operations
            staff_hubs_res = client.get("/api/v1/hub-operations/hub-staff/hubs", headers=staff_auth)
            assert staff_hubs_res.status_code == 200
            staff_assigned_hubs = staff_hubs_res.json()
            assert any(h["id"] == facility_id for h in staff_assigned_hubs)

            # 6. Duplicate email is rejected
            dup_res = client.post(
                f"/api/v1/farmers/me/facilities/{facility_id}/staff",
                json=staff_payload,
                headers=auth_header(farmer1_user),
            )
            assert dup_res.status_code == 409

            # 7. Farmer 2 cannot add staff to Farmer 1's facility
            f2_staff = client.post(
                f"/api/v1/farmers/me/facilities/{facility_id}/staff",
                json={
                    "email": f"unauthorized-{uuid4()}@example.com",
                    "initial_password": "Password123!",
                },
                headers=auth_header(farmer2_user),
            )
            assert f2_staff.status_code == 404

            # 8. Farmer 1 lists staff
            staff_list_res = client.get(
                "/api/v1/farmers/me/staff",
                headers=auth_header(farmer1_user),
            )
            assert staff_list_res.status_code == 200
            staff_list = staff_list_res.json()
            assert len(staff_list) == 1
            assert staff_list[0]["email"] == staff_email

            # 9. Facility staff_count reflected in facilities list
            fac_refresh = client.get(
                "/api/v1/farmers/me/facilities",
                headers=auth_header(farmer1_user),
            )
            assert fac_refresh.status_code == 200
            assert fac_refresh.json()[0]["staff_count"] == 1

            # 10. Farmer 1 removes staff from facility
            del_staff = client.delete(
                f"/api/v1/farmers/me/facilities/{facility_id}/staff/{staff_user_id}",
                headers=auth_header(farmer1_user),
            )
            assert del_staff.status_code == 204

            # Verify staff list is now empty
            staff_after = client.get(
                "/api/v1/farmers/me/staff",
                headers=auth_header(farmer1_user),
            )
            assert len(staff_after.json()) == 0

        finally:
            # Full test cleanup
            async with factory() as session:
                for hub_id in created_hub_ids:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id == hub_id))
                    await session.execute(delete(Hub).where(Hub.id == hub_id))
                for uid in created_user_ids:
                    await session.execute(delete(Farmer).where(Farmer.user_id == uid))
                    await session.execute(delete(HubStaff).where(HubStaff.user_id == uid))
                    await session.execute(delete(User).where(User.id == uid))
                await session.commit()
            await engine.dispose()

    return asyncio.run(run_test())


def test_farmer_order_dual_fulfillment_workflows():
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                consumer_user = User(
                    email=f"consumer-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                )
                farmer_user = User(
                    email=f"farmer-fulfillment-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                )
                other_farmer_user = User(
                    email=f"other-farmer-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                )
                staff_user = User(
                    email=f"staff-fulfillment-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.HUB_STAFF,
                )
                session.add_all([consumer_user, farmer_user, other_farmer_user, staff_user])
                await session.flush()
                created_user_ids.extend([consumer_user.id, farmer_user.id, other_farmer_user.id, staff_user.id])

                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Consumer Joe",
                    pin_code="751001",
                    city="Bhubaneswar",
                )
                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Organic Farmer",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pin_code="751001",
                )
                other_farmer_profile = Farmer(
                    user_id=other_farmer_user.id,
                    name="Other Farmer",
                    location=WKTElement("POINT(85.80 20.28)", srid=4326),
                    pin_code="751002",
                )
                session.add_all([consumer_profile, farmer_profile, other_farmer_profile])
                await session.flush()

                # Facility owned by farmer
                facility = Hub(
                    farmer_id=farmer_profile.id,
                    name="Organic Farmer Hub Facility",
                    address="Village North, Farm Sector 1",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pincode="751001",
                    service_radius_km=Decimal("12.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(facility)
                await session.flush()
                created_hub_ids.append(facility.id)

                empty_facility = Hub(
                    farmer_id=farmer_profile.id,
                    name="Empty Staff Hub Facility",
                    address="Village South, Farm Sector 2",
                    location=WKTElement("POINT(85.83 20.30)", srid=4326),
                    pincode="751002",
                    service_radius_km=Decimal("10.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(empty_facility)
                await session.flush()
                created_hub_ids.append(empty_facility.id)

                # Third facility B with its own dedicated staff
                facility_b = Hub(
                    farmer_id=farmer_profile.id,
                    name="Facility B",
                    address="Village East, Farm Sector 3",
                    location=WKTElement("POINT(85.84 20.31)", srid=4326),
                    pincode="751003",
                    service_radius_km=Decimal("10.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(facility_b)
                await session.flush()
                created_hub_ids.append(facility_b.id)

                staff_user_b = User(
                    email=f"staff_b_{uuid4().hex[:8]}@example.com",
                    hashed_password=hash_password("StaffPass123!"),
                    role=UserRole.HUB_STAFF,
                    is_active=True,
                )
                session.add(staff_user_b)
                await session.flush()
                created_user_ids.append(staff_user_b.id)

                hub_staff_b = HubStaff(user_id=staff_user_b.id, hub_id=facility_b.id)
                session.add(hub_staff_b)

                hub_staff = HubStaff(user_id=staff_user.id, hub_id=facility.id)
                crop = Crop(name=f"Fulfillment Crop {uuid4()}", category="Vegetables")
                session.add_all([hub_staff, crop])
                await session.flush()
                created_crop_ids.append(crop.id)

                listing = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal("100"),
                    minimum_order_quantity=Decimal("1"),
                    unit="kg",
                    asking_price=Decimal("50.00"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                # Order 1 (Option A: Send to Staff)
                order1 = Order(
                    consumer_id=consumer_profile.id,
                    status=OrderStatus.PENDING,
                    subtotal=Decimal("100.00"),
                    delivery_fee=Decimal("0.00"),
                    platform_fee=Decimal("0.00"),
                    total_amount=Decimal("100.00"),
                    delivery_address="Plot 42, Green Avenue, Bhubaneswar",
                    delivery_latitude=Decimal("20.291200"),
                    delivery_longitude=Decimal("85.823400"),
                    promised_window_start=datetime.now(timezone.utc),
                    promised_window_end=datetime.now(timezone.utc) + timedelta(minutes=60),
                )
                session.add(order1)
                await session.flush()
                created_order_ids.append(order1.id)

                item1 = OrderItem(
                    order_id=order1.id,
                    listing_id=listing.id,
                    quantity=Decimal("2.000"),
                    unit_price=Decimal("50.00"),
                    subtotal=Decimal("100.00"),
                )
                session.add(item1)

                # Order 2 (Option B: Handle Personally -> Ready for Pickup)
                order2 = Order(
                    consumer_id=consumer_profile.id,
                    status=OrderStatus.PENDING,
                    subtotal=Decimal("150.00"),
                    delivery_fee=Decimal("0.00"),
                    platform_fee=Decimal("0.00"),
                    total_amount=Decimal("150.00"),
                    delivery_address="Plot 55, Lake View Road, Bhubaneswar",
                    delivery_latitude=Decimal("20.291200"),
                    delivery_longitude=Decimal("85.823400"),
                    promised_window_start=datetime.now(timezone.utc),
                    promised_window_end=datetime.now(timezone.utc) + timedelta(minutes=60),
                )
                session.add(order2)
                await session.flush()
                created_order_ids.append(order2.id)

                item2 = OrderItem(
                    order_id=order2.id,
                    listing_id=listing.id,
                    quantity=Decimal("3.000"),
                    unit_price=Decimal("50.00"),
                    subtotal=Decimal("150.00"),
                )
                session.add(item2)
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # Test 1: Option A - Farmer assigns order 1 to their hub facility
            assign_res = client.post(
                f"/api/v1/farmers/me/orders/{order1.id}/assign-staff",
                json={"facility_id": str(facility.id), "staff_user_id": str(staff_user.id)},
                headers=auth_header(farmer_user),
            )
            assert assign_res.status_code == 200, assign_res.text
            o1_data = assign_res.json()
            assert o1_data["status"] == "PROCESSING"

            # Test 1a-isolation: Verify staff in Hub A receives notification, but staff in Hub B does not
            async with factory() as session:
                notifs_a = (await session.scalars(select(Notification).where(Notification.user_id == staff_user.id))).all()
                notifs_b = (await session.scalars(select(Notification).where(Notification.user_id == staff_user_b.id))).all()
                assert len(notifs_a) >= 1
                assert len(notifs_b) == 0

            # Test 1b: Duplicate assignment is rejected
            dup_assign_res = client.post(
                f"/api/v1/farmers/me/orders/{order1.id}/assign-staff",
                json={"facility_id": str(facility.id)},
                headers=auth_header(farmer_user),
            )
            assert dup_assign_res.status_code == 409
            assert "already been sent to a hub" in dup_assign_res.text

            # Test 1c: Hub with no staff is rejected
            empty_staff_res = client.post(
                f"/api/v1/farmers/me/orders/{order2.id}/assign-staff",
                json={"facility_id": str(empty_facility.id)},
                headers=auth_header(farmer_user),
            )
            assert empty_staff_res.status_code == 409
            assert "no eligible active staff" in empty_staff_res.text

            # Test 2: Other farmer cannot assign items they don't own
            forbidden_res = client.post(
                f"/api/v1/farmers/me/orders/{order1.id}/assign-staff",
                json={"facility_id": str(facility.id)},
                headers=auth_header(other_farmer_user),
            )
            assert forbidden_res.status_code in (403, 404)

            # Test 3: Option B - Farmer handles order 2 personally on-farm
            prep_res = client.post(
                f"/api/v1/farmers/me/orders/{order2.id}/prepare-personally",
                json={"notes": "Packing in organic eco crates at farm"},
                headers=auth_header(farmer_user),
            )
            assert prep_res.status_code == 200, prep_res.text
            o2_data = prep_res.json()
            assert o2_data["status"] == "PROCESSING"

            # Test 4: Option B (Ready) - Farmer marks order 2 ready for rider pickup
            ready_res = client.post(
                f"/api/v1/farmers/me/orders/{order2.id}/ready-for-pickup",
                headers=auth_header(farmer_user),
            )
            assert ready_res.status_code == 200, ready_res.text
            o2_ready_data = ready_res.json()
            assert o2_ready_data["status"] in ("PROCESSING", "CONFIRMED", "SHIPPED")

            # Verify shipment was created and is in READY_FOR_PICKUP state
            async with factory() as session:
                shipment_row = await session.scalar(
                    select(Shipment).where(Shipment.order_id == order2.id)
                )
                assert shipment_row is not None
                assert shipment_row.status == ShipmentStatus.READY_FOR_PICKUP

            # Test 5: Farmer Self-Delivery - Deliver order 2 directly without requiring a rider
            deliver_res = client.post(
                f"/api/v1/farmers/me/orders/{order2.id}/deliver",
                json={"notes": "Delivered directly by farmer in person"},
                headers=auth_header(farmer_user),
            )
            assert deliver_res.status_code == 200, deliver_res.text
            o2_deliv_data = deliver_res.json()
            assert o2_deliv_data["status"] == "DELIVERED"

            # Verify shipment and order both reached DELIVERED in the database
            async with factory() as session:
                delivered_order = await session.scalar(
                    select(Order).where(Order.id == order2.id)
                )
                assert delivered_order.status == OrderStatus.DELIVERED

                delivered_shipment = await session.scalar(
                    select(Shipment).where(Shipment.order_id == order2.id)
                )
                assert delivered_shipment.status == ShipmentStatus.DELIVERED
                assert delivered_shipment.delivered_at is not None

            # Test 6: Duplicate delivery attempt is rejected with 409 Conflict
            dup_deliv_res = client.post(
                f"/api/v1/farmers/me/orders/{order2.id}/deliver",
                json={},
                headers=auth_header(farmer_user),
            )
            assert dup_deliv_res.status_code == 409
            assert "already been delivered" in dup_deliv_res.text

            # Test 7: Another farmer cannot deliver order they do not own
            other_farmer_deliv = client.post(
                f"/api/v1/farmers/me/orders/{order2.id}/deliver",
                json={},
                headers=auth_header(other_farmer_user),
            )
            assert other_farmer_deliv.status_code in (403, 404)

        finally:
            # Full cleanup
            async with factory() as session:
                for oid in created_order_ids:
                    await session.execute(delete(Shipment).where(Shipment.order_id == oid))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id == oid))
                    await session.execute(delete(Order).where(Order.id == oid))
                for hid in created_hub_ids:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id == hid))
                    await session.execute(delete(Hub).where(Hub.id == hid))
                await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                    select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                )))
                await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                    select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                )))
                for cid in created_crop_ids:
                    await session.execute(delete(CropListing).where(CropListing.crop_id == cid))
                    await session.execute(delete(Crop).where(Crop.id == cid))
                for uid in created_user_ids:
                    await session.execute(delete(Consumer).where(Consumer.user_id == uid))
                    await session.execute(delete(Farmer).where(Farmer.user_id == uid))
                    await session.execute(delete(HubStaff).where(HubStaff.user_id == uid))
                    await session.execute(delete(User).where(User.id == uid))
                await session.commit()
            await engine.dispose()

    return asyncio.run(run_test())



def test_automatic_hub_transfer_and_fulfillment_workflow():
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                consumer_user = User(
                    email=f"consumer-wf-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                )
                farmer_user = User(
                    email=f"farmer-wf-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                )
                farmer_no_hub_user = User(
                    email=f"farmer-nohub-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                )
                staff_user = User(
                    email=f"staff-wf-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.HUB_STAFF,
                )
                session.add_all([consumer_user, farmer_user, farmer_no_hub_user, staff_user])
                await session.flush()
                created_user_ids.extend([consumer_user.id, farmer_user.id, farmer_no_hub_user.id, staff_user.id])

                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Test Consumer AutoWF",
                    address="Sector 9, Plot 100, City",
                    city="Bhubaneswar",
                    pin_code="751001",
                )
                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Farmer Auto Hub",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pin_code="751001",
                )
                farmer_no_hub_profile = Farmer(
                    user_id=farmer_no_hub_user.id,
                    name="Farmer Without Hub",
                    location=WKTElement("POINT(85.80 20.28)", srid=4326),
                    pin_code="751002",
                )
                session.add_all([consumer_profile, farmer_profile, farmer_no_hub_profile])
                await session.flush()

                # Farmer's existing hub
                farmer_hub = Hub(
                    farmer_id=farmer_profile.id,
                    name="Farmer Organic Fast Hub",
                    address="Plot 5, Kisan Logistics Zone, Bhubaneswar",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pincode="751001",
                    service_radius_km=Decimal("15.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(farmer_hub)
                await session.flush()
                created_hub_ids.append(farmer_hub.id)

                # Staff assigned to farmer's hub
                hub_staff_assignment = HubStaff(user_id=staff_user.id, hub_id=farmer_hub.id)
                session.add(hub_staff_assignment)

                # Crops & Listings
                crop = Crop(name=f"Workflow Tomato {uuid4().hex[:6]}", category="Vegetables")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                crop_nohub = Crop(name=f"NoHub Wheat {uuid4().hex[:6]}", category="Grains")
                session.add(crop_nohub)
                await session.flush()
                created_crop_ids.append(crop_nohub.id)

                listing = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal("200"),
                    unit="kg",
                    asking_price=Decimal("40.00"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                listing_nohub = CropListing(
                    crop_id=crop_nohub.id,
                    farmer_id=farmer_no_hub_profile.id,
                    quantity=Decimal("100"),
                    unit="kg",
                    asking_price=Decimal("30.00"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add_all([listing, listing_nohub])
                await session.flush()

                # Order A: for Workflow A (Accept -> Prepare -> Deliver directly)
                order_a = Order(
                    consumer_id=consumer_profile.id,
                    status=OrderStatus.PENDING,
                    subtotal=Decimal("80.00"),
                    total_amount=Decimal("80.00"),
                    delivery_address="Sector 9, Plot 100, City, Bhubaneswar, PIN 751001",
                    promised_window_start=datetime.now(timezone.utc),
                    promised_window_end=datetime.now(timezone.utc) + timedelta(minutes=60),
                )
                # Order B: for Workflow B (Send to My Hub -> Staff Accepts -> Staff Packs -> Rider Pickup)
                order_b = Order(
                    consumer_id=consumer_profile.id,
                    status=OrderStatus.PENDING,
                    subtotal=Decimal("120.00"),
                    total_amount=Decimal("120.00"),
                    delivery_address="Sector 9, Plot 100, City, Bhubaneswar, PIN 751001",
                    promised_window_start=datetime.now(timezone.utc),
                    promised_window_end=datetime.now(timezone.utc) + timedelta(minutes=60),
                )
                # Order C: placed with farmer who has NO hub
                order_c = Order(
                    consumer_id=consumer_profile.id,
                    status=OrderStatus.PENDING,
                    subtotal=Decimal("60.00"),
                    total_amount=Decimal("60.00"),
                    delivery_address="Sector 9, Plot 100, City, Bhubaneswar, PIN 751001",
                    promised_window_start=datetime.now(timezone.utc),
                    promised_window_end=datetime.now(timezone.utc) + timedelta(minutes=60),
                )
                session.add_all([order_a, order_b, order_c])
                await session.flush()
                created_order_ids.extend([order_a.id, order_b.id, order_c.id])

                item_a = OrderItem(order_id=order_a.id, listing_id=listing.id, quantity=Decimal("2.0"), unit_price=Decimal("40.00"), subtotal=Decimal("80.00"))
                item_b = OrderItem(order_id=order_b.id, listing_id=listing.id, quantity=Decimal("3.0"), unit_price=Decimal("40.00"), subtotal=Decimal("120.00"))
                item_c = OrderItem(order_id=order_c.id, listing_id=listing_nohub.id, quantity=Decimal("2.0"), unit_price=Decimal("30.00"), subtotal=Decimal("60.00"))
                session.add_all([item_a, item_b, item_c])
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # ------------------------------------------------------------------
            # Condition 5 Tests: Error handling & validation
            # ------------------------------------------------------------------
            # 1. Farmer with NO hub tries to send order to hub -> Clear error message
            no_hub_res = client.post(
                f"/api/v1/farmers/me/orders/{order_c.id}/send-to-hub",
                headers=auth_header(farmer_no_hub_user),
            )
            assert no_hub_res.status_code == 409, no_hub_res.text
            assert "No active Kisan Hub found for your farm" in no_hub_res.text

            # 2. Unauthorized farmer cannot send another farmer's order
            unauth_res = client.post(
                f"/api/v1/farmers/me/orders/{order_b.id}/send-to-hub",
                headers=auth_header(farmer_no_hub_user),
            )
            assert unauth_res.status_code in (403, 404)

            # ------------------------------------------------------------------
            # Workflow A: Farmer Accepts -> Farmer Prepares -> Direct Delivery
            # ------------------------------------------------------------------
            accept_res = client.post(
                f"/api/v1/farmers/me/orders/{order_a.id}/prepare-personally",
                headers=auth_header(farmer_user),
            )
            assert accept_res.status_code == 200, accept_res.text
            order_a_data = accept_res.json()
            assert order_a_data["status"] == "PROCESSING"

            # Farmer marks delivered directly
            deliver_res = client.post(
                f"/api/v1/farmers/me/orders/{order_a.id}/deliver",
                json={"notes": "Delivered in person by farmer directly to doorstep"},
                headers=auth_header(farmer_user),
            )
            assert deliver_res.status_code == 200, deliver_res.text
            assert deliver_res.json()["status"] == "DELIVERED"

            # ------------------------------------------------------------------
            # Workflow B: Send to My Hub (Automatic) -> Hub Staff Dashboard ->
            #             Staff Accepts & Packs -> Ready for Pickup -> Synchronized
            # ------------------------------------------------------------------
            # Step 1: Farmer clicks Send to My Hub (no facility_id required)
            send_hub_res = client.post(
                f"/api/v1/farmers/me/orders/{order_b.id}/send-to-hub",
                headers=auth_header(farmer_user),
            )
            assert send_hub_res.status_code == 200, send_hub_res.text
            order_b_data = send_hub_res.json()
            assert order_b_data["hub_name"] == "Farmer Organic Fast Hub"
            assert order_b_data["status"] == "PROCESSING"

            # Duplicate transfer must be rejected (Condition 5: prevent duplicate transfers)
            dup_transfer_res = client.post(
                f"/api/v1/farmers/me/orders/{order_b.id}/send-to-hub",
                headers=auth_header(farmer_user),
            )
            assert dup_transfer_res.status_code == 409
            assert "already been sent to a hub" in dup_transfer_res.text

            # Step 2: Hub Staff logs in and views overview
            staff_login = client.post(
                "/api/v1/auth/login",
                json={"email": staff_user.email, "password": "Password123!"},
            )
            assert staff_login.status_code == 200
            staff_token = staff_login.json()["access_token"]
            staff_headers = {"Authorization": f"Bearer {staff_token}"}

            overview_res = client.get(
                f"/api/v1/hub-operations/hub-staff/hubs/{farmer_hub.id}/overview",
                headers=staff_headers,
            )
            assert overview_res.status_code == 200, overview_res.text
            overview_data = overview_res.json()
            to_pack_ids = [o["id"] for o in overview_data["orders_to_pack"]]
            assert str(order_b.id) in to_pack_ids

            # Step 3: Staff reviews and accepts the order (start-packing)
            pack_res = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{farmer_hub.id}/orders/{order_b.id}/start-packing",
                headers=staff_headers,
            )
            assert pack_res.status_code == 201, pack_res.text
            shipment_data = pack_res.json()
            assert shipment_data["status"] == "PACKING"
            shipment_id = shipment_data["id"]

            # Step 4: Staff completes packaging and marks ready for rider pickup
            ready_res = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{farmer_hub.id}/shipments/{shipment_id}/ready",
                headers=staff_headers,
            )
            assert ready_res.status_code == 200, ready_res.text
            ready_data = ready_res.json()
            assert ready_data["status"] == "READY_FOR_PICKUP"

            # Step 5: Notifications & Tracking verification
            async with factory() as session:
                staff_notifs = (await session.scalars(select(Notification).where(Notification.user_id == staff_user.id))).all()
                assert any("New Order Task Assigned" in n.title for n in staff_notifs)

                farmer_notifs = (await session.scalars(select(Notification).where(Notification.user_id == farmer_user.id))).all()
                assert any("Order Transferred to Hub" in n.title for n in farmer_notifs)

                consumer_notifs = (await session.scalars(select(Notification).where(Notification.user_id == consumer_user.id))).all()
                assert any("Order Routing Update" in n.title for n in consumer_notifs)

                events = (await session.scalars(select(OrderEvent).where(OrderEvent.order_id == order_b.id))).all()
                assert len(events) >= 2

        finally:
            async with factory() as session:
                for oid in created_order_ids:
                    await session.execute(delete(Shipment).where(Shipment.order_id == oid))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id == oid))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id == oid))
                    await session.execute(delete(Order).where(Order.id == oid))
                for hid in created_hub_ids:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id == hid))
                    await session.execute(delete(Hub).where(Hub.id == hid))
                await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                    select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                )))
                await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                    select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                )))
                for cid in created_crop_ids:
                    await session.execute(delete(CropListing).where(CropListing.crop_id == cid))
                    await session.execute(delete(Crop).where(Crop.id == cid))
                for uid in created_user_ids:
                    await session.execute(delete(Notification).where(Notification.user_id == uid))
                    await session.execute(delete(Consumer).where(Consumer.user_id == uid))
                    await session.execute(delete(Farmer).where(Farmer.user_id == uid))
                    await session.execute(delete(HubStaff).where(HubStaff.user_id == uid))
                    await session.execute(delete(User).where(User.id == uid))
                await session.commit()
            await engine.dispose()

    return asyncio.run(run_test())


def test_prevent_automatic_hub_transfer_workflow():
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            # 1. Setup farmer with active hub and assigned hub staff
            async with factory() as session:
                farmer_user = User(
                    email=f"farmer-hubtest-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-hubtest-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                staff_user = User(
                    email=f"staff-hubtest-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.HUB_STAFF,
                    is_active=True,
                )
                session.add_all([farmer_user, consumer_user, staff_user])
                await session.flush()
                created_user_ids.extend([farmer_user.id, consumer_user.id, staff_user.id])

                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Ramesh Farm Owner",
                    phone="9988776655",
                    location=WKTElement("POINT(85.8245 20.2961)", srid=4326),
                )
                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Anita Customer",
                    phone="9123456780",
                    address="Plot 55, Saheed Nagar, Bhubaneswar",
                )
                session.add_all([farmer_profile, consumer_profile])
                await session.flush()

                hub = Hub(
                    name="Kisan Fresh Hub",
                    address="Plot 12, Agro Zone, Bhubaneswar",
                    pincode="751007",
                    location=WKTElement("POINT(85.8250 20.2965)", srid=4326),
                    service_radius_km=Decimal("15.0"),
                    status=HubStatus.ACTIVE,
                    farmer_id=farmer_profile.id,
                )
                session.add(hub)
                await session.flush()
                created_hub_ids.append(hub.id)

                hub_staff = HubStaff(user_id=staff_user.id, hub_id=hub.id)
                session.add(hub_staff)

                crop = Crop(name=f"Organic Spinach {uuid4().hex[:6]}", category="Vegetables")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                listing = CropListing(
                    farmer_id=farmer_profile.id,
                    crop_id=crop.id,
                    quantity=Decimal("100.0"),
                    asking_price=Decimal("40.00"),
                    unit="kg",
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                hub_stock = HubStock(
                    hub_id=hub.id,
                    listing_id=listing.id,
                    available_quantity=Decimal("100.0"),
                )
                session.add(hub_stock)

                # Consumer cart with 2kg of spinach
                cart = Cart(consumer_id=consumer_profile.id)
                session.add(cart)
                await session.flush()
                cart_item = CartItem(
                    cart_id=cart.id,
                    listing_id=listing.id,
                    quantity=Decimal("2.0"),
                )
                session.add(cart_item)
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # Step 1: Customer places order via checkout
            checkout_res = client.post(
                "/api/v1/orders",
                json={
                    "hub_id": str(hub.id),
                    "delivery_slot_id": None,
                    "latitude": 20.2980,
                    "longitude": 85.8300,
                    "address": "Plot 55, Saheed Nagar, Bhubaneswar, 751007",
                },
                headers=auth_header(consumer_user),
            )
            assert checkout_res.status_code == 201, checkout_res.text
            order_data = checkout_res.json()
            order_id = order_data["id"]
            created_order_ids.append(order_id)

            # Verification 1: Order status is PENDING and hub_id is None
            assert order_data["status"] == "PENDING"
            assert order_data.get("hub_id") is None

            async with factory() as session:
                db_order = await session.scalar(select(Order).where(Order.id == order_id))
                assert db_order.status == OrderStatus.PENDING
                assert db_order.hub_id is None  # CRITICAL: No automatic hub assignment!

                # Verification 2: Hub staff was NOT notified of picking
                staff_notifs = (await session.scalars(
                    select(Notification).where(Notification.user_id == staff_user.id)
                )).all()
                assert len(staff_notifs) == 0  # No picking notification sent to hub staff

            # Verification 3: Hub Staff dashboard does NOT show this order in orders_to_pack
            staff_login = client.post(
                "/api/v1/auth/login",
                json={"email": staff_user.email, "password": "Password123!"},
            )
            assert staff_login.status_code == 200
            staff_token = staff_login.json()["access_token"]
            staff_headers = {"Authorization": f"Bearer {staff_token}"}

            overview_res = client.get(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/overview",
                headers=staff_headers,
            )
            assert overview_res.status_code == 200
            to_pack_ids = [o["id"] for o in overview_res.json()["orders_to_pack"]]
            assert str(order_id) not in to_pack_ids

            # Verification 4: Farmer incoming order list displays order with hub_name = None (two actions available)
            farmer_orders_res = client.get(
                "/api/v1/farmers/dashboard/orders",
                headers=auth_header(farmer_user),
            )
            assert farmer_orders_res.status_code == 200
            farmer_orders = farmer_orders_res.json()
            matching_farmer_order = next((o for o in farmer_orders if o["id"] == order_id), None)
            assert matching_farmer_order is not None
            assert matching_farmer_order["status"] == "PENDING"
            assert matching_farmer_order["hub_name"] is None

            # Verification 5: Farmer explicitly clicks "Send to My Hub"
            send_res = client.post(
                f"/api/v1/farmers/me/orders/{order_id}/send-to-hub",
                headers=auth_header(farmer_user),
            )
            assert send_res.status_code == 200, send_res.text
            transferred_order = send_res.json()
            assert transferred_order["status"] == "PROCESSING"
            assert transferred_order["hub_name"] == "Kisan Fresh Hub"

            # Check DB: Now order.hub_id is populated
            async with factory() as session:
                db_order_after = await session.scalar(select(Order).where(Order.id == order_id))
                assert db_order_after.hub_id == hub.id

                # Staff has now received notification
                staff_notifs_after = (await session.scalars(
                    select(Notification).where(Notification.user_id == staff_user.id)
                )).all()
                assert any("New Order Task Assigned" in n.title for n in staff_notifs_after)

            # Hub Staff overview now contains the order
            overview_after = client.get(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/overview",
                headers=staff_headers,
            )
            assert overview_after.status_code == 200
            to_pack_ids_after = [o["id"] for o in overview_after.json()["orders_to_pack"]]
            assert str(order_id) in to_pack_ids_after

            # Verification 6: Duplicate transfer is blocked
            dup_res = client.post(
                f"/api/v1/farmers/me/orders/{order_id}/send-to-hub",
                headers=auth_header(farmer_user),
            )
            assert dup_res.status_code == 409
            assert "already been sent to a hub" in dup_res.text

        finally:
            async with factory() as session:
                for oid in created_order_ids:
                    await session.execute(delete(StockReservation).where(StockReservation.order_id == oid))
                    await session.execute(delete(Shipment).where(Shipment.order_id == oid))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id == oid))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id == oid))
                    await session.execute(delete(Order).where(Order.id == oid))
                for hid in created_hub_ids:
                    await session.execute(delete(StockReservation).where(StockReservation.hub_stock_id.in_(
                        select(HubStock.id).where(HubStock.hub_id == hid)
                    )))
                    await session.execute(delete(HubStock).where(HubStock.hub_id == hid))
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id == hid))
                    await session.execute(delete(Hub).where(Hub.id == hid))
                await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                    select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                )))
                await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                    select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                )))
                for cid in created_crop_ids:
                    await session.execute(delete(CropListing).where(CropListing.crop_id == cid))
                    await session.execute(delete(Crop).where(Crop.id == cid))
                for uid in created_user_ids:
                    await session.execute(delete(Notification).where(Notification.user_id == uid))
                    await session.execute(delete(Consumer).where(Consumer.user_id == uid))
                    await session.execute(delete(Farmer).where(Farmer.user_id == uid))
                    await session.execute(delete(HubStaff).where(HubStaff.user_id == uid))
                    await session.execute(delete(User).where(User.id == uid))
                await session.commit()
            await engine.dispose()

    return asyncio.run(run_test())



def test_farmer_delete_old_order_from_history():
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                farmer_user = User(
                    email=f"farmer-del-{uuid4()}@example.com",
                    hashed_password=hash_password("Pass123!"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-del-{uuid4()}@example.com",
                    hashed_password=hash_password("Pass123!"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                session.add_all([farmer_user, consumer_user])
                await session.flush()
                created_user_ids.extend([farmer_user.id, consumer_user.id])

                farmer = Farmer(
                    user_id=farmer_user.id,
                    name="Farmer History Test",
                    location=WKTElement("POINT(85.8245 20.2961)", srid=4326),
                )
                consumer = Consumer(
                    user_id=consumer_user.id,
                    name="Consumer History Test",
                )
                session.add_all([farmer, consumer])
                await session.flush()

                crop = Crop(name=f"Crop-History-{uuid4()}", category="Vegetables")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                listing = CropListing(
                    farmer_id=farmer.id,
                    crop_id=crop.id,
                    quantity=Decimal("100.00"),
                    unit="kg",
                    asking_price=Decimal("40.00"),
                    minimum_order_quantity=Decimal("1.00"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                # Order 1: Active (PENDING)
                order1 = Order(
                    consumer_id=consumer.id,
                    status=OrderStatus.PENDING,
                    subtotal=Decimal("80.00"),
                    delivery_fee=Decimal("0.00"),
                    platform_fee=Decimal("0.00"),
                    total_amount=Decimal("80.00"),
                    delivery_address="Road 1, Bhubaneswar",
                )
                session.add(order1)
                await session.flush()
                created_order_ids.append(order1.id)
                session.add(OrderItem(
                    order_id=order1.id,
                    listing_id=listing.id,
                    quantity=Decimal("2.000"),
                    unit_price=Decimal("40.00"),
                    subtotal=Decimal("80.00"),
                ))

                # Order 2: Completed / Old (DELIVERED)
                order2 = Order(
                    consumer_id=consumer.id,
                    status=OrderStatus.DELIVERED,
                    subtotal=Decimal("120.00"),
                    delivery_fee=Decimal("0.00"),
                    platform_fee=Decimal("0.00"),
                    total_amount=Decimal("120.00"),
                    delivery_address="Road 2, Bhubaneswar",
                )
                session.add(order2)
                await session.flush()
                created_order_ids.append(order2.id)
                session.add(OrderItem(
                    order_id=order2.id,
                    listing_id=listing.id,
                    quantity=Decimal("3.000"),
                    unit_price=Decimal("40.00"),
                    subtotal=Decimal("120.00"),
                ))
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # 1. Farmer attempts to delete active order1 -> should fail with 400
            del_active_res = client.delete(
                f"/api/v1/farmers/me/orders/{order1.id}",
                headers=auth_header(farmer_user),
            )
            assert del_active_res.status_code == 400
            assert "Cannot remove active" in del_active_res.text

            # 2. Both orders still appear in dashboard
            list_res1 = client.get(
                "/api/v1/farmers/dashboard/orders",
                headers=auth_header(farmer_user),
            )
            assert list_res1.status_code == 200
            listed_ids = [o["id"] for o in list_res1.json()]
            assert str(order1.id) in listed_ids
            assert str(order2.id) in listed_ids

            # 3. Farmer deletes completed order2 -> should succeed with 200
            del_delivered_res = client.delete(
                f"/api/v1/farmers/me/orders/{order2.id}",
                headers=auth_header(farmer_user),
            )
            assert del_delivered_res.status_code == 200
            assert del_delivered_res.json()["status"] == "success"

            # 4. Order 2 is hidden from farmer's dashboard list
            list_res2 = client.get(
                "/api/v1/farmers/dashboard/orders",
                headers=auth_header(farmer_user),
            )
            assert list_res2.status_code == 200
            updated_ids = [o["id"] for o in list_res2.json()]
            assert str(order1.id) in updated_ids
            assert str(order2.id) not in updated_ids

            # 5. Order 2 STILL EXISTS in DB and for Consumer
            async with factory() as session:
                db_order2 = await session.get(Order, order2.id)
                assert db_order2 is not None
                assert db_order2.status is OrderStatus.DELIVERED
                assert db_order2.total_amount == Decimal("120.00")

                # Verify farmer hidden orders table has the record
                hidden_record = await session.scalar(
                    select(FarmerHiddenOrder).where(
                        FarmerHiddenOrder.farmer_id == farmer.id,
                        FarmerHiddenOrder.order_id == order2.id,
                    )
                )
                assert hidden_record is not None

        finally:
            async with factory() as session:
                for oid in created_order_ids:
                    await session.execute(delete(FarmerHiddenOrder).where(FarmerHiddenOrder.order_id == oid))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id == oid))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id == oid))
                    await session.execute(delete(Order).where(Order.id == oid))
                for cid in created_crop_ids:
                    await session.execute(delete(CropListing).where(CropListing.crop_id == cid))
                    await session.execute(delete(Crop).where(Crop.id == cid))
                for uid in created_user_ids:
                    await session.execute(delete(Consumer).where(Consumer.user_id == uid))
                    await session.execute(delete(Farmer).where(Farmer.user_id == uid))
                    await session.execute(delete(User).where(User.id == uid))
                await session.commit()
            await engine.dispose()

    return asyncio.run(run_test())
