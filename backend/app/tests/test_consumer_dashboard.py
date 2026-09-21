import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete
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


def seed_consumer_dashboard_data() -> tuple[User, User, User, Consumer, Consumer, Farmer, Crop, CropListing, Cart, Order, Order, Order, Order]:
    async def create() -> tuple[User, User, User, Consumer, Consumer, Farmer, Crop, CropListing, Cart, Order, Order, Order, Order]:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer_user = User(
                email=f"consumer-dashboard-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.CONSUMER,
            )
            other_consumer_user = User(
                email=f"consumer-other-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.CONSUMER,
            )
            farmer_user = User(
                email=f"consumer-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            session.add_all([consumer_user, other_consumer_user, farmer_user])
            await session.flush()

            consumer_profile = Consumer(user_id=consumer_user.id, name="Consumer Dashboard User")
            other_consumer_profile = Consumer(user_id=other_consumer_user.id, name="Other Consumer")
            farmer_profile = Farmer(user_id=farmer_user.id, name="Consumer Dashboard Farmer")
            session.add_all([consumer_profile, other_consumer_profile, farmer_profile])
            await session.flush()

            crop = Crop(name=f"Consumer Dashboard Crop {uuid4()}", category="Vegetable")
            session.add(crop)
            await session.flush()

            listing = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("50"),
                minimum_order_quantity=Decimal("1"),
                unit="kg",
                asking_price=Decimal("12"),
                availability_status=AvailabilityStatus.AVAILABLE,
            )
            session.add(listing)
            await session.flush()

            cart = Cart(consumer_id=consumer_profile.id)
            session.add(cart)
            await session.flush()
            session.add(CartItem(cart_id=cart.id, listing_id=listing.id, quantity=Decimal("2")))

            now = datetime.now(timezone.utc)
            order_pending = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.PENDING,
                total_amount=Decimal("24.00"),
                created_at=now,
            )
            order_confirmed = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.CONFIRMED,
                total_amount=Decimal("36.00"),
                created_at=now + timedelta(minutes=1),
            )
            order_completed = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.COMPLETED,
                total_amount=Decimal("48.00"),
                created_at=now + timedelta(minutes=2),
            )
            order_cancelled = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.CANCELLED,
                total_amount=Decimal("12.00"),
                created_at=now + timedelta(minutes=3),
            )
            other_order = Order(
                consumer_id=other_consumer_profile.id,
                status=OrderStatus.COMPLETED,
                total_amount=Decimal("18.00"),
                created_at=now + timedelta(minutes=4),
            )
            session.add_all([order_pending, order_confirmed, order_completed, order_cancelled, other_order])
            await session.flush()

            session.add_all(
                [
                    OrderItem(order_id=order_pending.id, listing_id=listing.id, quantity=Decimal("2"), unit_price=Decimal("12"), subtotal=Decimal("24.00")),
                    OrderItem(order_id=order_confirmed.id, listing_id=listing.id, quantity=Decimal("3"), unit_price=Decimal("12"), subtotal=Decimal("36.00")),
                    OrderItem(order_id=order_completed.id, listing_id=listing.id, quantity=Decimal("4"), unit_price=Decimal("12"), subtotal=Decimal("48.00")),
                    OrderItem(order_id=order_cancelled.id, listing_id=listing.id, quantity=Decimal("1"), unit_price=Decimal("12"), subtotal=Decimal("12.00")),
                    OrderItem(order_id=other_order.id, listing_id=listing.id, quantity=Decimal("1"), unit_price=Decimal("18"), subtotal=Decimal("18.00")),
                ]
            )
            session.add(
                Payment(
                    order_id=order_completed.id,
                    amount=Decimal("48.00"),
                    status=PaymentStatus.SUCCESSFUL,
                    provider_reference=f"pay-{uuid4()}",
                    payment_method="TEST_SANDBOX",
                    is_test=True,
                )
            )
            session.add(
                Notification(
                    user_id=consumer_user.id,
                    notification_type=NotificationType.ORDER,
                    title="Order update",
                    message="Your order has been confirmed.",
                    related_entity_type="order",
                    related_entity_id=order_confirmed.id,
                    is_read=False,
                )
            )
            session.add(
                Review(
                    consumer_id=consumer_profile.id,
                    order_id=order_completed.id,
                    listing_id=listing.id,
                    rating=5,
                    comment="Great service",
                )
            )
            await session.commit()

            for item in [
                consumer_user,
                other_consumer_user,
                farmer_user,
                consumer_profile,
                other_consumer_profile,
                farmer_profile,
                crop,
                listing,
                cart,
                order_pending,
                order_confirmed,
                order_completed,
                order_cancelled,
                other_order,
            ]:
                await session.refresh(item)
        await engine.dispose()
        return (
            consumer_user,
            other_consumer_user,
            farmer_user,
            consumer_profile,
            other_consumer_profile,
            farmer_profile,
            crop,
            listing,
            cart,
            order_pending,
            order_confirmed,
            order_completed,
            order_cancelled,
            other_order,
        )

    return asyncio.run(create())


def cleanup_consumer_dashboard_data(data):
    (
        consumer_user,
        other_consumer_user,
        farmer_user,
        consumer_profile,
        other_consumer_profile,
        farmer_profile,
        crop,
        listing,
        cart,
        order_pending,
        order_confirmed,
        order_completed,
        order_cancelled,
        other_order,
    ) = data

    async def remove() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(Notification).where(Notification.user_id.in_([consumer_user.id, other_consumer_user.id, farmer_user.id])))
            await session.execute(delete(Review).where(Review.consumer_id.in_([consumer_profile.id, other_consumer_profile.id])))
            await session.execute(delete(Payment).where(Payment.order_id.in_([order_pending.id, order_confirmed.id, order_completed.id, order_cancelled.id, other_order.id])))
            await session.execute(delete(OrderItem).where(OrderItem.order_id.in_([order_pending.id, order_confirmed.id, order_completed.id, order_cancelled.id, other_order.id])))
            await session.execute(delete(Order).where(Order.id.in_([order_pending.id, order_confirmed.id, order_completed.id, order_cancelled.id, other_order.id])))
            await session.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
            await session.execute(delete(Cart).where(Cart.id == cart.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer_user.id, other_consumer_user.id])))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([consumer_user.id, other_consumer_user.id, farmer_user.id])))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_consumer_dashboard_sections_and_data_isolation() -> None:
    data = seed_consumer_dashboard_data()
    (
        consumer_user,
        other_consumer_user,
        farmer_user,
        consumer_profile,
        other_consumer_profile,
        farmer_profile,
        crop,
        listing,
        cart,
        order_pending,
        order_confirmed,
        order_completed,
        order_cancelled,
        other_order,
    ) = data

    try:
        with TestClient(create_app()) as client:
            summary = client.get("/api/v1/consumers/dashboard/summary", headers=auth_header(consumer_user))
            assert summary.status_code == 200, summary.text
            summary_payload = summary.json()
            assert summary_payload["total_orders"] == 4
            assert summary_payload["pending_orders"] == 1
            assert summary_payload["confirmed_orders"] == 1
            assert summary_payload["completed_orders"] == 1
            assert summary_payload["cancelled_orders"] == 1
            assert summary_payload["total_purchase_value"] == "120.00"
            assert summary_payload["unread_notification_count"] == 1
            assert len(summary_payload["recent_orders"]) == 4
            assert len(summary_payload["recent_activity"]) >= 1

            orders = client.get("/api/v1/consumers/dashboard/orders", headers=auth_header(consumer_user))
            assert orders.status_code == 200, orders.text
            orders_payload = orders.json()
            assert len(orders_payload) == 4
            assert orders_payload[0]["status"] == "CANCELLED"
            assert orders_payload[0]["payment_status"] == "PENDING"
            assert orders_payload[0]["delivery_status"] == "PENDING"

            purchase_history = client.get("/api/v1/consumers/dashboard/purchase-history", headers=auth_header(consumer_user))
            assert purchase_history.status_code == 200, purchase_history.text
            purchase_payload = purchase_history.json()
            assert len(purchase_payload) == 1
            assert purchase_payload[0]["crop_name"] == crop.name
            assert purchase_payload[0]["payment_status"] == "SUCCESSFUL"
            assert purchase_payload[0]["fulfillment_status"] == "PENDING"

            cart_summary = client.get("/api/v1/consumers/dashboard/cart-summary", headers=auth_header(consumer_user))
            assert cart_summary.status_code == 200, cart_summary.text
            cart_payload = cart_summary.json()
            assert cart_payload["item_count"] == 1
            assert cart_payload["total_quantity"] == "2"
            assert cart_payload["subtotal"] == "24.00"

            reviews = client.get("/api/v1/consumers/dashboard/reviews", headers=auth_header(consumer_user))
            assert reviews.status_code == 200, reviews.text
            reviews_payload = reviews.json()
            assert len(reviews_payload) == 1
            assert reviews_payload[0]["rating"] == 5

            notifications = client.get("/api/v1/consumers/dashboard/notifications", headers=auth_header(consumer_user))
            assert notifications.status_code == 200, notifications.text
            notifications_payload = notifications.json()
            assert notifications_payload["total"] >= 1

            profile = client.get("/api/v1/consumers/me", headers=auth_header(consumer_user))
            assert profile.status_code == 200, profile.text
            assert profile.json()["name"] == consumer_profile.name

            other_summary = client.get("/api/v1/consumers/dashboard/summary", headers=auth_header(other_consumer_user))
            assert other_summary.status_code == 200, other_summary.text
            assert other_summary.json()["total_orders"] == 1
            assert other_summary.json()["completed_orders"] == 1

            farmer_access = client.get("/api/v1/consumers/dashboard/summary", headers=auth_header(farmer_user))
            assert farmer_access.status_code == 403
    finally:
        cleanup_consumer_dashboard_data(data)


def test_consumer_dashboard_empty_state() -> None:
    data = seed_consumer_dashboard_data()
    (
        consumer_user,
        other_consumer_user,
        farmer_user,
        consumer_profile,
        other_consumer_profile,
        farmer_profile,
        crop,
        listing,
        cart,
        order_pending,
        order_confirmed,
        order_completed,
        order_cancelled,
        other_order,
    ) = data

    async def create_empty_consumer() -> User:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            empty_user = User(
                email=f"consumer-empty-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.CONSUMER,
            )
            session.add(empty_user)
            await session.flush()
            session.add(Consumer(user_id=empty_user.id, name="Empty Consumer"))
            await session.commit()
            await session.refresh(empty_user)
        await engine.dispose()
        return empty_user

    empty_consumer = asyncio.run(create_empty_consumer())

    try:
        with TestClient(create_app()) as client:
            summary = client.get("/api/v1/consumers/dashboard/summary", headers=auth_header(empty_consumer))
            assert summary.status_code == 200, summary.text
            summary_payload = summary.json()
            assert summary_payload["total_orders"] == 0
            assert summary_payload["pending_orders"] == 0
            assert summary_payload["confirmed_orders"] == 0
            assert summary_payload["completed_orders"] == 0
            assert summary_payload["cancelled_orders"] == 0
            assert summary_payload["total_purchase_value"] == "0.00"
            assert summary_payload["unread_notification_count"] == 0
            assert summary_payload["recent_orders"] == []
            assert summary_payload["recent_activity"] == []

            orders = client.get("/api/v1/consumers/dashboard/orders", headers=auth_header(empty_consumer))
            assert orders.status_code == 200
            assert orders.json() == []

            purchase_history = client.get("/api/v1/consumers/dashboard/purchase-history", headers=auth_header(empty_consumer))
            assert purchase_history.status_code == 200
            assert purchase_history.json() == []

            cart_summary = client.get("/api/v1/consumers/dashboard/cart-summary", headers=auth_header(empty_consumer))
            assert cart_summary.status_code == 200
            assert cart_summary.json()["item_count"] == 0
            assert cart_summary.json()["total_quantity"] == "0"
            assert cart_summary.json()["subtotal"] == "0.00"

            reviews = client.get("/api/v1/consumers/dashboard/reviews", headers=auth_header(empty_consumer))
            assert reviews.status_code == 200
            assert reviews.json() == []

            notifications = client.get("/api/v1/consumers/dashboard/notifications", headers=auth_header(empty_consumer))
            assert notifications.status_code == 200
            assert notifications.json()["total"] == 0

            profile = client.get("/api/v1/consumers/me", headers=auth_header(empty_consumer))
            assert profile.status_code == 200
            assert profile.json()["name"] == "Empty Consumer"
    finally:
        cleanup_consumer_dashboard_data(data)

        async def remove_empty_consumer() -> None:
            engine = build_engine(Settings())
            factory = async_sessionmaker(engine, expire_on_commit=False)
            async with factory() as session:
                await session.execute(delete(Consumer).where(Consumer.user_id == empty_consumer.id))
                await session.execute(delete(User).where(User.id == empty_consumer.id))
                await session.commit()
            await engine.dispose()

        asyncio.run(remove_empty_consumer())
