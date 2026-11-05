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


def test_farmer_dashboard_statistics_after_crop_deletion() -> None:
    data = seed_dashboard_data()
    farmer_user, other_farmer_user, consumer_user, consumer_profile, farmer_profile, other_farmer_profile, crop, listing_one, listing_two, order_one, order_two, order_three, order_four = data
    try:
        with TestClient(create_app()) as client:
            # 1. Verify initial dashboard statistics reflect real database state (1 AVAILABLE, 1 SOLD_OUT)
            summary_before = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(farmer_user))
            assert summary_before.status_code == 200
            assert summary_before.json()["total_listings"] == 2
            assert summary_before.json()["active_listings"] == 1
            assert summary_before.json()["inactive_listings"] == 1

            listings_before = client.get("/api/v1/farmers/dashboard/listings", headers=auth_header(farmer_user))
            assert listings_before.status_code == 200
            assert len(listings_before.json()) == 2

            # 2. Delete the active listing (sets availability_status to UNAVAILABLE)
            delete_response = client.delete(
                f"/api/v1/farmers/me/listings/{listing_one.id}",
                headers=auth_header(farmer_user),
            )
            assert delete_response.status_code == 204

            # 3. Verify dashboard statistics immediately reflect deletion (1 total, 0 active, 1 inactive)
            summary_after = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(farmer_user))
            assert summary_after.status_code == 200
            summary_payload = summary_after.json()
            assert summary_payload["total_listings"] == 1
            assert summary_payload["active_listings"] == 0
            assert summary_payload["inactive_listings"] == 1

            # 4. Verify dashboard listings exclude the deleted listing
            listings_after = client.get("/api/v1/farmers/dashboard/listings", headers=auth_header(farmer_user))
            assert listings_after.status_code == 200
            listing_items = listings_after.json()
            assert len(listing_items) == 1
            assert listing_items[0]["id"] == str(listing_two.id)

            # 5. Delete the remaining sold listing
            delete_sold_response = client.delete(
                f"/api/v1/farmers/me/listings/{listing_two.id}",
                headers=auth_header(farmer_user),
            )
            assert delete_sold_response.status_code == 204

            # 6. Verify dashboard statistics reflect zero listings
            summary_empty = client.get("/api/v1/farmers/dashboard/summary", headers=auth_header(farmer_user))
            assert summary_empty.status_code == 200
            assert summary_empty.json()["total_listings"] == 0
            assert summary_empty.json()["active_listings"] == 0
            assert summary_empty.json()["inactive_listings"] == 0

            listings_empty = client.get("/api/v1/farmers/dashboard/listings", headers=auth_header(farmer_user))
            assert listings_empty.status_code == 200
            assert listings_empty.json() == []
    finally:
        cleanup_dashboard_data(data)


def test_farmer_listings_pagination_and_quality() -> None:
    async def setup_data():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            farmer_user = User(
                email=f"pagination-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            empty_farmer_user = User(
                email=f"empty-farmer-{uuid4()}@example.com",
                hashed_password=hash_password("Test-password-123"),
                role=UserRole.FARMER,
            )
            session.add_all([farmer_user, empty_farmer_user])
            await session.flush()

            farmer_profile = Farmer(user_id=farmer_user.id, name="Pagination Farmer")
            empty_farmer_profile = Farmer(user_id=empty_farmer_user.id, name="Empty Farmer")
            session.add_all([farmer_profile, empty_farmer_profile])
            await session.flush()

            crop = Crop(name=f"Paginated Crop {uuid4()}", category="Vegetable")
            session.add(crop)
            await session.flush()

            # Create 12 listings (> 10 records)
            listings = []
            base_time = datetime.now(timezone.utc)
            for i in range(12):
                cl = CropListing(
                    crop_id=crop.id,
                    farmer_id=farmer_profile.id,
                    quantity=Decimal(str(10 + i)),
                    minimum_order_quantity=Decimal("1"),
                    unit="kg",
                    asking_price=Decimal(str(20 + i)),
                    availability_status=AvailabilityStatus.AVAILABLE,
                    created_at=base_time + timedelta(minutes=i),
                )
                listings.append(cl)
            session.add_all(listings)
            await session.flush()
            await session.commit()
            return farmer_user, empty_farmer_user, farmer_profile, empty_farmer_profile, crop, listings

    farmer_user, empty_farmer_user, farmer_profile, empty_farmer_profile, crop, listings = asyncio.run(setup_data())

    try:
        with TestClient(create_app()) as client:
            # 1. Page 1: Limit 5, Offset 0 -> returns first 5 records of 12
            p1 = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true",
                headers=auth_header(farmer_user),
            )
            assert p1.status_code == 200, p1.text
            data1 = p1.json()
            assert data1["total"] == 12
            assert data1["limit"] == 5
            assert data1["offset"] == 0
            assert len(data1["items"]) == 5
            assert data1["stats"]["total"] == 12
            assert data1["stats"]["active"] == 12
            assert data1["stats"]["sold"] == 0

            # 2. Page 2: Limit 5, Offset 5 -> returns next 5 records
            p2 = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=5&exclude_unavailable=true",
                headers=auth_header(farmer_user),
            )
            assert p2.status_code == 200
            data2 = p2.json()
            assert data2["total"] == 12
            assert data2["limit"] == 5
            assert data2["offset"] == 5
            assert len(data2["items"]) == 5
            # Ensure items on page 2 differ from page 1
            p1_ids = {item["id"] for item in data1["items"]}
            p2_ids = {item["id"] for item in data2["items"]}
            assert p1_ids.isdisjoint(p2_ids)

            # 3. Page 3: Limit 5, Offset 10 -> returns remaining 2 records
            p3 = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=10&exclude_unavailable=true",
                headers=auth_header(farmer_user),
            )
            assert p3.status_code == 200
            data3 = p3.json()
            assert data3["total"] == 12
            assert len(data3["items"]) == 2

            # 4. Filters & Search:
            # Search matching crop name
            search_res = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true&search=Paginated",
                headers=auth_header(farmer_user),
            )
            assert search_res.status_code == 200
            assert search_res.json()["total"] == 12

            # Search non-matching crop name
            nonmatch_res = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true&search=NonExistentCrop123",
                headers=auth_header(farmer_user),
            )
            assert nonmatch_res.status_code == 200
            assert nonmatch_res.json()["total"] == 0
            assert nonmatch_res.json()["items"] == []

            # Update one listing to SOLD_OUT
            sold_item_id = data1["items"][0]["id"]
            patch_res = client.patch(
                f"/api/v1/farmers/me/listings/{sold_item_id}",
                headers=auth_header(farmer_user),
                json={"availability_status": "SOLD_OUT"},
            )
            assert patch_res.status_code == 200

            # Filter by active (should be 11)
            active_res = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true&status=active",
                headers=auth_header(farmer_user),
            )
            assert active_res.status_code == 200
            active_data = active_res.json()
            assert active_data["total"] == 11
            assert active_data["stats"]["total"] == 12
            assert active_data["stats"]["active"] == 11
            assert active_data["stats"]["sold"] == 1

            # Filter by sold (should be 1)
            sold_res = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true&status=sold",
                headers=auth_header(farmer_user),
            )
            assert sold_res.status_code == 200
            assert sold_res.json()["total"] == 1
            assert len(sold_res.json()["items"]) == 1

            # 5. Deletion: Delete the sold listing -> total drops to 11
            del_res = client.delete(f"/api/v1/farmers/me/listings/{sold_item_id}", headers=auth_header(farmer_user))
            assert del_res.status_code == 204

            p1_after_del = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true",
                headers=auth_header(farmer_user),
            )
            assert p1_after_del.status_code == 200
            assert p1_after_del.json()["total"] == 11
            assert p1_after_del.json()["stats"]["total"] == 11
            assert p1_after_del.json()["stats"]["active"] == 11
            assert p1_after_del.json()["stats"]["sold"] == 0
            # Deleted item no longer present
            assert sold_item_id not in [item["id"] for item in p1_after_del.json()["items"]]

            # 6. Empty state: Empty farmer has 0 records
            empty_res = client.get(
                "/api/v1/farmers/me/listings?limit=5&offset=0&exclude_unavailable=true",
                headers=auth_header(empty_farmer_user),
            )
            assert empty_res.status_code == 200
            assert empty_res.json()["total"] == 0
            assert empty_res.json()["items"] == []
    finally:
        async def cleanup():
            engine = build_engine(Settings())
            factory = async_sessionmaker(engine, expire_on_commit=False)
            async with factory() as session:
                await session.execute(delete(CropListing).where(CropListing.farmer_id == farmer_profile.id))
                await session.execute(delete(Crop).where(Crop.id == crop.id))
                await session.execute(delete(Farmer).where(Farmer.id.in_([farmer_profile.id, empty_farmer_profile.id])))
                await session.execute(delete(User).where(User.id.in_([farmer_user.id, empty_farmer_user.id])))
                await session.commit()
            await engine.dispose()

        asyncio.run(cleanup())
