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
    Order,
    OrderItem,
    OrderStatus,
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
            consumer = User(email=f"reviews-consumer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            other = User(email=f"reviews-other-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.CONSUMER)
            farmer = User(email=f"reviews-farmer-{uuid4()}@example.com", hashed_password=hash_password("Test-password-123"), role=UserRole.FARMER)
            session.add_all([consumer, other, farmer])
            await session.flush()
            consumer_profile = Consumer(user_id=consumer.id, name="Review Consumer")
            other_profile = Consumer(user_id=other.id, name="Other Consumer")
            farmer_profile = Farmer(user_id=farmer.id, name="Review Farmer")
            session.add_all([consumer_profile, other_profile, farmer_profile])
            await session.flush()
            crop = Crop(name=f"Review Crop {uuid4()}", category="Vegetable")
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
            await session.commit()
            for item in [consumer, other, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order]:
                await session.refresh(item)
        await engine.dispose()
        return consumer, other, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order

    return asyncio.run(create())


def cleanup(data):
    consumer, other, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data

    async def remove():
        engine = build_engine(Settings())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(delete(Review).where(Review.order_id == order.id))
            await session.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
            await session.execute(delete(Order).where(Order.id == order.id))
            await session.execute(delete(CropListing).where(CropListing.id == listing.id))
            await session.execute(delete(Crop).where(Crop.id == crop.id))
            await session.execute(delete(Consumer).where(Consumer.user_id.in_([consumer.id, other.id])))
            await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
            await session.execute(delete(User).where(User.id.in_([consumer.id, other.id, farmer.id])))
            await session.commit()
        await engine.dispose()

    asyncio.run(remove())


def test_create_valid_review_and_aggregate_summary():
    data = seed()
    consumer, other, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    try:
        with TestClient(create_app()) as client:
            valid = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 5, "comment": "Fresh and well packed"},
            )
            assert valid.status_code == 201, valid.text
            review = valid.json()
            assert review["rating"] == 5
            assert review["comment"] == "Fresh and well packed"
            assert review["consumer_id"] == str(consumer_profile.id)

            listing_reviews = client.get(f"/api/v1/listings/{listing.id}/reviews")
            assert listing_reviews.status_code == 200
            assert len(listing_reviews.json()["items"]) == 1

            farmer_summary = client.get(f"/api/v1/farmers/{farmer_profile.id}/rating-summary")
            assert farmer_summary.status_code == 200
            assert farmer_summary.json()["average_rating"] == 5.0
            assert farmer_summary.json()["review_count"] == 1

            detail = client.get(f"/api/v1/reviews/{review['id']}")
            assert detail.status_code == 200
            assert detail.json()["comment"] == "Fresh and well packed"
    finally:
        cleanup(data)


def test_review_input_validation_and_purchase_eligibility():
    data = seed()
    consumer, other, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    try:
        with TestClient(create_app()) as client:
            invalid_rating = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 0, "comment": "Bad rating"},
            )
            assert invalid_rating.status_code == 422

            invalid_comment = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 4, "comment": ""},
            )
            assert invalid_comment.status_code == 422

            pending_order = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 4, "comment": "Pending review"},
            )
            assert pending_order.status_code == 201

            async def set_order_to_confirmed():
                engine = build_engine(Settings())
                factory = async_sessionmaker(engine, expire_on_commit=False)
                async with factory() as session:
                    row = await session.get(Order, order.id)
                    row.status = OrderStatus.CONFIRMED
                    await session.commit()
                await engine.dispose()

            asyncio.run(set_order_to_confirmed())

            unpurchased_listing = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(uuid4()), "order_id": str(order.id), "rating": 4, "comment": "Not purchased"},
            )
            assert unpurchased_listing.status_code == 409

            unique_review_on_other_order = client.post(
                "/api/v1/reviews",
                headers=header(other),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 4, "comment": "Should fail"},
            )
            assert unique_review_on_other_order.status_code == 404

            farmer_attempt = client.post(
                "/api/v1/reviews",
                headers=header(farmer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 4, "comment": "Farmer review"},
            )
            assert farmer_attempt.status_code == 403
    finally:
        cleanup(data)


def test_duplicate_review_edit_and_delete_permissions():
    data = seed()
    consumer, other, farmer, consumer_profile, other_profile, farmer_profile, crop, listing, order = data
    try:
        with TestClient(create_app()) as client:
            first = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 5, "comment": "Original"},
            )
            review_id = first.json()["id"]
            duplicate = client.post(
                "/api/v1/reviews",
                headers=header(consumer),
                json={"listing_id": str(listing.id), "order_id": str(order.id), "rating": 4, "comment": "Duplicate"},
            )
            assert duplicate.status_code == 409

            update = client.patch(
                f"/api/v1/reviews/{review_id}",
                headers=header(consumer),
                json={"rating": 4, "comment": "Updated review"},
            )
            assert update.status_code == 200
            assert update.json()["comment"] == "Updated review"

            forbidden_update = client.patch(
                f"/api/v1/reviews/{review_id}",
                headers=header(other),
                json={"comment": "Other user edit"},
            )
            assert forbidden_update.status_code == 403

            delete = client.delete(f"/api/v1/reviews/{review_id}", headers=header(consumer))
            assert delete.status_code == 200
            assert delete.json()["deleted"] is True

            after_delete = client.get(f"/api/v1/reviews/{review_id}")
            assert after_delete.status_code == 404
    finally:
        cleanup(data)
