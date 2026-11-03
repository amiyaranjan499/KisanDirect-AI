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
    AIPricePrediction,
    AIQualityPrediction,
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Notification,
    NotificationType,
    Order,
    OrderItem,
    OrderStatus,
    Review,
    User,
    UserRole,
)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


def seed_dashboard_data() -> tuple[User, User, User, Consumer, Farmer, Farmer, Crop, CropListing, CropListing, Order, Order, Order, Order]:
    async def create() -> tuple[User, User, User, Consumer, Farmer, Farmer, Crop, CropListing, CropListing, Order, Order, Order, Order]:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(email=f"dashboard-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            other_farmer_user = User(email=f"dashboard-other-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            consumer_user = User(email=f"dashboard-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            session.add_all([farmer_user, other_farmer_user, consumer_user])
            await session.flush()

            farmer_profile = Farmer(user_id=farmer_user.id, name="Dashboard Farmer")
            other_farmer_profile = Farmer(user_id=other_farmer_user.id, name="Other Dashboard Farmer")
            consumer_profile = Consumer(user_id=consumer_user.id, name="Dashboard Consumer")
            session.add_all([farmer_profile, other_farmer_profile, consumer_profile])
            await session.flush()

            crop = Crop(name=f"Dashboard Crop {uuid4()}", category="Vegetable")
            session.add(crop)
            await session.flush()

            base_time = datetime.now(timezone.utc)
            listing_one = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("30"),
                minimum_order_quantity=Decimal("1"),
                unit="kg",
                asking_price=Decimal("14"),
                availability_status=AvailabilityStatus.AVAILABLE,
                created_at=base_time + timedelta(minutes=1),
            )
            listing_two = CropListing(
                crop_id=crop.id,
                farmer_id=farmer_profile.id,
                quantity=Decimal("1"),
                minimum_order_quantity=Decimal("1"),
                unit="kg",
                asking_price=Decimal("16"),
                availability_status=AvailabilityStatus.SOLD_OUT,
                created_at=base_time,
            )
            session.add_all([listing_one, listing_two])
            await session.flush()

            order_one = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.PENDING,
                total_amount=Decimal("20.00"),
                created_at=base_time,
            )
            order_two = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.CONFIRMED,
                total_amount=Decimal("30.00"),
                created_at=base_time + timedelta(minutes=1),
            )
            order_three = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.COMPLETED,
                total_amount=Decimal("50.00"),
                created_at=base_time + timedelta(minutes=2),
            )
            order_four = Order(
                consumer_id=consumer_profile.id,
                status=OrderStatus.CANCELLED,
                total_amount=Decimal("10.00"),
                created_at=base_time + timedelta(minutes=3),
            )
            session.add_all([order_one, order_two, order_three, order_four])
            await session.flush()

            session.add_all(
                [
                    OrderItem(order_id=order_one.id, listing_id=listing_one.id, quantity=Decimal("2"), unit_price=Decimal("10"), subtotal=Decimal("20.00")),
                    OrderItem(order_id=order_two.id, listing_id=listing_one.id, quantity=Decimal("3"), unit_price=Decimal("10"), subtotal=Decimal("30.00")),
                    OrderItem(order_id=order_three.id, listing_id=listing_two.id, quantity=Decimal("5"), unit_price=Decimal("10"), subtotal=Decimal("50.00")),
                    OrderItem(order_id=order_four.id, listing_id=listing_one.id, quantity=Decimal("1"), unit_price=Decimal("10"), subtotal=Decimal("10.00")),
                ]
            )

            session.add(
                Notification(
                    user_id=farmer_user.id,
                    notification_type=NotificationType.ORDER,
                    title="Order update",
                    message="One of your orders was updated.",
                    related_entity_type="order",
                    related_entity_id=order_two.id,
                    is_read=False,
                )
            )
            session.add(
                Review(
                    consumer_id=consumer_profile.id,
                    order_id=order_three.id,
                    listing_id=listing_two.id,
                    rating=5,
                    comment="Great quality",
                )
            )
            session.add(
                AIQualityPrediction(
                    listing_id=listing_one.id,
                    model_name="prototype-quality",
                    model_version="v1",
                    quality_label="Good",
                    prediction_status="SUCCESS",
                    confidence=Decimal("0.91"),
                    result_metadata={"quality": "Good"},
                )
            )
            session.add(
                AIPricePrediction(
                    listing_id=listing_one.id,
                    model_name="prototype-price",
                    model_version="v1",
                    predicted_price=Decimal("16.00"),
                    currency="INR",
                    unit="kg",
                    prediction_status="SUCCESS",
                    confidence=Decimal("0.87"),
                    result_metadata={"recommended_range": {"min": 14, "max": 16}},
                )
            )
            await session.commit()
            for item in [farmer_user, other_farmer_user, consumer_user, consumer_profile, farmer_profile, other_farmer_profile, crop, listing_one, listing_two, order_one, order_two, order_three, order_four]:
                await session.refresh(item)
        await engine.dispose()
        return farmer_user, other_farmer_user, consumer_user, consumer_profile, farmer_profile, other_farmer_profile, crop, listing_one, listing_two, order_one, order_two, order_three, order_four

    return asyncio.run(create())


def cleanup_dashboard_data(data):
    farmer_user, other_farmer_user, consumer_user, consumer_profile, farmer_profile, other_farmer_profile, crop, listing_one, listing_two, order_one, order_two, order_three, order_four = data

    async def remove() -> None:
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(Notification).where(Notification.user_id.in_([farmer_user.id, other_farmer_user.id, consumer_user.id])))
            await session.execute(delete(Review).where(Review.order_id.in_([order_one.id, order_two.id, order_three.id, order_four.id])))
            await session.execute(delete(AIPricePrediction).where(AIPricePrediction.listing_id.in_([listing_one.id, listing_two.id])))
            await session.execute(delete(AIQualityPrediction).where(AIQualityPrediction.listing_id.in_([listing_one.id, listing_two.id])))
            await session.execute(delete(OrderItem).where(OrderItem.order_id.in_([order_one.id, order_two.id, order_three.id, order_four.id])))
            await session.execute(delete(Order).where(Order.id.in_([order_one.id, order_two.id, order_three.id, order_four.id])))
            await session.execute(delete(CropListing).where(CropListing.id.in_([listing_one.id, listing_two.id])))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer_user.id])))
            await session.execute(delete(Farmer).where(Farmer.id.in_([farmer_profile.id, other_farmer_profile.id])))
            await session.execute(delete(User).where(User.id.in_([farmer_user.id, other_farmer_user.id, consumer_user.id])))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_farmer_dashboard_summary_and_sections() -> None:
    data = seed_dashboard_data()
    farmer_user, other_farmer_user, consumer_user, consumer_profile, farmer_profile, other_farmer_profile, crop, listing_one, listing_two, order_one, order_two, order_three, order_four = data
    try:
        with TestClient(create_app()) as client:
            summary = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(farmer_user))
            assert summary.status_code == 200, summary.text
            summary_payload = summary.json()
            assert summary_payload["total_listings"] == 2
            assert summary_payload["active_listings"] == 1
            assert summary_payload["inactive_listings"] == 1
            assert summary_payload["total_orders_received"] == 4
            assert summary_payload["pending_orders"] == 1
            assert summary_payload["confirmed_orders"] == 1
            assert summary_payload["completed_orders"] == 1
            assert summary_payload["cancelled_orders"] == 1
            assert summary_payload["total_sales"] == "110.00"
            assert summary_payload["average_rating"] == 5.0
            assert summary_payload["total_reviews"] == 1
            assert summary_payload["unread_notification_count"] == 1

            listings = client.get("/api/v1/farmers/dashboard/listings", headers=auth_header(farmer_user))
            assert listings.status_code == 200
            listing_payload = listings.json()
            assert len(listing_payload) == 2
            assert listing_payload[0]["crop_name"] == crop.name
            assert listing_payload[0]["availability_status"] in {"AVAILABLE", "SOLD_OUT"}
            assert listing_payload[0]["ai_quality_label"] == "Good"
            assert listing_payload[0]["ai_price_predicted_price"] == "16.00"

            orders = client.get("/api/v1/farmers/dashboard/orders", headers=auth_header(farmer_user))
            assert orders.status_code == 200
            order_payload = orders.json()
            assert len(order_payload) == 4
            assert order_payload[0]["status"] == "CANCELLED"

            analytics = client.get("/api/v1/farmers/dashboard/analytics", headers=auth_header(farmer_user))
            assert analytics.status_code == 200
            analytics_payload = analytics.json()
            assert analytics_payload["total_sales"] == "110.00"
            assert analytics_payload["orders_by_status"]["PENDING"] == 1
            assert analytics_payload["crop_wise_order_count"][crop.name] == 4
            assert analytics_payload["crop_wise_sales"][crop.name] == "110.00"
            assert len(analytics_payload["recent_orders"]) == 4
            assert len(analytics_payload["recent_activity"]) >= 1

            reviews = client.get("/api/v1/farmers/dashboard/reviews", headers=auth_header(farmer_user))
            assert reviews.status_code == 200
            reviews_payload = reviews.json()
            assert reviews_payload["average_rating"] == 5.0
            assert reviews_payload["review_count"] == 1
            assert len(reviews_payload["recent_reviews"]) == 1

            ai_summary = client.get("/api/v1/farmers/dashboard/ai-summary", headers=auth_header(farmer_user))
            assert ai_summary.status_code == 200
            ai_payload = ai_summary.json()
            assert len(ai_payload["quality_assessments"]) == 1
            assert ai_payload["quality_assessments"][0]["quality_label"] == "Good"
            assert len(ai_payload["price_predictions"]) == 1
            assert ai_payload["price_predictions"][0]["predicted_price"] == "16.00"

            other_farmer_summary = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(other_farmer_user))
            assert other_farmer_summary.status_code == 200
            assert other_farmer_summary.json()["total_listings"] == 0
            assert other_farmer_summary.json()["total_orders_received"] == 0

            consumer_access = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(consumer_user))
            assert consumer_access.status_code == 403
    finally:
        cleanup_dashboard_data(data)


def test_farmer_dashboard_empty_state() -> None:
    data = seed_dashboard_data()
    farmer_user, other_farmer_user, consumer_user, consumer_profile, farmer_profile, other_farmer_profile, crop, listing_one, listing_two, order_one, order_two, order_three, order_four = data
    try:
        with TestClient(create_app()) as client:
            empty_response = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(other_farmer_user))
            assert empty_response.status_code == 200
            empty_payload = empty_response.json()
            assert empty_payload["total_listings"] == 0
            assert empty_payload["active_listings"] == 0
            assert empty_payload["inactive_listings"] == 0
            assert empty_payload["total_orders_received"] == 0
            assert empty_payload["total_sales"] == "0.00"
            assert empty_payload["average_rating"] is None
            assert empty_payload["total_reviews"] == 0
            assert empty_payload["unread_notification_count"] == 0

            empty_orders = client.get("/api/v1/farmers/dashboard/orders", headers=auth_header(other_farmer_user))
            assert empty_orders.status_code == 200
            assert empty_orders.json() == []
    finally:
        cleanup_dashboard_data(data)
