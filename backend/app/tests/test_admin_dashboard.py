import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
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
    Delivery,
    DeliveryStatus,
    Farmer,
    Notification,
    NotificationType,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Review,
    User,
    UserRole,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_admin_data() -> tuple:
    async def create() -> tuple[User, User, User, User, Consumer, Farmer, Crop, CropListing, Order, Payment, Review, Notification, int]:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async with factory() as session:
            baseline_counts = {
                "users": int((await session.execute(select(func.count()).select_from(User))).scalar_one()),
                "farmers": int((await session.execute(select(func.count()).select_from(Farmer))).scalar_one()),
                "consumers": int((await session.execute(select(func.count()).select_from(Consumer))).scalar_one()),
                "admins": int((await session.execute(select(func.count()).select_from(Admin))).scalar_one()),
                "listings": int((await session.execute(select(func.count()).select_from(CropListing))).scalar_one()),
                "orders": int((await session.execute(select(func.count()).select_from(Order))).scalar_one()),
                "reviews": int((await session.execute(select(func.count()).select_from(Review))).scalar_one()),
                "notifications": int((await session.execute(select(func.count()).select_from(Notification))).scalar_one()),
            }
            admin_user = User(
                email=f"admin-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.ADMIN,
            )
            farmer_user = User(
                email=f"farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            consumer_user = User(
                email=f"consumer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.CONSUMER,
            )
            session.add_all([admin_user, farmer_user, consumer_user])
            await session.flush()

            admin_profile = Admin(user_id=admin_user.id, name="Platform Admin")
            farmer_profile = Farmer(user_id=farmer_user.id, name="Admin Farmer")
            consumer_profile = Consumer(user_id=consumer_user.id, name="Admin Consumer")
            session.add_all([admin_profile, farmer_profile, consumer_profile])
            await session.flush()

            crop = Crop(name=f"Admin Crop {uuid4()}", category="Vegetable")
            session.add(crop)
            await session.flush()

            listing = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("25.000"),
                minimum_order_quantity=Decimal("1.000"),
                unit="kg",
                asking_price=Decimal("12.00"),
                availability_status=AvailabilityStatus.AVAILABLE,
            )
            session.add(listing)
            await session.flush()

            order = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.PENDING,
                total_amount=Decimal("12.00"),
                created_at=datetime.now(timezone.utc),
            )
            session.add(order)
            await session.flush()

            session.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=Decimal("1.000"), unit_price=Decimal("12.00"), subtotal=Decimal("12.00")))

            payment = Payment(
                order_id=order.id,
                amount=Decimal("12.00"),
                status=PaymentStatus.PAID,
                provider_reference=f"ADMIN-PAYMENT-{uuid4()}",
                payment_method="TEST_SANDBOX",
                is_test=True,
            )
            session.add(payment)

            delivery = Delivery(
                order_id=order.id,
                status=DeliveryStatus.PENDING,
                fulfillment_method="DELIVERY",
                address="123 Admin Road",
            )
            session.add(delivery)

            review = Review(
                consumer_id=consumer_profile.id,
                order_id=order.id,
                listing_id=listing.id,
                rating=5,
                comment="Nice produce.",
            )
            session.add(review)

            notification = Notification(
                user_id=farmer_user.id,
                notification_type=NotificationType.SYSTEM,
                title="Admin seeded notification",
                message="A platform seed notification exists.",
                related_entity_type="system",
                related_entity_id=None,
                is_read=False,
            )
            session.add(notification)
            await session.commit()

            for item in [admin_user, farmer_user, consumer_user, admin_profile, farmer_profile, consumer_profile, crop, listing, order, payment, review, notification, delivery]:
                await session.refresh(item)

        await engine.dispose()
        return admin_user, farmer_user, consumer_user, admin_profile.user_id, consumer_profile, farmer_profile, crop, listing, order, payment, review, notification, baseline_counts

    return asyncio.run(create())


def cleanup_admin_data(data):
    admin_user, farmer_user, consumer_user, admin_profile_user_id, consumer_profile, farmer_profile, crop, listing, order, payment, review, notification, _baseline_counts = data

    async def remove() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async with factory() as session:
            consumer_order_ids = (
                await session.execute(select(Order.id).where(Order.consumer_id == consumer_profile.id))
            ).scalars().all()
            await session.execute(delete(Notification).where(Notification.user_id.in_([farmer_user.id, consumer_user.id, admin_user.id])))
            await session.execute(delete(Review).where(Review.consumer_id == consumer_profile.id))
            if consumer_order_ids:
                await session.execute(delete(Payment).where(Payment.order_id.in_(consumer_order_ids)))
                await session.execute(delete(Delivery).where(Delivery.order_id.in_(consumer_order_ids)))
                await session.execute(delete(OrderItem).where(OrderItem.order_id.in_(consumer_order_ids)))
                await session.execute(delete(Order).where(Order.id.in_(consumer_order_ids)))
            await session.execute(delete(Review).where(Review.id == review.id))
            await session.execute(delete(Payment).where(Payment.id == payment.id))
            await session.execute(delete(Delivery).where(Delivery.order_id == order.id))
            await session.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
            await session.execute(delete(Order).where(Order.id == order.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.id == consumer_profile.id))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(Admin).where(Admin.user_id == admin_user.id))
            await session.execute(
                delete(AdminAuditEvent).where(
                    AdminAuditEvent.actor_user_id.in_(
                        [admin_user.id, farmer_user.id, consumer_user.id]
                    )
                )
            )
            await session.execute(delete(User).where(User.id.in_([admin_user.id, farmer_user.id, consumer_user.id])))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_admin_dashboard_and_management() -> None:
    data = seed_admin_data()
    admin_user, farmer_user, consumer_user, admin_profile_user_id, consumer_profile, farmer_profile, crop, listing, order, payment, review, notification, baseline_counts = data
    try:
        with TestClient(create_app()) as client:
            summary = client.get("/api/v1/admins/dashboard/summary", headers=auth_header(admin_user))
            assert summary.status_code == 200, summary.text
            summary_payload = summary.json()
            assert summary_payload["total_users"] == baseline_counts["users"] + 3
            assert summary_payload["total_farmers"] == baseline_counts["farmers"] + 1
            assert summary_payload["total_consumers"] == baseline_counts["consumers"] + 1
            assert summary_payload["total_admins"] == baseline_counts["admins"] + 1
            assert summary_payload["total_orders"] == baseline_counts["orders"] + 1
            assert summary_payload["pending_orders"] >= 1
            assert summary_payload["total_reviews"] == baseline_counts["reviews"] + 1
            assert summary_payload["total_notifications"] == baseline_counts["notifications"] + 1

            farmers = client.get("/api/v1/admins/farmers", headers=auth_header(admin_user))
            assert farmers.status_code == 200
            assert len(farmers.json()) == baseline_counts["farmers"] + 1

            consumers = client.get("/api/v1/admins/consumers", headers=auth_header(admin_user))
            assert consumers.status_code == 200
            assert len(consumers.json()) == baseline_counts["consumers"] + 1

            listings = client.get("/api/v1/admins/listings", headers=auth_header(admin_user))
            assert listings.status_code == 200
            assert len(listings.json()) == baseline_counts.get("listings", 0) + 1

            orders = client.get("/api/v1/admins/orders", headers=auth_header(admin_user))
            assert orders.status_code == 200
            assert len(orders.json()) == baseline_counts["orders"] + 1

            payments = client.get("/api/v1/admins/payments", headers=auth_header(admin_user))
            assert payments.status_code == 200
            assert len(payments.json()) == baseline_counts.get("payments", 0) + 1

            reviews = client.get("/api/v1/admins/reviews", headers=auth_header(admin_user))
            assert reviews.status_code == 200
            assert len(reviews.json()) == baseline_counts["reviews"] + 1

            notifications = client.get("/api/v1/admins/notifications", headers=auth_header(admin_user))
            assert notifications.status_code == 200
            assert len(notifications.json()) == baseline_counts["notifications"] + 1

            categories = client.get("/api/v1/admins/categories", headers=auth_header(admin_user))
            assert categories.status_code == 200
            assert len(categories.json()) >= 1

            deactivation = client.patch(
                f"/api/v1/admins/users/{consumer_user.id}/status",
                headers=auth_header(admin_user),
                json={"is_active": False},
            )
            assert deactivation.status_code == 200, deactivation.text
            assert deactivation.json()["is_active"] is False

            forbidden = client.get("/api/v1/admins/dashboard/summary", headers=auth_header(farmer_user))
            assert forbidden.status_code == 403
    finally:
        cleanup_admin_data(data)


def test_admin_analytics_range_changes_results() -> None:
    data = seed_admin_data()
    admin_user, farmer_user, consumer_user, admin_profile_user_id, consumer_profile, farmer_profile, crop, listing, order, payment, review, notification, baseline_counts = data
    async def create_old_order() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            old_order = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.PENDING,
                total_amount=Decimal("18.00"),
                created_at=datetime.now(timezone.utc) - timedelta(days=15),
            )
            session.add(old_order)
            await session.flush()
            session.add(
                OrderItem(
                    order_id=old_order.id,
                    listing_id=listing.id,
                    quantity=Decimal("1.000"),
                    unit_price=Decimal("18.00"),
                    subtotal=Decimal("18.00"),
                )
            )
            await session.commit()

    try:
        asyncio.run(create_old_order())
        with TestClient(create_app()) as client:
            short = client.get("/api/v1/admins/analytics", params={"range": "7d"}, headers=auth_header(admin_user))
            medium = client.get("/api/v1/admins/analytics", params={"range": "90d"}, headers=auth_header(admin_user))
            assert short.status_code == 200, short.text
            assert medium.status_code == 200, medium.text
            assert medium.json()["total_orders"] == short.json()["total_orders"] + 1
            assert short.json()["total_sales"] != medium.json()["total_sales"]
    finally:
        cleanup_admin_data(data)


def test_admin_dashboard_genuine_users_and_crop_deletion_counts() -> None:
    data = seed_admin_data()
    admin_user, farmer_user, consumer_user, admin_profile_user_id, consumer_profile, farmer_profile, crop, listing, order, payment, review, notification, baseline_counts = data

    rider_user = None
    staff_user = None
    extra_listing = None

    async def setup_extra() -> None:
        nonlocal rider_user, staff_user, extra_listing
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            async with session.begin_nested():
                rider_user = User(
                    email=f"rider-{uuid4()}@test.internal",
                    hashed_password=hash_password("Test-password-123"),
                    role=UserRole.RIDER,
                )
                staff_user = User(
                    email=f"staff-{uuid4()}@test.internal",
                    hashed_password=hash_password("Test-password-123"),
                    role=UserRole.HUB_STAFF,
                )
                session.add_all([rider_user, staff_user])
                await session.flush()

                extra_listing = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal("15.000"),
                    minimum_order_quantity=Decimal("1.000"),
                    unit="kg",
                    asking_price=Decimal("20.00"),
                    availability_status=AvailabilityStatus.AVAILABLE,
                )
                session.add(extra_listing)
                await session.flush()
            await session.commit()
        await engine.dispose()

    async def cleanup_extra() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            async with session.begin_nested():
                if extra_listing:
                    await session.execute(delete(CropListing).where(CropListing.id == extra_listing.id))
                user_ids = [u.id for u in [rider_user, staff_user] if u is not None]
                if user_ids:
                    await session.execute(delete(User).where(User.id.in_(user_ids)))
            await session.commit()
        await engine.dispose()

    try:
        asyncio.run(setup_extra())
        with TestClient(create_app()) as client:
            summary = client.get("/api/v1/admins/dashboard/summary", headers=auth_header(admin_user))
            assert summary.status_code == 200, summary.text
            payload = summary.json()

            # 1. Total genuine users must equal farmers + consumers
            assert payload["total_genuine_users"] == payload["total_farmers"] + payload["total_consumers"]
            # 2. Riders and Hub Staff must NOT be counted in farmers, consumers, or genuine users
            assert payload["total_farmers"] == baseline_counts["farmers"] + 1
            assert payload["total_consumers"] == baseline_counts["consumers"] + 1
            assert payload["total_genuine_users"] == (baseline_counts["farmers"] + 1) + (baseline_counts["consumers"] + 1)

            # Record listing counts with the extra available listing
            cum_listings_before = payload["total_listings"]
            active_listings_before = payload["active_listings"]

            # 3. Deactivate / delete the extra listing via farmer endpoint
            del_resp = client.delete(f"/api/v1/farmers/me/listings/{extra_listing.id}", headers=auth_header(farmer_user))
            assert del_resp.status_code == 204, del_resp.text

            # 4. Check updated summary: current listings and active listings both decrease by 1
            updated_summary = client.get("/api/v1/admins/dashboard/summary", headers=auth_header(admin_user))
            assert updated_summary.status_code == 200
            updated_payload = updated_summary.json()
            assert updated_payload["total_listings"] == cum_listings_before - 1
            assert updated_payload["active_listings"] == active_listings_before - 1
    finally:
        asyncio.run(cleanup_extra())
        cleanup_admin_data(data)
