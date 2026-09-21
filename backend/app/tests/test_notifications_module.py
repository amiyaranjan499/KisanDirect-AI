import asyncio
import sys
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
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Notification,
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


def header(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role, Settings())}"}


def seed():
    async def create():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            consumer = User(email=f"notif-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            other_consumer = User(email=f"notif-other-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            farmer = User(email=f"notif-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            session.add_all([consumer, other_consumer, farmer])
            await session.flush()
            consumer_profile = Consumer(user_id=consumer.id, name="Notification Consumer")
            other_profile = Consumer(user_id=other_consumer.id, name="Other Consumer")
            farmer_profile = Farmer(user_id=farmer.id, name="Notification Farmer")
            session.add_all([consumer_profile, other_profile, farmer_profile])
            await session.flush()
            crop = Crop(name=f"Notification Crop {uuid4()}", category="Vegetable")
            session.add(crop)
            await session.flush()
            listing = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("25"),
                minimum_order_quantity=Decimal("1"),
                unit="kg",
                asking_price=Decimal("12"),
                availability_status=AvailabilityStatus.AVAILABLE,
            )
            session.add(listing)
            await session.flush()
            order = Order(consumer_id=consumer_profile.id, status=OrderStatus.COMPLETED, total_amount=Decimal("24.00"))
            session.add(order)
            await session.flush()
            session.add(OrderItem(order_id=order.id, listing_id=listing.id, quantity=Decimal("2"), unit_price=Decimal("12"), subtotal=Decimal("24.00")))
            session.add(Payment(order_id=order.id, amount=Decimal("24.00"), status=PaymentStatus.SUCCESSFUL, provider_reference=f"test-{uuid4()}", payment_method="TEST_SANDBOX", is_test=True))
            await session.commit()
            for item in [consumer, other_consumer, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order]:
                await session.refresh(item)
        await engine.dispose()
        return consumer, other_consumer, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order

    return asyncio.run(create())


def cleanup(data):
    consumer, other_consumer, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data

    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(Notification).where(Notification.user_id.in_([consumer.id, other_consumer.id, farmer.id])))
            await session.execute(delete(Review).where(Review.order_id == order.id))
            await session.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
            await session.execute(delete(Payment).where(Payment.order_id == order.id))
            await session.execute(delete(Order).where(Order.id == order.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer.id, other_consumer.id])))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([consumer.id, other_consumer.id, farmer.id])))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_notification_creation_retrieval_and_read_states():
    data = seed()
    consumer, other_consumer, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    try:
        with TestClient(create_app()) as client:
            list_response = client.get("/api/v1/notifications", headers=header(consumer))
            assert list_response.status_code == 200
            assert list_response.json()["items"] == []

            create_response = client.post(
                "/api/v1/notifications/test-create",
                headers=header(consumer),
                json={
                    "notification_type": "ORDER",
                    "title": "Order created",
                    "message": "Your order is in progress.",
                    "related_entity_type": "order",
                    "related_entity_id": str(order.id),
                },
            )
            assert create_response.status_code == 201, create_response.text
            payload = create_response.json()
            assert payload["notification_type"] == "ORDER"
            assert payload["user_id"] == str(consumer.id)

            details = client.get(f"/api/v1/notifications/{payload['id']}", headers=header(consumer))
            assert details.status_code == 200
            assert details.json()["is_read"] is False

            mark = client.patch(f"/api/v1/notifications/{payload['id']}/read", headers=header(consumer))
            assert mark.status_code == 200
            assert mark.json()["is_read"] is True

            unread = client.get("/api/v1/notifications", headers=header(consumer), params={"unread_only": True})
            assert unread.status_code == 200
            assert unread.json()["total"] == 0

            read_all = client.post("/api/v1/notifications/read-all", headers=header(consumer))
            assert read_all.status_code == 200
            assert read_all.json()["marked"] == 0
    finally:
        cleanup(data)


def test_notification_authorization_and_cross_user_access_prevention():
    data = seed()
    consumer, other_consumer, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    try:
        with TestClient(create_app()) as client:
            create_response = client.post(
                "/api/v1/notifications/test-create",
                headers=header(consumer),
                json={
                    "notification_type": "ORDER",
                    "title": "Order created",
                    "message": "Your order is in progress.",
                    "related_entity_type": "order",
                    "related_entity_id": str(order.id),
                },
            )
            assert create_response.status_code == 201
            notification_id = create_response.json()["id"]

            cross_user = client.get(f"/api/v1/notifications/{notification_id}", headers=header(other_consumer))
            assert cross_user.status_code == 404

            farmer_list = client.get("/api/v1/notifications", headers=header(farmer))
            assert farmer_list.status_code == 200
            assert farmer_list.json()["total"] == 0
    finally:
        cleanup(data)


def test_notification_generation_from_order_and_review_events():
    data = seed()
    consumer, other_consumer, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    try:
        with TestClient(create_app()) as client:
            order_notification = client.get("/api/v1/notifications", headers=header(farmer))
            assert order_notification.status_code == 200
            assert order_notification.json()["total"] == 0

            review = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 5, "comment": "Great quality"},
            )
            assert review.status_code == 201

            farmer_notifications = client.get("/api/v1/notifications", headers=header(farmer))
            assert farmer_notifications.status_code == 200
            assert farmer_notifications.json()["total"] >= 1
    finally:
        cleanup(data)
