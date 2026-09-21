from uuid import UUID

from backend.app.models import NotificationType, OrderStatus, Review
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.reviews_repository import ReviewsRepository
from backend.app.schemas.reviews import FarmerRatingSummary, ReviewCreate, ReviewListPage, ReviewResponse, ReviewUpdate


class ReviewsService:
    def __init__(self, repository: ReviewsRepository, consumer_repository: ConsumerRepository, notification_service=None) -> None:
        self.repository = repository
        self.consumer_repository = consumer_repository
        self.notification_service = notification_service

    async def create(self, user_id: UUID, payload: ReviewCreate) -> ReviewResponse:
        consumer = await self.consumer_repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        if payload.rating < 1 or payload.rating > 5:
            raise ValueError("Rating must be between 1 and 5")
        if not payload.comment or not payload.comment.strip():
            raise ValueError("Review comment is required")

        order = await self.repository.get_order_for_consumer(payload.order_id, consumer.id)
        if order is None:
            raise LookupError("Order not found")

        if order.status not in {OrderStatus.COMPLETED, OrderStatus.DELIVERED}:
            raise ValueError("Only completed or delivered orders can receive reviews")

        order_item = await self.repository.get_order_item_for_listing(payload.order_id, payload.listing_id)
        if order_item is None:
            raise ValueError("The selected listing was not part of this order")

        if order_item.listing.farmer.user_id == consumer.user_id:
            raise PermissionError("Farmers cannot review their own listings")

        if await self.repository.review_exists(consumer.id, payload.order_id, payload.listing_id):
            raise ValueError("A review already exists for this order and listing")

        review = Review(
            consumer_id=consumer.id,
            order_id=payload.order_id,
            listing_id=payload.listing_id,
            rating=payload.rating,
            comment=payload.comment.strip(),
        )

        created = await self.repository.create(review)
        await self._notify_review_submitted(created)
        return self._response(created)

    async def list_for_listing(self, listing_id: UUID) -> ReviewListPage:
        reviews = await self.repository.list_for_listing(listing_id)
        return ReviewListPage(
            items=[self._response(review) for review in reviews],
            total=len(reviews),
            page=1,
            page_size=len(reviews),
            pages=1 if reviews else 0,
        )

    async def list_for_farmer(self, farmer_id: UUID) -> ReviewListPage:
        reviews = await self.repository.list_for_farmer(farmer_id)
        return ReviewListPage(
            items=[self._response(review) for review in reviews],
            total=len(reviews),
            page=1,
            page_size=len(reviews),
            pages=1 if reviews else 0,
        )

    async def get(self, review_id: UUID) -> ReviewResponse:
        review = await self.repository.get_review(review_id)
        if review is None:
            raise LookupError("Review not found")
        return self._response(review)

    async def update(self, user_id: UUID, review_id: UUID, payload: ReviewUpdate) -> ReviewResponse:
        consumer = await self.consumer_repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        existing = await self.repository.get_review_for_consumer(review_id, consumer.id)
        if existing is None:
            raise PermissionError("You can only edit your own reviews")

        if payload.rating is not None:
            if payload.rating < 1 or payload.rating > 5:
                raise ValueError("Rating must be between 1 and 5")
            existing.rating = payload.rating

        if payload.comment is not None:
            if not payload.comment.strip():
                raise ValueError("Review comment is required")
            existing.comment = payload.comment.strip()

        await self.repository.update(existing)
        return self._response(existing)

    async def delete(self, user_id: UUID, review_id: UUID) -> dict[str, bool]:
        consumer = await self.consumer_repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        existing = await self.repository.get_review_for_consumer(review_id, consumer.id)
        if existing is None:
            raise PermissionError("You can only delete your own reviews")

        await self.repository.delete(existing)
        return {"deleted": True}

    async def rating_summary(self, farmer_id: UUID) -> FarmerRatingSummary:
        average_rating, review_count = await self.repository.get_rating_summary(farmer_id)
        return FarmerRatingSummary(
            farmer_id=farmer_id,
            average_rating=average_rating,
            review_count=review_count,
        )

    async def _notify_review_submitted(self, review: Review) -> None:
        if self.notification_service is None:
            return
        await self.notification_service.create(
            user_id=review.listing.farmer.user_id,
            notification_type=NotificationType.REVIEW,
            title="New review received",
            message=f"A consumer submitted a {review.rating}-star review for {review.listing.crop.name}.",
            related_entity_type="review",
            related_entity_id=review.id,
        )

    @staticmethod
    def _response(review: Review) -> ReviewResponse:
        return ReviewResponse(
            id=review.id,
            consumer_id=review.consumer_id,
            order_id=review.order_id,
            listing_id=review.listing_id,
            rating=review.rating,
            comment=review.comment,
            reviewer_name=review.consumer.name,
            farmer_name=review.listing.farmer.name,
            crop_name=review.listing.crop.name,
            created_at=review.created_at,
            updated_at=review.updated_at,
        )
