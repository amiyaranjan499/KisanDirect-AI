import asyncio
import io
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from geoalchemy2.elements import WKTElement
from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    Admin,
    AdminAuditEvent,
    AvailabilityStatus,
    Cart,
    CartItem,
    Consumer,
    Crop,
    CropImage,
    CropListing,
    Delivery,
    Farmer,
    Hub,
    HubStaff,
    HubStock,
    HubStockDelivery,
    Notification,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Review,
    Rider,
    RiderApprovalStatus,
    RiderAvailability,
    RiderLocation,
    RiderOffer,
    Shipment,
    ShipmentStatus,
    StockReservation,
    User,
    UserRole,
)
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    OrderLifecycleService,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User, settings: Settings | None = None) -> dict[str, str]:
    active_settings = settings or Settings()
    token = create_access_token(str(user.id), user.role, active_settings)
    return {"Authorization": f"Bearer {token}"}


def make_test_png() -> bytes:
    buffer = io.BytesIO()
    img = Image.new("RGB", (32, 32), color="green")
    img.save(buffer, format="PNG")
    return buffer.getvalue()


async def _purge_e2e_data(session: AsyncSession) -> None:
    # Find all e2e users
    users = (
        await session.execute(select(User).where(User.email.like("e2e-%")))
    ).scalars().all()
    if not users:
        return
    user_ids = [u.id for u in users]

    consumers = (
        await session.execute(select(Consumer).where(Consumer.user_id.in_(user_ids)))
    ).scalars().all()
    consumer_ids = [c.id for c in consumers]

    farmers = (
        await session.execute(select(Farmer).where(Farmer.user_id.in_(user_ids)))
    ).scalars().all()
    farmer_ids = [f.id for f in farmers]

    riders = (
        await session.execute(select(Rider).where(Rider.user_id.in_(user_ids)))
    ).scalars().all()
    rider_ids = [r.id for r in riders]

    hubs = (
        await session.execute(select(Hub).where(Hub.name.like("E2E Hub %")))
    ).scalars().all()
    hub_ids = [h.id for h in hubs]

    # Delete reviews
    if consumer_ids:
        await session.execute(delete(Review).where(Review.consumer_id.in_(consumer_ids)))

    # Delete notifications
    await session.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))

    # Delete orders & related
    if consumer_ids:
        orders = (
            await session.execute(select(Order).where(Order.consumer_id.in_(consumer_ids)))
        ).scalars().all()
        order_ids = [o.id for o in orders]
        if order_ids:
            shipments = (
                await session.execute(select(Shipment).where(Shipment.order_id.in_(order_ids)))
            ).scalars().all()
            shipment_ids = [s.id for s in shipments]
            if shipment_ids:
                await session.execute(delete(RiderOffer).where(RiderOffer.shipment_id.in_(shipment_ids)))
            await session.execute(delete(OrderEvent).where(OrderEvent.order_id.in_(order_ids)))
            await session.execute(delete(AdminAuditEvent).where(AdminAuditEvent.entity_id.in_(order_ids)))
            await session.execute(delete(StockReservation).where(StockReservation.order_id.in_(order_ids)))
            await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_ids)))
            await session.execute(delete(Payment).where(Payment.order_id.in_(order_ids)))
            await session.execute(delete(Shipment).where(Shipment.order_id.in_(order_ids)))
            await session.execute(delete(Order).where(Order.id.in_(order_ids)))

        # Delete carts
        await session.execute(
            delete(CartItem).where(
                CartItem.cart_id.in_(select(Cart.id).where(Cart.consumer_id.in_(consumer_ids)))
            )
        )
        await session.execute(delete(Cart).where(Cart.consumer_id.in_(consumer_ids)))

    # Delete hub stock deliveries & hub stock
    if hub_ids or user_ids:
        await session.execute(
            delete(HubStockDelivery).where(
                (HubStockDelivery.hub_id.in_(hub_ids)) | (HubStockDelivery.farmer_user_id.in_(user_ids))
            )
        )
    if hub_ids:
        await session.execute(delete(HubStock).where(HubStock.hub_id.in_(hub_ids)))

    # Delete crop listings & crops
    if farmer_ids:
        listings = (
            await session.execute(select(CropListing).where(CropListing.farmer_id.in_(farmer_ids)))
        ).scalars().all()
        listing_ids = [l.id for l in listings]
        crop_ids = [l.crop_id for l in listings]
        if listing_ids:
            await session.execute(delete(CropImage).where(CropImage.listing_id.in_(listing_ids)))
            await session.execute(delete(CropListing).where(CropListing.id.in_(listing_ids)))
        if crop_ids:
            await session.execute(delete(Crop).where(Crop.id.in_(crop_ids)))

    # Delete rider entities
    if rider_ids:
        await session.execute(delete(RiderOffer).where(RiderOffer.rider_id.in_(rider_ids)))
        await session.execute(delete(RiderLocation).where(RiderLocation.rider_id.in_(rider_ids)))
        await session.execute(delete(Rider).where(Rider.id.in_(rider_ids)))

    # Delete hub links & hubs
    if hub_ids:
        await session.execute(delete(HubStaff).where(HubStaff.hub_id.in_(hub_ids)))
        await session.execute(delete(Hub).where(Hub.id.in_(hub_ids)))

    # Delete profiles & users
    await session.execute(delete(Consumer).where(Consumer.user_id.in_(user_ids)))
    await session.execute(delete(Farmer).where(Farmer.user_id.in_(user_ids)))
    await session.execute(delete(Admin).where(Admin.user_id.in_(user_ids)))
    await session.execute(delete(User).where(User.id.in_(user_ids)))
    await session.commit()


def seed_e2e_environment():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await _purge_e2e_data(session)

            farmer_user = User(
                email=f"e2e-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Pass-12345"),
                role=UserRole.FARMER,
            )
            consumer_user = User(
                email=f"e2e-consumer-{uuid4()}@example.com",
                hashed_password=hash_password("Pass-12345"),
                role=UserRole.CONSUMER,
            )
            other_consumer_user = User(
                email=f"e2e-other-consumer-{uuid4()}@example.com",
                hashed_password=hash_password("Pass-12345"),
                role=UserRole.CONSUMER,
            )
            hub_staff_user = User(
                email=f"e2e-staff-{uuid4()}@example.com",
                hashed_password=hash_password("Pass-12345"),
                role=UserRole.HUB_STAFF,
            )
            rider_user = User(
                email=f"e2e-rider-{uuid4()}@example.com",
                hashed_password=hash_password("Pass-12345"),
                role=UserRole.RIDER,
            )
            admin_user = User(
                email=f"e2e-admin-{uuid4()}@example.com",
                hashed_password=hash_password("Pass-12345"),
                role=UserRole.ADMIN,
            )

            session.add_all([
                farmer_user,
                consumer_user,
                other_consumer_user,
                hub_staff_user,
                rider_user,
                admin_user,
            ])
            await session.flush()

            farmer_profile = Farmer(
                user_id=farmer_user.id,
                name="E2E Farmer",
                phone="9876543210",
                address="Farm Road, Bhubaneswar",
                location=WKTElement("POINT(85.80 20.30)", srid=4326),
            )
            consumer_profile = Consumer(
                user_id=consumer_user.id,
                name="E2E Consumer",
                phone="9876543211",
                address="Consumer Apt, Bhubaneswar",
            )
            other_consumer_profile = Consumer(
                user_id=other_consumer_user.id,
                name="E2E Other Consumer",
                phone="9876543212",
                address="Other Apt, Bhubaneswar",
            )
            admin_profile = Admin(
                user_id=admin_user.id,
                name="E2E Admin",
            )

            hub = Hub(
                name=f"E2E Hub {uuid4()}",
                address="Hub Central, Bhubaneswar",
                location=WKTElement("POINT(85.80 20.30)", srid=4326),
                pincode="751001",
                service_radius_km=Decimal("15.0"),
            )
            session.add(hub)
            await session.flush()

            staff_link = HubStaff(
                hub_id=hub.id,
                user_id=hub_staff_user.id,
            )
            rider_profile = Rider(
                user_id=rider_user.id,
                display_name="E2E Speed Rider",
                vehicle_type="BIKE",
                approval_status=RiderApprovalStatus.APPROVED,
                availability=RiderAvailability.AVAILABLE,
            )

            session.add_all([
                farmer_profile,
                consumer_profile,
                other_consumer_profile,
                admin_profile,
                staff_link,
                rider_profile,
            ])
            await session.commit()

            rider_loc = RiderLocation(
                rider_id=rider_profile.id,
                location=WKTElement("POINT(85.801 20.301)", srid=4326),
                recorded_at=datetime.now(timezone.utc),
            )
            session.add(rider_loc)
            await session.commit()

        await engine.dispose()
        return {
            "farmer_user": farmer_user,
            "consumer_user": consumer_user,
            "other_consumer_user": other_consumer_user,
            "hub_staff_user": hub_staff_user,
            "rider_user": rider_user,
            "admin_user": admin_user,
            "farmer_profile": farmer_profile,
            "consumer_profile": consumer_profile,
            "other_consumer_profile": other_consumer_profile,
            "hub": hub,
            "rider_profile": rider_profile,
        }

    return asyncio.run(create())


def cleanup_e2e_environment(ctx: dict):
    async def cleanup():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await _purge_e2e_data(session)
        await engine.dispose()

    asyncio.run(cleanup())


def test_full_farmer_to_consumer_delivery_end_to_end_journey():
    ctx = seed_e2e_environment()
    app = create_app()

    try:
        with TestClient(app) as client:
            farmer_user = ctx["farmer_user"]
            consumer_user = ctx["consumer_user"]
            other_consumer_user = ctx["other_consumer_user"]
            hub_staff_user = ctx["hub_staff_user"]
            rider_user = ctx["rider_user"]
            admin_user = ctx["admin_user"]
            hub = ctx["hub"]

            # =====================================================================
            # STEP 1: Farmer publishes a real crop with valid image and stock
            # =====================================================================
            crop_name = f"Fresh Organic Basmati Rice {uuid4().hex[:6]}"
            listing_payload = {
                "crop_name": crop_name,
                "crop_category": "Grain",
                "quantity": "50.000",
                "unit": "kg",
                "asking_price": "85.00",
                "description": "Premium organic harvest directly from farm",
                "location": {"latitude": 20.30, "longitude": 85.80},
                "minimum_order_quantity": "2.000",
            }
            create_resp = client.post(
                "/api/v1/farmers/me/listings",
                headers=auth_header(farmer_user),
                json=listing_payload,
            )
            assert create_resp.status_code == 201, create_resp.text
            listing_data = create_resp.json()
            listing_id = UUID(listing_data["id"])
            assert listing_data["crop_name"] == crop_name
            assert listing_data["availability_status"] == "AVAILABLE"

            # Upload real crop image
            image_bytes = make_test_png()
            img_resp = client.post(
                f"/api/v1/farmers/me/listings/{listing_id}/images",
                headers=auth_header(farmer_user),
                files={"image": ("basmati.png", image_bytes, "image/png")},
            )
            assert img_resp.status_code == 201, img_resp.text

            # Deliver stock to Hub
            stock_delivery_resp = client.post(
                "/api/v1/hub-operations/farmer/stock-deliveries",
                headers=auth_header(farmer_user),
                json={
                    "hub_id": str(hub.id),
                    "listing_id": str(listing_id),
                    "quantity": "50.000",
                    "notes": "Direct harvest delivery",
                },
            )
            assert stock_delivery_resp.status_code == 201, stock_delivery_resp.text
            delivery_id = stock_delivery_resp.json()["id"]

            # Hub staff receives stock into Hub inventory
            receive_resp = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/stock-deliveries/{delivery_id}/receive",
                headers=auth_header(hub_staff_user),
            )
            assert receive_resp.status_code == 200, receive_resp.text
            assert receive_resp.json()["status"] == "RECEIVED"

            # Verify consumer marketplace query returns the crop
            market_search = client.get(
                "/api/v1/marketplace/listings?category=Grain&sort=price_asc",
                headers=auth_header(consumer_user),
            )
            assert market_search.status_code == 200, market_search.text
            found_listings = market_search.json()["items"]
            assert any(item["id"] == str(listing_id) for item in found_listings)

            # =====================================================================
            # STEP 2: Consumer checkout with inventory hold & sandbox payment
            # =====================================================================
            # Add to cart
            cart_resp = client.post(
                "/api/v1/cart/items",
                headers=auth_header(consumer_user),
                json={"listing_id": str(listing_id), "quantity": "5.000"},
            )
            assert cart_resp.status_code == 201, cart_resp.text
            assert cart_resp.json()["subtotal"] == "425.00"

            # Resolve serviceable checkout options
            opts_resp = client.get(
                "/api/v1/checkout/options?latitude=20.30&longitude=85.80",
                headers=auth_header(consumer_user),
            )
            assert opts_resp.status_code == 200, opts_resp.text
            opts_data = opts_resp.json()
            assert any(h["id"] == str(hub.id) for h in opts_data["hubs"])
            matching_hub = next(h for h in opts_data["hubs"] if h["id"] == str(hub.id))
            assert matching_hub["available"] is True

            # Place checkout order
            order_resp = client.post(
                "/api/v1/orders",
                headers=auth_header(consumer_user),
                json={
                    "hub_id": str(hub.id),
                    "latitude": 20.30,
                    "longitude": 85.80,
                    "address": "Consumer Residence, Bhubaneswar",
                },
            )
            assert order_resp.status_code == 201, order_resp.text
            order_data = order_resp.json()
            order_id = UUID(order_data["id"])
            assert order_data["status"] == "PENDING"
            assert Decimal(order_data["subtotal"]) == Decimal("425.00")

            # Complete sandbox payment
            payment_resp = client.post(
                f"/api/v1/payments/test/{order_id}",
                headers=auth_header(consumer_user),
                json={"outcome": "success"},
            )
            assert payment_resp.status_code == 201, payment_resp.text
            assert payment_resp.json()["status"] == "successful"

            # =====================================================================
            # STEP 3: Farmer and Hub fulfillment
            # =====================================================================
            # Premature packing before PROCESSING must be rejected
            premature_pack = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/orders/{order_id}/start-packing",
                headers=auth_header(hub_staff_user),
            )
            assert premature_pack.status_code == 409

            # Farmer confirms order from PENDING -> CONFIRMED
            farmer_confirm = client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=auth_header(farmer_user),
                json={"status": "CONFIRMED"},
            )
            assert farmer_confirm.status_code == 200, farmer_confirm.text
            assert farmer_confirm.json()["status"] == "CONFIRMED"

            # Farmer advances order from CONFIRMED -> PROCESSING
            farmer_processing = client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=auth_header(farmer_user),
                json={"status": "PROCESSING"},
            )
            assert farmer_processing.status_code == 200, farmer_processing.text
            assert farmer_processing.json()["status"] == "PROCESSING"

            # Hub staff starts packing order
            pack_resp = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/orders/{order_id}/start-packing",
                headers=auth_header(hub_staff_user),
            )
            assert pack_resp.status_code == 201, pack_resp.text
            shipment_data = pack_resp.json()
            shipment_id = UUID(shipment_data["id"])
            assert shipment_data["status"] == "PACKING"

            # Hub staff marks shipment ready for dispatch
            ready_resp = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/shipments/{shipment_id}/ready",
                headers=auth_header(hub_staff_user),
            )
            assert ready_resp.status_code == 200, ready_resp.text
            assert ready_resp.json()["status"] in {"READY_FOR_PICKUP", "RIDER_ASSIGNED"}

            # Out-of-order action check: packing an already ready/packed shipment must fail
            invalid_pack = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/orders/{order_id}/start-packing",
                headers=auth_header(hub_staff_user),
            )
            assert invalid_pack.status_code in {400, 409}

            # =====================================================================
            # STEP 4: Rider assignment and pickup
            # =====================================================================
            # Rider goes online
            avail_resp = client.patch(
                "/api/v1/rider/availability",
                headers=auth_header(rider_user),
                json={"online": True},
            )
            assert avail_resp.status_code == 200, avail_resp.text

            # Rider posts current location
            loc_resp = client.post(
                "/api/v1/rider/location",
                headers=auth_header(rider_user),
                json={"latitude": 20.301, "longitude": 85.801},
            )
            assert loc_resp.status_code == 200, loc_resp.text

            # Rider polls offers
            poll_resp = client.post(
                "/api/v1/rider/offers/poll",
                headers=auth_header(rider_user),
            )
            assert poll_resp.status_code == 200, poll_resp.text
            offers = poll_resp.json()
            assert len(offers) >= 1
            offer = next(o for o in offers if o["shipment_id"] == str(shipment_id))
            offer_id = offer["id"]

            # Rider accepts offer
            accept_resp = client.post(
                f"/api/v1/rider/offers/{offer_id}/accept",
                headers=auth_header(rider_user),
            )
            assert accept_resp.status_code == 200, accept_resp.text
            assert accept_resp.json()["status"] == "RIDER_ASSIGNED"

            # Rider completes pickup
            pickup_resp = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/status",
                headers=auth_header(rider_user),
                json={"status": "PICKED_UP"},
            )
            assert pickup_resp.status_code == 200, pickup_resp.text
            assert pickup_resp.json()["status"] == "PICKED_UP"

            # Rider starts delivery
            out_resp = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/status",
                headers=auth_header(rider_user),
                json={"status": "OUT_FOR_DELIVERY"},
            )
            assert out_resp.status_code == 200, out_resp.text
            assert out_resp.json()["status"] == "OUT_FOR_DELIVERY"

            # =====================================================================
            # STEP 5: Live tracking and OTP verification
            # =====================================================================
            # Owning consumer tracking
            track_resp = client.get(
                f"/api/v1/orders/{order_id}/tracking",
                headers=auth_header(consumer_user),
            )
            assert track_resp.status_code == 200, track_resp.text
            track_data = track_resp.json()
            assert track_data["shipment_status"] == "OUT_FOR_DELIVERY"
            assert len(track_data["events"]) >= 3

            # Unauthorized consumer tracking must be blocked
            unauthorized_track = client.get(
                f"/api/v1/orders/{order_id}/tracking",
                headers=auth_header(other_consumer_user),
            )
            assert unauthorized_track.status_code in {403, 404}

            # Retrieve OTP code from consumer notification
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

            # =====================================================================
            # STEP 6: Delivery completion & OTP single-use validation
            # =====================================================================
            # Rider marks arrival
            arrive_resp = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/status",
                headers=auth_header(rider_user),
                json={"status": "ARRIVED"},
            )
            assert arrive_resp.status_code == 200, arrive_resp.text
            assert arrive_resp.json()["status"] == "ARRIVED"

            # Submit valid OTP
            verify_resp = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/otp-verification",
                headers=auth_header(rider_user),
                json={"code": otp_code},
            )
            assert verify_resp.status_code == 200, verify_resp.text
            assert verify_resp.json()["status"] == "DELIVERED"

            # Re-submitting the same OTP must be rejected (single-use)
            reuse_resp = client.post(
                f"/api/v1/rider/shipments/{shipment_id}/otp-verification",
                headers=auth_header(rider_user),
                json={"code": otp_code},
            )
            assert reuse_resp.status_code in {400, 409}

            # =====================================================================
            # STEP 7: Downstream business verification
            # =====================================================================
            # Consumer confirms receipt, completing the order
            complete_resp = client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=auth_header(consumer_user),
                json={"status": "COMPLETED"},
            )
            assert complete_resp.status_code == 200, complete_resp.text
            assert complete_resp.json()["status"] == "COMPLETED"

            # Consumer order history shows completed order
            orders_hist = client.get(
                "/api/v1/orders",
                headers=auth_header(consumer_user),
            )
            assert orders_hist.status_code == 200, orders_hist.text
            assert any(o["id"] == str(order_id) and o["status"] == "COMPLETED" for o in orders_hist.json()["items"])

            # Consumer review submission
            review_resp = client.post(
                "/api/v1/reviews",
                headers=auth_header(consumer_user),
                json={
                    "order_id": str(order_id),
                    "listing_id": str(listing_id),
                    "rating": 5,
                    "comment": "Exceptional farm-fresh organic rice, prompt delivery!",
                },
            )
            assert review_resp.status_code == 201, review_resp.text
            assert review_resp.json()["rating"] == 5

            # Farmer dashboard summary reflects sales
            farmer_summary = client.get(
                "/api/v1/farmers/dashboard/summary",
                headers=auth_header(farmer_user),
            )
            assert farmer_summary.status_code == 200, farmer_summary.text
            summary_data = farmer_summary.json()
            assert summary_data["total_orders_received"] >= 1
            assert summary_data["completed_orders"] >= 1
            assert Decimal(str(summary_data["total_sales"])) >= Decimal("425.00")

            # Admin dashboard metrics reflect completed delivery
            admin_dash = client.get(
                "/api/v1/admins/dashboard/summary",
                headers=auth_header(admin_user),
            )
            assert admin_dash.status_code == 200, admin_dash.text
            admin_data = admin_dash.json()
            assert admin_data["total_orders"] >= 1
            assert admin_data["completed_orders"] >= 1
            assert Decimal(str(admin_data["total_payment_volume"])) >= Decimal("425.00")
            assert admin_data["total_reviews"] >= 1
            assert admin_data["active_shipments"] == 0
            assert admin_data["failed_deliveries"] == 0

            # Admin analytics metrics reflect sales volume and order states
            analytics_resp = client.get(
                "/api/v1/admins/analytics?range=30d",
                headers=auth_header(admin_user),
            )
            assert analytics_resp.status_code == 200, analytics_resp.text
            analytics_data = analytics_resp.json()
            assert analytics_data["total_orders"] >= 1
            assert analytics_data["completed_orders"] >= 1
            assert Decimal(str(analytics_data["total_sales"])) >= Decimal("425.00")
            assert analytics_data["active_shipments"] == 0
            assert analytics_data["failed_deliveries"] == 0

            # Admin shipment operational delivery metrics
            shipments_resp = client.get(
                "/api/v1/admins/shipments",
                headers=auth_header(admin_user),
            )
            assert shipments_resp.status_code == 200, shipments_resp.text
            admin_shipments = shipments_resp.json()
            delivered_shipment = next(
                s for s in admin_shipments if s["id"] == str(shipment_id)
            )
            assert delivered_shipment["status"] == "DELIVERED"
            assert delivered_shipment["order_id"] == str(order_id)
            assert delivered_shipment["rider_name"] == "E2E Speed Rider"
            assert delivered_shipment["otp_locked"] is False
            assert delivered_shipment["can_cancel"] is False

            # Rider history confirms delivery fulfillment metrics
            rider_hist_resp = client.get(
                "/api/v1/rider/history",
                headers=auth_header(rider_user),
            )
            assert rider_hist_resp.status_code == 200, rider_hist_resp.text
            rider_hist = rider_hist_resp.json()
            assert rider_hist["delivery_count"] >= 1
            assert any(
                s["id"] == str(shipment_id)
                for s in rider_hist["completed_deliveries"]
            )

            # Rider active shipment is cleared after delivery
            active_ship_resp = client.get(
                "/api/v1/rider/shipments/active",
                headers=auth_header(rider_user),
            )
            assert active_ship_resp.status_code == 200, active_ship_resp.text
            assert active_ship_resp.json() is None

            # Admin rider monitoring metrics
            riders_resp = client.get(
                "/api/v1/admins/riders",
                headers=auth_header(admin_user),
            )
            assert riders_resp.status_code == 200, riders_resp.text
            rider_metric = next(
                r for r in riders_resp.json() if r["user_id"] == str(rider_user.id)
            )
            assert rider_metric["completed_delivery_count"] >= 1
            assert rider_metric["active_shipment_count"] == 0

    finally:
        cleanup_e2e_environment(ctx)


def test_negative_path_farmer_rejection_releases_stock_and_notifies_consumer():
    ctx = seed_e2e_environment()
    app = create_app()

    try:
        with TestClient(app) as client:
            farmer_user = ctx["farmer_user"]
            consumer_user = ctx["consumer_user"]
            hub_staff_user = ctx["hub_staff_user"]
            hub = ctx["hub"]

            # 1. Farmer creates listing
            crop_name = f"Rejection Test Crop {uuid4().hex[:6]}"
            listing = client.post(
                "/api/v1/farmers/me/listings",
                headers=auth_header(farmer_user),
                json={
                    "crop_name": crop_name,
                    "crop_category": "Vegetable",
                    "quantity": "20.000",
                    "unit": "kg",
                    "asking_price": "50.00",
                    "description": "Fresh vegetables",
                    "location": {"latitude": 20.30, "longitude": 85.80},
                },
            ).json()
            listing_id = UUID(listing["id"])

            # 2. Deliver stock to hub
            deliv = client.post(
                "/api/v1/hub-operations/farmer/stock-deliveries",
                headers=auth_header(farmer_user),
                json={"hub_id": str(hub.id), "listing_id": str(listing_id), "quantity": "20.000"},
            ).json()
            client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/stock-deliveries/{deliv['id']}/receive",
                headers=auth_header(hub_staff_user),
            )

            # 3. Consumer orders
            client.post(
                "/api/v1/cart/items",
                headers=auth_header(consumer_user),
                json={"listing_id": str(listing_id), "quantity": "5.000"},
            )
            order = client.post(
                "/api/v1/orders",
                headers=auth_header(consumer_user),
                json={"hub_id": str(hub.id), "latitude": 20.30, "longitude": 85.80, "address": "Consumer St"},
            ).json()
            order_id = UUID(order["id"])

            # 4. Farmer rejects order
            reject_resp = client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=auth_header(farmer_user),
                json={"status": "CANCELLED", "reason": "Crop damaged by unexpected weather"},
            )
            assert reject_resp.status_code == 200, reject_resp.text
            assert reject_resp.json()["status"] == "CANCELLED"

            # 5. Verify order cannot proceed to packing
            pack_attempt = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/orders/{order_id}/start-packing",
                headers=auth_header(hub_staff_user),
            )
            assert pack_attempt.status_code in {400, 409}

            # 6. Verify consumer received notification
            notifs = client.get("/api/v1/notifications", headers=auth_header(consumer_user)).json()["items"]
            assert any("cancelled" in n["message"].lower() or "weather" in n["message"].lower() for n in notifs)

    finally:
        cleanup_e2e_environment(ctx)


def test_negative_path_consumer_cancellation_before_packing_releases_stock_and_refunds():
    ctx = seed_e2e_environment()
    app = create_app()

    try:
        with TestClient(app) as client:
            farmer_user = ctx["farmer_user"]
            consumer_user = ctx["consumer_user"]
            hub_staff_user = ctx["hub_staff_user"]
            hub = ctx["hub"]

            # 1. Create and seed listing + hub stock
            crop_name = f"Cancellation Test Crop {uuid4().hex[:6]}"
            listing = client.post(
                "/api/v1/farmers/me/listings",
                headers=auth_header(farmer_user),
                json={
                    "crop_name": crop_name,
                    "crop_category": "Fruit",
                    "quantity": "30.000",
                    "unit": "kg",
                    "asking_price": "60.00",
                    "description": "Seasonal fruit",
                    "location": {"latitude": 20.30, "longitude": 85.80},
                },
            ).json()
            listing_id = UUID(listing["id"])

            deliv = client.post(
                "/api/v1/hub-operations/farmer/stock-deliveries",
                headers=auth_header(farmer_user),
                json={"hub_id": str(hub.id), "listing_id": str(listing_id), "quantity": "30.000"},
            ).json()
            client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/stock-deliveries/{deliv['id']}/receive",
                headers=auth_header(hub_staff_user),
            )

            # 2. Consumer orders and pays
            client.post(
                "/api/v1/cart/items",
                headers=auth_header(consumer_user),
                json={"listing_id": str(listing_id), "quantity": "10.000"},
            )
            order = client.post(
                "/api/v1/orders",
                headers=auth_header(consumer_user),
                json={"hub_id": str(hub.id), "latitude": 20.30, "longitude": 85.80, "address": "Consumer St"},
            ).json()
            order_id = UUID(order["id"])

            pay_resp = client.post(
                f"/api/v1/payments/test/{order_id}",
                headers=auth_header(consumer_user),
                json={"outcome": "success"},
            )
            assert pay_resp.status_code == 201

            # 3. Consumer cancels before packing
            cancel_resp = client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=auth_header(consumer_user),
                json={"status": "CANCELLED"},
            )
            assert cancel_resp.status_code == 200, cancel_resp.text
            assert cancel_resp.json()["status"] == "CANCELLED"

            # 4. Duplicate cancellation must conflict
            dup_cancel = client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=auth_header(consumer_user),
                json={"status": "CANCELLED"},
            )
            assert dup_cancel.status_code in {400, 409}

            # 5. Verify cannot be packed
            pack_attempt = client.post(
                f"/api/v1/hub-operations/hub-staff/hubs/{hub.id}/orders/{order_id}/start-packing",
                headers=auth_header(hub_staff_user),
            )
            assert pack_attempt.status_code in {400, 409}

    finally:
        cleanup_e2e_environment(ctx)
