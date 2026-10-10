from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

from geoalchemy2.elements import WKTElement

from backend.app.models import AvailabilityStatus, CropListing, Order
from backend.app.repositories.farmer_repository import FarmerRepository
from backend.app.schemas.farmer import (
    CropImageResponse,
    CropListingCreate,
    CropListingResponse,
    CropListingUpdate,
    DashboardAIPredictionResponse,
    DashboardAIQualityAssessmentResponse,
    DashboardAISummaryResponse,
    DashboardAnalyticsActivityResponse,
    DashboardAnalyticsResponse,
    DashboardListingResponse,
    DashboardOrderItemResponse,
    DashboardOrderResponse,
    DashboardRecentOrderResponse,
    DashboardReviewResponse,
    DashboardReviewsResponse,
    DashboardSummaryResponse,
    FarmerProfileResponse,
    FarmerProfileUpdate,
    LocationInput,
)


class FarmerService:
    ALLOWED_IMAGE_TYPES = {
        "image/jpeg": ("jpg", b"\xff\xd8\xff"),
        "image/png": ("png", b"\x89PNG\r\n\x1a\n"),
        "image/webp": ("webp", b"RIFF"),
    }
    MAX_IMAGE_SIZE = 5 * 1024 * 1024

    def __init__(self, repository: FarmerRepository, upload_root: Path) -> None:
        self.repository = repository
        self.upload_root = upload_root

    @staticmethod
    def _point(location: LocationInput | None) -> WKTElement | None:
        if location is None:
            return None
        return WKTElement(f"POINT({location.longitude} {location.latitude})", srid=4326)

    @staticmethod
    def _location(coordinates: tuple[float, float] | None) -> LocationInput | None:
        if coordinates is None:
            return None
        latitude, longitude = coordinates
        return LocationInput(latitude=latitude, longitude=longitude)

    async def profile(self, user_id: UUID) -> FarmerProfileResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        coordinates = await self.repository.get_coordinates("farmers", farmer.id)
        return FarmerProfileResponse.model_validate({**farmer.__dict__, "location": self._location(coordinates)})

    async def update_profile(self, user_id: UUID, payload: FarmerProfileUpdate) -> FarmerProfileResponse:
        values = payload.model_dump(exclude_unset=True)
        if "location" in values:
            values["location"] = self._point(payload.location)
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            if not payload.name:
                raise ValueError("name is required when creating a farmer profile")
            farmer = await self.repository.create_profile(user_id, {"name": payload.name, **values})
        else:
            farmer = await self.repository.update_profile(farmer, values)
        coordinates = await self.repository.get_coordinates("farmers", farmer.id)
        return FarmerProfileResponse.model_validate({**farmer.__dict__, "location": self._location(coordinates)})

    async def _listing_response(self, listing: CropListing) -> CropListingResponse:
        coordinates = await self.repository.get_coordinates("crop_listings", listing.id)
        return CropListingResponse.model_validate(
            {
                **listing.__dict__,
                "farmer_id": listing.farmer_id,
                "crop_name": listing.crop.name,
                "crop_category": listing.crop.category,
                "availability_status": listing.availability_status.value,
                "location": self._location(coordinates),
            }
        )

    async def create_listing(self, farmer_id: UUID, payload: CropListingCreate) -> CropListingResponse:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        values = payload.model_dump()
        values["location"] = self._point(payload.location)
        listing = await self.repository.create_listing(farmer.id, values)
        listing.crop = await self.repository.get_or_create_crop(payload.crop_name, payload.crop_category)
        return await self._listing_response(listing)

    async def list_listings(self, farmer_id: UUID) -> list[CropListingResponse]:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        return [await self._listing_response(item) for item in await self.repository.list_listings(farmer.id)]

    async def update_listing(self, farmer_id: UUID, listing_id: UUID, payload: CropListingUpdate) -> CropListingResponse:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        values = payload.model_dump(exclude_unset=True)
        if "location" in values:
            values["location"] = self._point(payload.location)
        if "availability_status" in values:
            try:
                values["availability_status"] = AvailabilityStatus(values["availability_status"])
            except ValueError as exc:
                raise ValueError("Invalid availability status") from exc
        listing = await self.repository.get_listing(listing_id, farmer.id)
        if listing is None:
            raise LookupError("Crop listing not found")
        updated = await self.repository.update_listing(listing, values)
        return await self._listing_response(updated)

    async def deactivate_listing(self, farmer_id: UUID, listing_id: UUID) -> None:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        listing = await self.repository.get_listing(listing_id, farmer.id)
        if listing is None:
            raise LookupError("Crop listing not found")
        await self.repository.update_listing(listing, {"availability_status": AvailabilityStatus.UNAVAILABLE})

    async def add_image(self, farmer_id: UUID, listing_id: UUID, upload_file) -> object:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        listing = await self.repository.get_listing(listing_id, farmer.id)
        if listing is None:
            raise LookupError("Crop listing not found")
        content_type = upload_file.content_type or ""
        if content_type not in self.ALLOWED_IMAGE_TYPES:
            raise ValueError("Only JPEG, PNG, and WebP images are accepted")
        content = await upload_file.read(self.MAX_IMAGE_SIZE + 1)
        if len(content) > self.MAX_IMAGE_SIZE:
            raise ValueError("Image exceeds the 5 MB size limit")
        extension, signature = self.ALLOWED_IMAGE_TYPES[content_type]
        if not content.startswith(signature) or (content_type == "image/webp" and content[8:12] != b"WEBP"):
            raise ValueError("Uploaded file does not match its image type")
        image_id = uuid4()
        target_dir = self.upload_root / str(listing_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{image_id}.{extension}"
        target.write_bytes(content)
        return await self.repository.add_image(listing_id, str(target.relative_to(self.upload_root.parent)), content_type)

    async def dashboard_summary(self, user_id: UUID) -> DashboardSummaryResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        listings = await self.repository.list_listings_for_dashboard(farmer.id)
        orders = sorted(await self.repository.list_orders_for_dashboard(user_id), key=lambda order: order.created_at, reverse=True)
        average_rating, review_count = await self.repository.get_dashboard_review_summary(farmer.id)

        active_listings = sum(1 for item in listings if item.availability_status.value == "AVAILABLE")
        inactive_listings = len(listings) - active_listings
        total_sales = sum((self._farmer_order_total(order, user_id) for order in orders), Decimal("0.00")).quantize(Decimal("0.01"))

        order_counts = {
            "PENDING": 0,
            "CONFIRMED": 0,
            "COMPLETED": 0,
            "CANCELLED": 0,
        }
        for order in orders:
            order_counts[order.status.value] = order_counts.get(order.status.value, 0) + 1

        return DashboardSummaryResponse(
            total_listings=len(listings),
            active_listings=active_listings,
            inactive_listings=inactive_listings,
            total_orders_received=len(orders),
            pending_orders=order_counts.get("PENDING", 0),
            confirmed_orders=order_counts.get("CONFIRMED", 0),
            completed_orders=order_counts.get("COMPLETED", 0),
            cancelled_orders=order_counts.get("CANCELLED", 0),
            total_sales=format(total_sales, ".2f"),
            average_rating=average_rating,
            total_reviews=review_count,
            unread_notification_count=await self.repository.count_unread_notifications(user_id),
        )

    async def dashboard_listings(self, user_id: UUID) -> list[DashboardListingResponse]:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        listings = await self.repository.list_listings_for_dashboard(farmer.id)
        return [self._dashboard_listing_response(item) for item in listings]

    async def dashboard_orders(self, user_id: UUID) -> list[DashboardOrderResponse]:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        orders = sorted(await self.repository.list_orders_for_dashboard(user_id), key=lambda order: (order.created_at, order.id), reverse=True)
        return [self._dashboard_order_response(order, user_id) for order in orders]

    async def dashboard_analytics(self, user_id: UUID) -> DashboardAnalyticsResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        orders = sorted(await self.repository.list_orders_for_dashboard(user_id), key=lambda order: order.created_at, reverse=True)
        total_sales = sum((self._farmer_order_total(order, user_id) for order in orders), Decimal("0.00")).quantize(Decimal("0.01"))

        orders_by_status: dict[str, int] = {}
        crop_wise_order_count: dict[str, int] = {}
        crop_wise_sales: dict[str, Decimal] = {}

        for order in orders:
            orders_by_status[order.status.value] = orders_by_status.get(order.status.value, 0) + 1
            for item in order.items:
                if item.listing.farmer.user_id != user_id:
                    continue
                crop_name = item.listing.crop.name
                crop_wise_order_count[crop_name] = crop_wise_order_count.get(crop_name, 0) + 1
                crop_wise_sales[crop_name] = crop_wise_sales.get(crop_name, Decimal("0.00")) + item.subtotal

        recent_orders = [
            DashboardRecentOrderResponse(
                id=order.id,
                consumer_name=order.consumer.name if order.consumer else None,
                total_amount=self._farmer_order_total(order, user_id),
                status=order.status.value,
                created_at=order.created_at,
            )
            for order in sorted(orders, key=lambda item: item.created_at, reverse=True)[:5]
        ]

        recent_activity = [
            DashboardAnalyticsActivityResponse(
                type="order",
                title=f"Order {str(order.id)[:8]}",
                message=f"Status updated to {order.status.value}.",
                created_at=order.created_at,
            )
            for order in sorted(orders, key=lambda item: item.created_at, reverse=True)[:5]
        ]

        return DashboardAnalyticsResponse(
            total_sales=format(total_sales, ".2f"),
            orders_by_status=orders_by_status,
            crop_wise_order_count=crop_wise_order_count,
            crop_wise_sales=crop_wise_sales,
            recent_orders=recent_orders,
            recent_activity=recent_activity,
        )

    async def dashboard_reviews(self, user_id: UUID) -> DashboardReviewsResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        reviews = await self.repository.list_reviews_for_farmer(farmer.id)
        average_rating, review_count = await self.repository.get_dashboard_review_summary(farmer.id)
        rating_distribution = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
        for review in reviews:
            rating_distribution[str(review.rating)] = rating_distribution.get(str(review.rating), 0) + 1

        return DashboardReviewsResponse(
            average_rating=average_rating,
            review_count=review_count,
            rating_distribution=rating_distribution,
            recent_reviews=[self._dashboard_review_response(review) for review in reviews[:5]],
        )

    async def dashboard_ai_summary(self, user_id: UUID) -> DashboardAISummaryResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        listings = await self.repository.list_listings_for_dashboard(farmer.id)
        quality_assessments = []
        price_predictions = []

        for listing in listings:
            latest_quality = max(listing.quality_predictions, key=lambda item: item.created_at, default=None)
            if latest_quality is not None:
                quality_assessments.append(
                    DashboardAIQualityAssessmentResponse(
                        id=latest_quality.id,
                        listing_id=listing.id,
                        crop_name=listing.crop.name,
                        quality_label=latest_quality.quality_label,
                        prediction_status=latest_quality.prediction_status,
                        confidence=float(latest_quality.confidence) if latest_quality.confidence is not None else None,
                        created_at=latest_quality.created_at,
                    )
                )
            latest_price = max(listing.price_predictions, key=lambda item: item.created_at, default=None)
            if latest_price is not None:
                price_predictions.append(
                    DashboardAIPredictionResponse(
                        id=latest_price.id,
                        listing_id=listing.id,
                        crop_name=listing.crop.name,
                        predicted_price=latest_price.predicted_price,
                        currency=latest_price.currency,
                        unit=latest_price.unit,
                        prediction_status=latest_price.prediction_status,
                        confidence=float(latest_price.confidence) if latest_price.confidence is not None else None,
                        created_at=latest_price.created_at,
                    )
                )

        return DashboardAISummaryResponse(
            quality_assessments=quality_assessments,
            price_predictions=price_predictions,
        )

    @staticmethod
    def _farmer_order_total(order: Order, farmer_user_id: UUID) -> Decimal:
        total = Decimal("0.00")
        for item in order.items:
            if item.listing.farmer.user_id == farmer_user_id:
                total += item.subtotal
        return total.quantize(Decimal("0.01"))

    def _dashboard_listing_response(self, listing: CropListing) -> DashboardListingResponse:
        latest_quality = max(listing.quality_predictions, key=lambda item: item.created_at, default=None)
        latest_price = max(listing.price_predictions, key=lambda item: item.created_at, default=None)
        return DashboardListingResponse(
            id=listing.id,
            crop_name=listing.crop.name,
            crop_category=listing.crop.category,
            farmer_id=listing.farmer_id,
            quantity=listing.quantity,
            unit=listing.unit,
            asking_price=listing.asking_price,
            description=listing.description,
            harvest_date=listing.harvest_date,
            availability_status=listing.availability_status.value,
            location=None,
            images=[CropImageResponse.model_validate(image) for image in listing.images],
            ai_quality_label=latest_quality.quality_label if latest_quality is not None else None,
            ai_quality_status=latest_quality.prediction_status if latest_quality is not None else None,
            ai_quality_confidence=float(latest_quality.confidence) if latest_quality and latest_quality.confidence is not None else None,
            ai_price_predicted_price=latest_price.predicted_price if latest_price is not None else None,
            ai_price_prediction_status=latest_price.prediction_status if latest_price is not None else None,
            ai_price_confidence=float(latest_price.confidence) if latest_price and latest_price.confidence is not None else None,
            created_at=listing.created_at,
            updated_at=listing.updated_at,
        )

    def _dashboard_order_response(self, order: Order, farmer_user_id: UUID) -> DashboardOrderResponse:
        farmer_items = [item for item in order.items if item.listing.farmer.user_id == farmer_user_id]
        return DashboardOrderResponse(
            id=order.id,
            consumer_id=order.consumer_id,
            consumer_name=order.consumer.name if order.consumer else None,
            hub_name=order.hub.name if order.hub else None,
            status=order.status.value,
            total_amount=self._farmer_order_total(order, farmer_user_id),
            payment_status=order.payment.status.value if order.payment else None,
            payment_provider_reference=order.payment.provider_reference if order.payment else None,
            fulfillment_method=order.delivery.fulfillment_method.value if order.delivery else None,
            fulfillment_status=order.delivery.status.value if order.delivery else None,
            order_date=order.created_at,
            items=[
                DashboardOrderItemResponse(
                    id=item.id,
                    listing_id=item.listing_id,
                    crop_name=item.listing.crop.name,
                    farmer_name=item.listing.farmer.name,
                    quantity=item.quantity,
                    unit=item.listing.unit,
                    unit_price=item.unit_price,
                    subtotal=item.subtotal,
                )
                for item in farmer_items
            ],
        )

    def _dashboard_review_response(self, review) -> DashboardReviewResponse:
        return DashboardReviewResponse(
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
