import asyncio
import sys
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

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
    Hub,
    HubStaff,
    HubStatus,
    HubStock,
    HubStockDelivery,
    Notification,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Rider,
    RiderApprovalStatus,
    RiderAvailability,
    RiderOffer,
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


def test_case_1_farmer_has_no_hub_personal_delivery_and_rider_pickup():
    """Case 1: Farmer has no hub in the database.
    Order placement, Personal Delivery, and Send to Rider must all work cleanly."""
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                farmer_user = User(
                    email=f"farmer-nohub-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-nohub-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                rider_user = User(
                    email=f"rider-nohub-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.RIDER,
                    is_active=True,
                )
                session.add_all([farmer_user, consumer_user, rider_user])
                await session.flush()
                created_user_ids.extend([farmer_user.id, consumer_user.id, rider_user.id])

                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Farm Owner Ramesh",
                    phone="9988776655",
                    address_line="Ramesh Mango Orchard, Khordha",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                )
                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Customer Suman",
                    phone="9123456780",
                    address_line="Flat 402, Green Enclave, Bhubaneswar",
                )
                rider_profile = Rider(
                    user_id=rider_user.id,
                    display_name="Rider Bikash",
                    vehicle_type="BIKE",
                    availability=RiderAvailability.AVAILABLE,
                    approval_status=RiderApprovalStatus.APPROVED,
                )
                session.add_all([farmer_profile, consumer_profile, rider_profile])
                await session.flush()

                crop = Crop(name=f"Fresh Mango {uuid4().hex[:4]}", category="Fruits")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                listing = CropListing(
                    farmer_id=farmer_profile.id,
                    crop_id=crop.id,
                    quantity=Decimal("46.0"),
                    asking_price=Decimal("80.00"),
                    unit="kg",
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                # Consumer cart with 5 kg of Mango
                cart1 = Cart(consumer_id=consumer_profile.id)
                session.add(cart1)
                await session.flush()
                item1 = CartItem(cart_id=cart1.id, listing_id=listing.id, quantity=Decimal("5.0"))
                session.add(item1)
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # Order 1: Personal Delivery flow
            checkout_res1 = client.post(
                "/api/v1/orders",
                json={
                    "latitude": 20.29,
                    "longitude": 85.82,
                    "address": "Flat 402, Green Enclave, Bhubaneswar",
                },
                headers=auth_header(consumer_user),
            )
            assert checkout_res1.status_code == 201, checkout_res1.text
            o1_id = checkout_res1.json()["id"]
            created_order_ids.append(o1_id)

            # Farmer accepts order for on-farm packing
            accept_res1 = client.post(
                f"/api/v1/farmers/me/orders/{o1_id}/prepare-personally",
                json={"notes": "Packing fresh mangoes from tree"},
                headers=auth_header(farmer_user),
            )
            assert accept_res1.status_code == 200, accept_res1.text
            assert accept_res1.json()["status"] == "PROCESSING"

            # Farmer completes Personal Delivery directly
            deliver_res1 = client.post(
                f"/api/v1/farmers/me/orders/{o1_id}/deliver",
                json={"notes": "Handed directly to customer at doorstep"},
                headers=auth_header(farmer_user),
            )
            assert deliver_res1.status_code == 200, deliver_res1.text
            assert deliver_res1.json()["status"] == "DELIVERED"

            # Order 2: Send to Rider flow without a hub
            async with factory() as session:
                cart2 = await session.scalar(select(Cart).where(Cart.consumer_id == consumer_profile.id))
                if cart2 is None:
                    cart2 = Cart(consumer_id=consumer_profile.id)
                    session.add(cart2)
                    await session.flush()
                item2 = CartItem(cart_id=cart2.id, listing_id=listing.id, quantity=Decimal("3.0"))
                session.add(item2)
                await session.commit()

            checkout_res2 = client.post(
                "/api/v1/orders",
                json={
                    "latitude": 20.29,
                    "longitude": 85.82,
                    "address": "Flat 402, Green Enclave, Bhubaneswar",
                },
                headers=auth_header(consumer_user),
            )
            assert checkout_res2.status_code == 201, checkout_res2.text
            o2_id = checkout_res2.json()["id"]
            created_order_ids.append(o2_id)

            # Farmer accepts order
            accept_res2 = client.post(
                f"/api/v1/farmers/me/orders/{o2_id}/prepare-personally",
                headers=auth_header(farmer_user),
            )
            assert accept_res2.status_code == 200, accept_res2.text

            # Farmer marks order ready for rider pickup
            ready_res2 = client.post(
                f"/api/v1/farmers/me/orders/{o2_id}/ready-for-pickup",
                headers=auth_header(farmer_user),
            )
            assert ready_res2.status_code == 200, ready_res2.text
            assert ready_res2.json()["status"] == "SHIPPED"

            # Verify shipment exists and has hub_id=None
            async with factory() as session:
                shipment2 = await session.scalar(
                    select(Shipment).where(Shipment.order_id == UUID(o2_id))
                )
                assert shipment2 is not None
                assert shipment2.hub_id is None
                assert shipment2.status == ShipmentStatus.READY_FOR_PICKUP

            # A1: Rider receives delivery notification showing Farmer Farm Name
            async with factory() as session:
                rider_notif = await session.scalar(
                    select(Notification).where(
                        Notification.user_id == rider_user.id,
                        Notification.related_entity_type == "rider_offer",
                    ).order_by(Notification.created_at.desc())
                )
                assert rider_notif is not None, "Rider must receive notification when farmer marks ready for pickup"
                assert "Farm Owner Ramesh" in rider_notif.title or "Farm Owner Ramesh" in rider_notif.message

            # A2: Rider polls offers: sees Farmer Farm Name as origin, pickup_type == "FARM"
            poll_res = client.post(
                "/api/v1/rider/offers/poll",
                headers=auth_header(rider_user),
            )
            assert poll_res.status_code == 200, poll_res.text
            offers = poll_res.json()
            assert len(offers) >= 1, "Rider should see active offer"
            matched_offer = next(o for o in offers if o["shipment_id"] == str(shipment2.id))
            assert matched_offer["hub_name"] == "Farm Owner Ramesh"
            assert matched_offer["pickup_type"] == "FARM"

            # A3: Rider accepts offer
            accept_offer_res = client.post(
                f"/api/v1/rider/offers/{matched_offer['id']}/accept",
                headers=auth_header(rider_user),
            )
            assert accept_offer_res.status_code == 200, accept_offer_res.text
            accepted_shipment = accept_offer_res.json()
            assert accepted_shipment["status"] == "RIDER_ASSIGNED"
            assert accepted_shipment["hub_name"] == "Farm Owner Ramesh"
            assert accepted_shipment["pickup_type"] == "FARM"

            # A4: Rider workflow continues to DELIVERED
            pickup_res = client.post(
                f"/api/v1/rider/shipments/{shipment2.id}/status",
                json={"status": "PICKED_UP"},
                headers=auth_header(rider_user),
            )
            assert pickup_res.status_code == 200, pickup_res.text
            assert pickup_res.json()["status"] == "PICKED_UP"

            ofd_res = client.post(
                f"/api/v1/rider/shipments/{shipment2.id}/status",
                json={"status": "OUT_FOR_DELIVERY"},
                headers=auth_header(rider_user),
            )
            assert ofd_res.status_code == 200, ofd_res.text
            assert ofd_res.json()["status"] == "OUT_FOR_DELIVERY"

            # Rider marks arrived
            arrive_res = client.post(
                f"/api/v1/rider/shipments/{shipment2.id}/status",
                json={"status": "ARRIVED"},
                headers=auth_header(rider_user),
            )
            assert arrive_res.status_code == 200, arrive_res.text
            assert arrive_res.json()["status"] == "ARRIVED"

            # Consumer received OTP notification
            notifs_resp = client.get(
                "/api/v1/notifications",
                headers=auth_header(consumer_user),
            )
            assert notifs_resp.status_code == 200, notifs_resp.text
            notifs = notifs_resp.json()["items"]
            otp_notif = next(
                n for n in notifs
                if n.get("related_entity_type") == "shipment_otp" or "verification code is" in n["message"]
            )
            otp_code = otp_notif["message"].rsplit(" ", 1)[-1].rstrip(".")
            assert len(otp_code) == 6 and otp_code.isdigit()

            # Rider submits OTP to complete delivery
            otp_res = client.post(
                f"/api/v1/rider/shipments/{shipment2.id}/otp-verification",
                json={"code": otp_code},
                headers=auth_header(rider_user),
            )
            assert otp_res.status_code == 200, otp_res.text
            assert otp_res.json()["status"] == "DELIVERED"

        finally:
            async with factory() as session:
                order_uuids = [UUID(oid) for oid in created_order_ids]
                if order_uuids:
                    await session.execute(delete(RiderOffer).where(RiderOffer.shipment_id.in_(
                        select(Shipment.id).where(Shipment.order_id.in_(order_uuids))
                    )))
                    await session.execute(delete(Shipment).where(Shipment.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_uuids)))
                    await session.execute(delete(Order).where(Order.id.in_(order_uuids)))
                if created_crop_ids:
                    await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                        select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                    )))
                    await session.execute(delete(CropListing).where(CropListing.crop_id.in_(created_crop_ids)))
                    await session.execute(delete(Crop).where(Crop.id.in_(created_crop_ids)))
                if created_user_ids:
                    await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                        select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                    )))
                    await session.execute(delete(Notification).where(Notification.user_id.in_(created_user_ids)))
                    await session.execute(delete(Consumer).where(Consumer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Farmer).where(Farmer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Rider).where(Rider.user_id.in_(created_user_ids)))
                    await session.execute(delete(User).where(User.id.in_(created_user_ids)))
                await session.commit()
            await engine.dispose()

    asyncio.run(run_test())


def test_case_2_farmer_has_hub_with_empty_storage_and_sends_to_hub():
    """Case 2: Farmer has a hub, but Hub Storage is completely empty (no HubStock rows).
    Customer orders crop.
    Personal Delivery works.
    Send to Rider works.
    Send to My Hub works and staff receives notification without requiring Hub Storage."""
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                farmer_user = User(
                    email=f"farmer-hubempty-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-hubempty-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                staff_user = User(
                    email=f"staff-hubempty-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.HUB_STAFF,
                    is_active=True,
                )
                session.add_all([farmer_user, consumer_user, staff_user])
                await session.flush()
                created_user_ids.extend([farmer_user.id, consumer_user.id, staff_user.id])

                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Farmer Hari",
                    phone="9988776655",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                )
                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Customer Neha",
                    phone="9123456780",
                    address_line="Plot 10, Cuttack Road, Bhubaneswar",
                )
                session.add_all([farmer_profile, consumer_profile])
                await session.flush()

                # Farmer creates a Hub facility
                hub = Hub(
                    farmer_id=farmer_profile.id,
                    name="Hari Agro Logistics Facility",
                    address="Unit 4, Industrial Area, Bhubaneswar",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pincode="751001",
                    service_radius_km=Decimal("10.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(hub)
                await session.flush()
                created_hub_ids.append(hub.id)

                # Assign staff to that hub
                hub_staff = HubStaff(user_id=staff_user.id, hub_id=hub.id)
                session.add(hub_staff)

                crop = Crop(name=f"Fresh Cauliflower {uuid4().hex[:4]}", category="Vegetables")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                # Listing has 100 kg on farm, NO HubStock in hub
                listing = CropListing(
                    farmer_id=farmer_profile.id,
                    crop_id=crop.id,
                    quantity=Decimal("100.0"),
                    asking_price=Decimal("30.00"),
                    unit="kg",
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                cart = Cart(consumer_id=consumer_profile.id)
                session.add(cart)
                await session.flush()
                item = CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("4.0"))
                session.add(item)
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # Customer places order
            checkout_res = client.post(
                "/api/v1/orders",
                json={
                    "latitude": 20.29,
                    "longitude": 85.82,
                    "address": "Plot 10, Cuttack Road, Bhubaneswar",
                },
                headers=auth_header(consumer_user),
            )
            assert checkout_res.status_code == 201, checkout_res.text
            order_id = checkout_res.json()["id"]
            created_order_ids.append(order_id)

            # Farmer chooses "Send to My Hub"
            send_hub_res = client.post(
                f"/api/v1/farmers/me/orders/{order_id}/send-to-hub",
                headers=auth_header(farmer_user),
            )
            assert send_hub_res.status_code == 200, send_hub_res.text
            assert send_hub_res.json()["status"] == "PROCESSING"

            # Verify Hub Staff received the notification
            async with factory() as session:
                notif = await session.scalar(
                    select(Notification).where(
                        Notification.user_id == staff_user.id,
                        Notification.title == "New Order Task Assigned",
                        Notification.related_entity_id == UUID(order_id),
                    ).order_by(Notification.created_at.desc())
                )
                assert notif is not None
                assert "transferred" in notif.message.lower()

        finally:
            async with factory() as session:
                order_uuids = [UUID(oid) for oid in created_order_ids]
                if order_uuids:
                    await session.execute(delete(RiderOffer).where(RiderOffer.shipment_id.in_(
                        select(Shipment.id).where(Shipment.order_id.in_(order_uuids))
                    )))
                    await session.execute(delete(Shipment).where(Shipment.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_uuids)))
                    await session.execute(delete(Order).where(Order.id.in_(order_uuids)))
                if created_crop_ids:
                    await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                        select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                    )))
                    await session.execute(delete(CropListing).where(CropListing.crop_id.in_(created_crop_ids)))
                    await session.execute(delete(Crop).where(Crop.id.in_(created_crop_ids)))
                if created_hub_ids:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id.in_(created_hub_ids)))
                    await session.execute(delete(Hub).where(Hub.id.in_(created_hub_ids)))
                if created_user_ids:
                    await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                        select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                    )))
                    await session.execute(delete(Notification).where(Notification.user_id.in_(created_user_ids)))
                    await session.execute(delete(Consumer).where(Consumer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Farmer).where(Farmer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Rider).where(Rider.user_id.in_(created_user_ids)))
                    await session.execute(delete(User).where(User.id.in_(created_user_ids)))
                await session.commit()
            await engine.dispose()

    asyncio.run(run_test())


def test_case_3_hub_staff_packing_and_rider_dispatch_without_hub_storage():
    """Case 3: Farmer transfers order to Hub.
    Hub Staff receives the order, starts packing, marks shipment ready for rider.
    Hub Storage quantity is NOT required."""
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                farmer_user = User(
                    email=f"farmer-hubstaff-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-hubstaff-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                staff_user = User(
                    email=f"staff-hubstaff-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.HUB_STAFF,
                    is_active=True,
                )
                rider_user = User(
                    email=f"rider-hubstaff-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.RIDER,
                    is_active=True,
                )
                session.add_all([farmer_user, consumer_user, staff_user, rider_user])
                await session.flush()
                created_user_ids.extend([farmer_user.id, consumer_user.id, staff_user.id, rider_user.id])

                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Farmer Manoj",
                    phone="9988776655",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                )
                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Customer Deepak",
                    phone="9123456780",
                    address_line="House 15, Bapuji Nagar, Bhubaneswar",
                )
                rider_profile = Rider(
                    user_id=rider_user.id,
                    display_name="Delivery Hero Manoj",
                    vehicle_type="BIKE",
                    approval_status=RiderApprovalStatus.APPROVED,
                    availability=RiderAvailability.AVAILABLE,
                )
                session.add_all([farmer_profile, consumer_profile, rider_profile])
                await session.flush()

                hub = Hub(
                    farmer_id=farmer_profile.id,
                    name="Manoj Farmer Hub",
                    address="Unit 5, Farm Road, Bhubaneswar",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pincode="751001",
                    service_radius_km=Decimal("10.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(hub)
                await session.flush()
                created_hub_ids.append(hub.id)

                hub_staff = HubStaff(user_id=staff_user.id, hub_id=hub.id)
                session.add(hub_staff)

                crop = Crop(name=f"Fresh Tomatoes {uuid4().hex[:4]}", category="Vegetables")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                listing = CropListing(
                    farmer_id=farmer_profile.id,
                    crop_id=crop.id,
                    quantity=Decimal("50.0"),
                    asking_price=Decimal("25.00"),
                    unit="kg",
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                cart = Cart(consumer_id=consumer_profile.id)
                session.add(cart)
                await session.flush()
                item = CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("6.0"))
                session.add(item)
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # Customer checkout
            checkout_res = client.post(
                "/api/v1/orders",
                json={
                    "latitude": 20.29,
                    "longitude": 85.82,
                    "address": "House 15, Bapuji Nagar, Bhubaneswar",
                },
                headers=auth_header(consumer_user),
            )
            assert checkout_res.status_code == 201, checkout_res.text
            order_id = checkout_res.json()["id"]
            created_order_ids.append(order_id)

            # Farmer transfers to Hub
            send_res = client.post(
                f"/api/v1/farmers/me/orders/{order_id}/send-to-hub",
                headers=auth_header(farmer_user),
            )
            assert send_res.status_code == 200, send_res.text

            # Hub Staff starts packing
            pack_res = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/orders/{order_id}/start-packing",
                headers=auth_header(staff_user),
            )
            assert pack_res.status_code == 201, pack_res.text
            shipment_id = pack_res.json()["id"]

            # Hub Staff marks ready for rider
            ready_res = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/shipments/{shipment_id}/ready",
                headers=auth_header(staff_user),
            )
            assert ready_res.status_code == 200, ready_res.text
            assert ready_res.json()["status"] == "READY_FOR_PICKUP"

            # Rider receives notification showing Hub Name (because farmer chose Send to My Hub)
            async with factory() as session:
                rider_notif = await session.scalar(
                    select(Notification).where(
                        Notification.user_id == rider_user.id,
                        Notification.related_entity_type == "rider_offer",
                    ).order_by(Notification.created_at.desc())
                )
                assert rider_notif is not None, "Rider must receive notification when hub marks shipment ready"
                assert "Manoj Farmer Hub" in rider_notif.title or "Manoj Farmer Hub" in rider_notif.message

            # Rider polls offers: sees Hub Name, pickup_type == "HUB"
            poll_res = client.post(
                "/api/v1/rider/offers/poll",
                headers=auth_header(rider_user),
            )
            assert poll_res.status_code == 200, poll_res.text
            offers = poll_res.json()
            matched_offer = next((o for o in offers if o["shipment_id"] == shipment_id), None)
            assert matched_offer is not None, "Rider should see active offer for hub shipment"
            assert matched_offer["hub_name"] == "Manoj Farmer Hub"
            assert matched_offer["pickup_type"] == "HUB"

            # Rider accepts offer
            accept_res = client.post(
                f"/api/v1/rider/offers/{matched_offer['id']}/accept",
                headers=auth_header(rider_user),
            )
            assert accept_res.status_code == 200, accept_res.text
            accepted_shipment = accept_res.json()
            assert accepted_shipment["status"] == "RIDER_ASSIGNED"
            assert accepted_shipment["hub_name"] == "Manoj Farmer Hub"
            assert accepted_shipment["pickup_type"] == "HUB"

        finally:
            async with factory() as session:
                order_uuids = [UUID(oid) for oid in created_order_ids]
                if order_uuids:
                    await session.execute(delete(RiderOffer).where(RiderOffer.shipment_id.in_(
                        select(Shipment.id).where(Shipment.order_id.in_(order_uuids))
                    )))
                    await session.execute(delete(Shipment).where(Shipment.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_uuids)))
                    await session.execute(delete(Order).where(Order.id.in_(order_uuids)))
                if created_crop_ids:
                    await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                        select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                    )))
                    await session.execute(delete(CropListing).where(CropListing.crop_id.in_(created_crop_ids)))
                    await session.execute(delete(Crop).where(Crop.id.in_(created_crop_ids)))
                if created_hub_ids:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id.in_(created_hub_ids)))
                    await session.execute(delete(Hub).where(Hub.id.in_(created_hub_ids)))
                if created_user_ids:
                    await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                        select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                    )))
                    await session.execute(delete(Notification).where(Notification.user_id.in_(created_user_ids)))
                    await session.execute(delete(Consumer).where(Consumer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Farmer).where(Farmer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Rider).where(Rider.user_id.in_(created_user_ids)))
                    await session.execute(delete(User).where(User.id.in_(created_user_ids)))
                await session.commit()
            await engine.dispose()

    asyncio.run(run_test())


def test_case_4_hub_exists_but_farmer_chooses_direct_rider_delivery():
    """Case 4 (Test C): Farmer has Hub + Hub Staff, but farmer chooses direct Rider Delivery.
    Do NOT use Hub.
    Rider receives direct notification from Farmer with Farmer Farm Name (not Hub Storage/Hub name).
    Rider accepts offer and sees Farmer Farm Name."""
    async def run_test():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        created_user_ids = []
        created_hub_ids = []
        created_crop_ids = []
        created_order_ids = []

        try:
            async with factory() as session:
                farmer_user = User(
                    email=f"farmer-directrider-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.FARMER,
                    is_active=True,
                )
                consumer_user = User(
                    email=f"consumer-directrider-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.CONSUMER,
                    is_active=True,
                )
                staff_user = User(
                    email=f"staff-directrider-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.HUB_STAFF,
                    is_active=True,
                )
                rider_user = User(
                    email=f"rider-directrider-{uuid4()}@example.com",
                    hashed_password=hash_password("Password123!"),
                    role=UserRole.RIDER,
                    is_active=True,
                )
                session.add_all([farmer_user, consumer_user, staff_user, rider_user])
                await session.flush()
                created_user_ids.extend([farmer_user.id, consumer_user.id, staff_user.id, rider_user.id])

                farmer_profile = Farmer(
                    user_id=farmer_user.id,
                    name="Organic Orchard Farm",
                    phone="9988776655",
                    address_line="Orchard Gate 2, Chandaka, Khordha",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                )
                consumer_profile = Consumer(
                    user_id=consumer_user.id,
                    name="Customer Priya",
                    phone="9123456780",
                    address_line="House 22, Saheed Nagar, Bhubaneswar",
                )
                rider_profile = Rider(
                    user_id=rider_user.id,
                    display_name="Delivery Hero Subrat",
                    vehicle_type="BIKE",
                    approval_status=RiderApprovalStatus.APPROVED,
                    availability=RiderAvailability.AVAILABLE,
                )
                session.add_all([farmer_profile, consumer_profile, rider_profile])
                await session.flush()

                # Farmer also has an active hub and assigned staff
                hub = Hub(
                    farmer_id=farmer_profile.id,
                    name="Chandaka Central Agro Hub",
                    address="Sector 9, Chandaka Industrial Area",
                    location=WKTElement("POINT(85.82 20.29)", srid=4326),
                    pincode="751024",
                    service_radius_km=Decimal("10.0"),
                    status=HubStatus.ACTIVE,
                )
                session.add(hub)
                await session.flush()
                created_hub_ids.append(hub.id)

                hub_staff = HubStaff(user_id=staff_user.id, hub_id=hub.id)
                session.add(hub_staff)

                crop = Crop(name=f"Alphonso Mango {uuid4().hex[:4]}", category="Fruits")
                session.add(crop)
                await session.flush()
                created_crop_ids.append(crop.id)

                listing = CropListing(
                    farmer_id=farmer_profile.id,
                    crop_id=crop.id,
                    quantity=Decimal("40.0"),
                    asking_price=Decimal("120.00"),
                    unit="kg",
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(listing)
                await session.flush()

                cart = Cart(consumer_id=consumer_profile.id)
                session.add(cart)
                await session.flush()
                item = CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("5.0"))
                session.add(item)
                await session.commit()

            app = create_app()
            client = TestClient(app)

            # Customer checkout
            checkout_res = client.post(
                "/api/v1/orders",
                json={
                    "latitude": 20.29,
                    "longitude": 85.82,
                    "address": "House 22, Saheed Nagar, Bhubaneswar",
                },
                headers=auth_header(consumer_user),
            )
            assert checkout_res.status_code == 201, checkout_res.text
            order_id = checkout_res.json()["id"]
            created_order_ids.append(order_id)

            # Farmer chooses DIRECT Rider Delivery (not Send to My Hub)
            ready_res = client.post(
                f"/api/v1/farmers/me/orders/{order_id}/ready-for-pickup",
                headers=auth_header(farmer_user),
            )
            assert ready_res.status_code == 200, ready_res.text
            assert ready_res.json()["status"] == "SHIPPED"

            # Verify shipment has hub_id=None (direct from farm, did NOT use Hub)
            async with factory() as session:
                shipment = await session.scalar(
                    select(Shipment).where(Shipment.order_id == UUID(order_id))
                )
                assert shipment is not None
                assert shipment.hub_id is None, "Direct farmer rider delivery must NOT assign hub_id"
                assert shipment.status == ShipmentStatus.READY_FOR_PICKUP

            # Rider receives notification showing Farmer Farm Name (NOT Hub name)
            async with factory() as session:
                rider_notif = await session.scalar(
                    select(Notification).where(
                        Notification.user_id == rider_user.id,
                        Notification.related_entity_type == "rider_offer",
                    ).order_by(Notification.created_at.desc())
                )
                assert rider_notif is not None, "Rider must receive notification for farm pickup"
                assert "Organic Orchard Farm" in rider_notif.title or "Organic Orchard Farm" in rider_notif.message
                assert "Chandaka Central Agro Hub" not in rider_notif.message
                assert "Chandaka Central Agro Hub" not in rider_notif.title

            # Rider polls offers: sees Farmer Farm Name as origin, pickup_type == "FARM"
            poll_res = client.post(
                "/api/v1/rider/offers/poll",
                headers=auth_header(rider_user),
            )
            assert poll_res.status_code == 200, poll_res.text
            offers = poll_res.json()
            matched_offer = next((o for o in offers if o["shipment_id"] == str(shipment.id)), None)
            assert matched_offer is not None, "Rider should see active offer"
            assert matched_offer["hub_name"] == "Organic Orchard Farm"
            assert matched_offer["pickup_type"] == "FARM"

            # Rider accepts offer
            accept_res = client.post(
                f"/api/v1/rider/offers/{matched_offer['id']}/accept",
                headers=auth_header(rider_user),
            )
            assert accept_res.status_code == 200, accept_res.text
            accepted_shipment = accept_res.json()
            assert accepted_shipment["status"] == "RIDER_ASSIGNED"
            assert accepted_shipment["hub_name"] == "Organic Orchard Farm"
            assert accepted_shipment["pickup_type"] == "FARM"

        finally:
            async with factory() as session:
                order_uuids = [UUID(oid) for oid in created_order_ids]
                if order_uuids:
                    await session.execute(delete(RiderOffer).where(RiderOffer.shipment_id.in_(
                        select(Shipment.id).where(Shipment.order_id.in_(order_uuids))
                    )))
                    await session.execute(delete(Shipment).where(Shipment.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderEvent).where(OrderEvent.order_id.in_(order_uuids)))
                    await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_uuids)))
                    await session.execute(delete(Order).where(Order.id.in_(order_uuids)))
                if created_crop_ids:
                    await session.execute(delete(CartItem).where(CartItem.listing_id.in_(
                        select(CropListing.id).where(CropListing.crop_id.in_(created_crop_ids))
                    )))
                    await session.execute(delete(CropListing).where(CropListing.crop_id.in_(created_crop_ids)))
                    await session.execute(delete(Crop).where(Crop.id.in_(created_crop_ids)))
                if created_hub_ids:
                    await session.execute(delete(HubStaff).where(HubStaff.hub_id.in_(created_hub_ids)))
                    await session.execute(delete(Hub).where(Hub.id.in_(created_hub_ids)))
                if created_user_ids:
                    await session.execute(delete(Cart).where(Cart.consumer_id.in_(
                        select(Consumer.id).where(Consumer.user_id.in_(created_user_ids))
                    )))
                    await session.execute(delete(Notification).where(Notification.user_id.in_(created_user_ids)))
                    await session.execute(delete(Consumer).where(Consumer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Farmer).where(Farmer.user_id.in_(created_user_ids)))
                    await session.execute(delete(Rider).where(Rider.user_id.in_(created_user_ids)))
                    await session.execute(delete(User).where(User.id.in_(created_user_ids)))
                await session.commit()
            await engine.dispose()

    asyncio.run(run_test())
