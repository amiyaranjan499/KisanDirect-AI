from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.app.core.config import Settings
from backend.app.core.security import hash_password
from backend.app.models import (
    AvailabilityStatus,
    CropListing,
    Farmer,
    FarmerWithdrawal,
    Hub,
    HubStaff,
    HubStatus,
    HubStock,
    NotificationType,
    Order,
    OrderItem,
    OrderStatus,
    Shipment,
    ShipmentStatus,
    User,
    UserRole,
)
from backend.app.repositories.farmer_repository import FarmerRepository
from backend.app.repositories.rider_repository import RiderRepository
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    OrderLifecycleService,
)
from backend.app.services.rider_service import RiderService
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
    FarmerFacilityCreate,
    FarmerFacilityResponse,
    FarmerFacilityUpdate,
    FarmerProfileResponse,
    FarmerProfileUpdate,
    FarmerStaffCreate,
    FarmerStaffResponse,
    FarmerWalletResponse,
    FarmerWalletWithdrawalRequest,
    FarmerWithdrawalResponse,
    LocationInput,
)


class FarmerService:
    ALLOWED_IMAGE_TYPES = {
        "image/jpeg": ("jpg", b"\xff\xd8\xff"),
        "image/png": ("png", b"\x89PNG\r\n\x1a\n"),
        "image/webp": ("webp", b"RIFF"),
    }
    MAX_IMAGE_SIZE = 5 * 1024 * 1024

    def __init__(
        self,
        repository: FarmerRepository,
        upload_root: Path,
        settings: Settings | None = None,
    ) -> None:
        self.repository = repository
        self.upload_root = upload_root
        self.settings = settings or Settings()

    def _lifecycle_services(self) -> tuple[OrderLifecycleService, RiderService]:
        lifecycle = OrderLifecycleService(self.repository.session, settings=self.settings)
        rider_dispatch = RiderService(
            self.repository.session,
            RiderRepository(self.repository.session),
            lifecycle,
            self.settings,
        )
        lifecycle.shipment_ready_hook = rider_dispatch.dispatch_ready_shipment
        return lifecycle, rider_dispatch

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
        if "profile_image" in values and not values["profile_image"]:
            values["profile_image"] = None
        if "cover_image" in values and not values["cover_image"]:
            values["cover_image"] = None
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            if not payload.name:
                raise ValueError("name is required when creating a farmer profile")
            farmer = await self.repository.create_profile(user_id, {"name": payload.name, **values})
        else:
            farmer = await self.repository.update_profile(farmer, values)
        coordinates = await self.repository.get_coordinates("farmers", farmer.id)
        return FarmerProfileResponse.model_validate({**farmer.__dict__, "location": self._location(coordinates)})

    async def _listing_response(
        self, listing: CropListing, coordinates: tuple[float, float] | None = None
    ) -> CropListingResponse:
        if coordinates is None:
            coordinates = await self.repository.get_coordinates("crop_listings", listing.id)
        latest_quality = None
        if "quality_predictions" in listing.__dict__ and listing.quality_predictions:
            latest_quality = max(listing.quality_predictions, key=lambda item: item.created_at, default=None)
        quality_grade = None
        if latest_quality is not None and latest_quality.quality_label:
            mapping = {"Good": "Grade A", "Average": "Grade B", "Poor": "Grade C"}
            quality_grade = mapping.get(latest_quality.quality_label, latest_quality.quality_label)
        return CropListingResponse.model_validate(
            {
                **listing.__dict__,
                "farmer_id": listing.farmer_id,
                "crop_name": listing.crop.name,
                "crop_category": listing.crop.category,
                "availability_status": listing.availability_status.value,
                "location": self._location(coordinates),
                "ai_quality_label": latest_quality.quality_label if latest_quality is not None else None,
                "ai_quality_status": latest_quality.prediction_status if latest_quality is not None else None,
                "ai_quality_confidence": float(latest_quality.confidence) if latest_quality and latest_quality.confidence is not None else None,
                "quality_grade": quality_grade,
                "quality_information": listing.quality_information,
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
        try:
            from sqlalchemy import func
            hub_result = await self.repository.session.execute(
                select(Hub)
                .where(Hub.status == HubStatus.ACTIVE)
                .order_by(func.ST_Distance(Hub.location, listing.location))
                .limit(1)
            )
            nearest_hub = hub_result.scalar_one_or_none()
            if nearest_hub is not None:
                stock_entry = HubStock(
                    hub_id=nearest_hub.id,
                    listing_id=listing.id,
                    available_quantity=listing.quantity,
                )
                self.repository.session.add(stock_entry)
                await self.repository.session.flush()
        except Exception:
            pass
        return await self._listing_response(listing)

    async def list_listings(self, farmer_id: UUID) -> list[CropListingResponse]:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        listings = await self.repository.list_listings(farmer.id)
        if not listings:
            return []
        coords_map = await self.repository.get_coordinates_batch("crop_listings", [item.id for item in listings])
        return [
            await self._listing_response(item, coordinates=coords_map.get(item.id))
            for item in listings
        ]

    async def get_listing(self, farmer_id: UUID, listing_id: UUID) -> CropListingResponse:
        farmer = await self.repository.get_profile(farmer_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        listing = await self.repository.get_listing(listing_id, farmer.id)
        if listing is None:
            raise LookupError("Crop listing not found")
        return await self._listing_response(listing)

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

    async def upload_profile_image(self, user_id: UUID, upload_file) -> str:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
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
        target_dir = self.upload_root / "farmers" / str(farmer.id)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"profile_{image_id}.{extension}"
        target.write_bytes(content)
        relative_path = str(target.relative_to(self.upload_root.parent)).replace("\\", "/")
        await self.repository.update_profile(farmer, {"profile_image": relative_path})
        return relative_path

    async def upload_cover_image(self, user_id: UUID, upload_file) -> str:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
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
        target_dir = self.upload_root / "farmers" / str(farmer.id)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"cover_{image_id}.{extension}"
        target.write_bytes(content)
        relative_path = str(target.relative_to(self.upload_root.parent)).replace("\\", "/")
        await self.repository.update_profile(farmer, {"cover_image": relative_path})
        return relative_path

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

        active_orders = sum(
            1 for order in orders if order.status.value not in ["COMPLETED", "DELIVERED", "CANCELLED"]
        )

        return DashboardSummaryResponse(
            total_listings=len(listings),
            active_listings=active_listings,
            inactive_listings=inactive_listings,
            total_orders_received=len(orders),
            active_orders=active_orders,
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

    async def list_facilities(self, user_id: UUID) -> list[FarmerFacilityResponse]:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        rows = await self.repository.list_facilities(farmer.id)
        return [
            FarmerFacilityResponse(
                id=hub.id,
                name=hub.name,
                address=hub.address,
                pincode=hub.pincode,
                latitude=lat,
                longitude=lng,
                service_radius_km=hub.service_radius_km,
                status=hub.status.value,
                farmer_id=hub.farmer_id,
                staff_count=staff_count,
                created_at=hub.created_at,
                updated_at=hub.updated_at,
            )
            for hub, staff_count, lat, lng in rows
        ]

    async def create_facility(self, user_id: UUID, payload: FarmerFacilityCreate) -> FarmerFacilityResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        # Format address with village, district, state if supplied
        address_parts = [payload.address.strip()]
        for part in [payload.village_or_locality, payload.district, payload.state]:
            if part and part.strip() and part.strip().lower() not in payload.address.lower():
                address_parts.append(part.strip())
        full_address = ", ".join(address_parts)

        # Coordinate resolution: if omitted by farmer, fallback to farmer's location or default
        lat = payload.latitude
        lng = payload.longitude
        if lat is None or lng is None:
            coords = await self.repository.get_farmer_coordinates(farmer.id)
            if coords:
                lat, lng = coords
            else:
                lat, lng = 20.2961, 85.8245

        async with self.repository.session.begin_nested():
            hub, res_lat, res_lng = await self.repository.create_facility(
                farmer_id=farmer.id,
                name=payload.name.strip(),
                address=full_address,
                pincode=payload.pincode.strip(),
                latitude=lat,
                longitude=lng,
                service_radius_km=payload.service_radius_km,
            )
        return FarmerFacilityResponse(
            id=hub.id,
            name=hub.name,
            address=hub.address,
            pincode=hub.pincode,
            latitude=res_lat,
            longitude=res_lng,
            service_radius_km=hub.service_radius_km,
            status=hub.status.value,
            farmer_id=hub.farmer_id,
            staff_count=0,
            created_at=hub.created_at,
            updated_at=hub.updated_at,
        )

    async def update_facility(
        self, user_id: UUID, facility_id: UUID, payload: FarmerFacilityUpdate
    ) -> FarmerFacilityResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        async with self.repository.session.begin_nested():
            facility = await self.repository.get_facility_for_update(farmer.id, facility_id)
            if facility is None:
                raise LookupError("Storage facility not found or not owned by farmer")
            update_data = payload.model_dump(exclude_unset=True)
            lat = update_data.pop("latitude", None)
            lng = update_data.pop("longitude", None)
            if (lat is None) != (lng is None):
                raise ValueError("Latitude and longitude must be provided together")

            # Format address with village, district, state if supplied
            if "address" in update_data:
                addr_parts = [update_data["address"].strip()]
                for key in ["village_or_locality", "district", "state"]:
                    val = update_data.pop(key, None)
                    if val and val.strip() and val.strip().lower() not in update_data["address"].lower():
                        addr_parts.append(val.strip())
                update_data["address"] = ", ".join(addr_parts)
            else:
                update_data.pop("village_or_locality", None)
                update_data.pop("district", None)
                update_data.pop("state", None)

            updated, new_lat, new_lng = await self.repository.update_facility(
                facility, update_data, latitude=lat, longitude=lng
            )
        facility_info = await self.repository.get_facility(farmer.id, facility_id)
        staff_count = facility_info[1] if facility_info else 0
        return FarmerFacilityResponse(
            id=updated.id,
            name=updated.name,
            address=updated.address,
            pincode=updated.pincode,
            latitude=new_lat,
            longitude=new_lng,
            service_radius_km=updated.service_radius_km,
            status=updated.status.value,
            farmer_id=updated.farmer_id,
            staff_count=staff_count,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def list_staff(
        self, user_id: UUID, facility_id: UUID | None = None
    ) -> list[FarmerStaffResponse]:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        if facility_id:
            rows = await self.repository.list_staff_for_facility(farmer.id, facility_id)
        else:
            rows = await self.repository.list_facility_staff(farmer.id)
        return [
            FarmerStaffResponse(
                user_id=user.id,
                email=user.email,
                display_name=user.email,
                facility_id=hub.id,
                facility_name=hub.name,
                is_active=user.is_active,
                created_at=user.created_at,
            )
            for user, hub in rows
        ]

    async def create_staff(
        self, user_id: UUID, facility_id: UUID, payload: FarmerStaffCreate
    ) -> FarmerStaffResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        normalized_email = payload.email.strip().lower()
        async with self.repository.session.begin_nested():
            facility = await self.repository.get_facility_for_update(farmer.id, facility_id)
            if facility is None:
                raise LookupError("Storage facility not found or not owned by farmer")
            existing_user = await self.repository.get_user_by_email(normalized_email)
            if existing_user is not None:
                raise ValueError("An account with this email already exists")
            user, hub = await self.repository.create_facility_staff(
                facility_id=facility.id,
                email=normalized_email,
                hashed_password=hash_password(payload.initial_password),
                display_name=payload.display_name,
            )
        return FarmerStaffResponse(
            user_id=user.id,
            email=user.email,
            display_name=payload.display_name or user.email,
            facility_id=hub.id,
            facility_name=hub.name,
            is_active=user.is_active,
            created_at=user.created_at,
        )

    async def remove_staff(
        self, user_id: UUID, facility_id: UUID, staff_user_id: UUID
    ) -> None:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")
        async with self.repository.session.begin_nested():
            facility = await self.repository.get_facility_for_update(farmer.id, facility_id)
            if facility is None:
                raise LookupError("Storage facility not found or not owned by farmer")
            removed = await self.repository.remove_facility_staff(facility.id, staff_user_id)
            if not removed:
                raise LookupError("Staff assignment not found for this facility")

    async def assign_staff_order(
        self,
        user_id: UUID,
        order_id: UUID,
        facility_id: UUID | None = None,
        staff_user_id: UUID | None = None,
        notes: str | None = None,
    ) -> DashboardOrderResponse:
        return await self.send_order_to_hub(
            user_id,
            order_id,
            facility_id=facility_id,
            staff_user_id=staff_user_id,
            notes=notes,
        )

    async def send_order_to_hub(
        self,
        user_id: UUID,
        order_id: UUID,
        *,
        facility_id: UUID | None = None,
        staff_user_id: UUID | None = None,
        notes: str | None = None,
    ) -> DashboardOrderResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        lifecycle, _ = self._lifecycle_services()

        async with self.repository.session.begin_nested():
            # 1. Lock and validate order
            result = await self.repository.session.execute(
                select(Order)
                .where(Order.id == order_id)
                .execution_options(populate_existing=True)
                .options(
                    selectinload(Order.items)
                    .selectinload(OrderItem.listing)
                    .options(
                        selectinload(CropListing.farmer),
                        selectinload(CropListing.crop),
                    ),
                    selectinload(Order.consumer),
                    selectinload(Order.shipment),
                    selectinload(Order.hub),
                )
                .with_for_update()
            )
            order = result.scalar_one_or_none()
            if order is None:
                raise LookupError("Order not found")

            farmer_owns = any(
                item.listing and item.listing.farmer_id == farmer.id
                for item in order.items
            )
            if not farmer_owns:
                raise PermissionError("Farmer does not own items in this order")

            # Prevent duplicate submission and ineligible states
            if order.status in (OrderStatus.DELIVERED, OrderStatus.CANCELLED):
                raise ValueError("Order is already delivered or cancelled")
            if order.hub_id is not None:
                raise ValueError("Order has already been sent to a hub")

            # 2. Automatically identify the farmer's existing hub
            if facility_id is not None:
                facility = await self.repository.get_facility_for_update(farmer.id, facility_id)
                if facility is None:
                    raise LookupError("Storage facility not found or not owned by farmer")
            else:
                facilities = await self.repository.list_facilities(farmer.id)
                active_facilities = [f for f in facilities if f[0].status == HubStatus.ACTIVE]
                if not active_facilities:
                    raise ValueError(
                        "No active Kisan Hub found for your farm. Please create a Hub first in 'My Hub' before transferring orders."
                    )
                hub_with_staff = next((f for f in active_facilities if f[1] > 0), None)
                chosen_hub_entry = hub_with_staff or active_facilities[0]
                facility = await self.repository.get_facility_for_update(farmer.id, chosen_hub_entry[0].id)
                if facility is None:
                    raise ValueError("Failed to access farmer's active hub.")

            # 3. Identify Hub Staff already assigned to that hub
            staff_rows = await self.repository.list_staff_for_facility(farmer.id, facility.id)
            target_staff = [u for u, h in staff_rows if u.is_active]
            if not target_staff:
                platform_staff = await self.repository.session.scalars(
                    select(User)
                    .join(HubStaff, HubStaff.user_id == User.id)
                    .where(HubStaff.hub_id == facility.id, User.role == UserRole.HUB_STAFF, User.is_active.is_(True))
                )
                target_staff = list(platform_staff.all())
            if staff_user_id is not None:
                target_staff = [u for u in target_staff if u.id == staff_user_id]

            if not target_staff:
                raise ValueError(
                    f"The hub '{facility.name}' has no eligible active staff assigned to prepare orders. Please assign staff in 'Hub Staff' before transferring orders."
                )

            actor = LifecycleActor(user_id, UserRole.FARMER)

            # 4. Automatically transfer incoming order to that hub
            order.hub_id = facility.id

            if not order.delivery_address and order.consumer:
                order.delivery_address = (
                    order.consumer.address
                    or f"{order.consumer.city or 'Local Delivery Address'}, PIN {order.consumer.pin_code or '751001'}"
                )
            if order.promised_window_start is None:
                order.promised_window_start = datetime.now(timezone.utc)
            if order.promised_window_end is None:
                order.promised_window_end = datetime.now(timezone.utc) + timedelta(minutes=60)

            if order.status == OrderStatus.PENDING:
                await lifecycle.transition_order(
                    order.id, actor, OrderStatus.CONFIRMED, reason="Order accepted for hub transfer"
                )
            if order.status == OrderStatus.CONFIRMED:
                await lifecycle.transition_order(
                    order.id, actor, OrderStatus.PROCESSING, reason=f"Transferred to staff at {facility.name}"
                )

            crop_names = ", ".join(item.listing.crop.name for item in order.items if item.listing and item.listing.crop) or "Produce"
            for st in target_staff:
                await lifecycle.notifications.stage(
                    user_id=st.id,
                    notification_type=NotificationType.ORDER,
                    title="New Order Task Assigned",
                    message=(
                        f"Order ORD-{str(order.id)[:8].upper()} ({crop_names}) "
                        f"has been transferred to {facility.name} for preparation."
                    ),
                    related_entity_type="order",
                    related_entity_id=order.id,
                )

            await lifecycle.notifications.stage(
                user_id=user_id,
                notification_type=NotificationType.ORDER,
                title="Order Transferred to Hub",
                message=f"Order ORD-{str(order.id)[:8].upper()} transferred to {facility.name}. Assigned staff have been notified.",
                related_entity_type="order",
                related_entity_id=order.id,
            )

            if order.consumer and order.consumer.user_id:
                await lifecycle.notifications.stage(
                    user_id=order.consumer.user_id,
                    notification_type=NotificationType.ORDER,
                    title="Order Routing Update",
                    message=f"Your order ORD-{str(order.id)[:8].upper()} has been routed to Kisan Hub ({facility.name}) for fulfillment.",
                    related_entity_type="order",
                    related_entity_id=order.id,
                )

            await self.repository.session.flush()

        return await self._get_dashboard_order_response(order.id, user_id)

    async def prepare_personally_order(
        self,
        user_id: UUID,
        order_id: UUID,
        notes: str | None = None,
    ) -> DashboardOrderResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        lifecycle, _ = self._lifecycle_services()

        async with self.repository.session.begin_nested():
            result = await self.repository.session.execute(
                select(Order)
                .where(Order.id == order_id)
                .execution_options(populate_existing=True)
                .options(
                    selectinload(Order.items)
                    .selectinload(OrderItem.listing)
                    .options(
                        selectinload(CropListing.farmer),
                        selectinload(CropListing.crop),
                    ),
                    selectinload(Order.consumer),
                    selectinload(Order.shipment),
                )
                .with_for_update()
            )
            order = result.scalar_one_or_none()
            if order is None:
                raise LookupError("Order not found")

            farmer_owns = any(
                item.listing and item.listing.farmer_id == farmer.id
                for item in order.items
            )
            if not farmer_owns:
                raise PermissionError("Farmer does not own items in this order")

            actor = LifecycleActor(user_id, UserRole.FARMER)
            if order.status == OrderStatus.PENDING:
                await lifecycle.transition_order(
                    order.id, actor, OrderStatus.CONFIRMED, reason="Farmer accepted order"
                )
            if order.status == OrderStatus.CONFIRMED:
                await lifecycle.transition_order(
                    order.id, actor, OrderStatus.PROCESSING, reason="Farmer preparing order personally on-farm"
                )

            await lifecycle.notifications.stage(
                user_id=user_id,
                notification_type=NotificationType.ORDER,
                title="Order in Preparation",
                message=f"Order ORD-{str(order.id)[:8].upper()} confirmed for on-farm preparation.",
                related_entity_type="order",
                related_entity_id=order.id,
            )
            await self.repository.session.flush()

        return await self._get_dashboard_order_response(order.id, user_id)

    async def ready_for_pickup_order(
        self,
        user_id: UUID,
        order_id: UUID,
    ) -> DashboardOrderResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        lifecycle, _ = self._lifecycle_services()

        async with self.repository.session.begin_nested():
            result = await self.repository.session.execute(
                select(Order)
                .where(Order.id == order_id)
                .execution_options(populate_existing=True)
                .options(
                    selectinload(Order.items)
                    .selectinload(OrderItem.listing)
                    .options(
                        selectinload(CropListing.farmer),
                        selectinload(CropListing.crop),
                    ),
                    selectinload(Order.consumer),
                    selectinload(Order.shipment),
                )
                .with_for_update()
            )
            order = result.scalar_one_or_none()
            if order is None:
                raise LookupError("Order not found")

            farmer_owns = any(
                item.listing and item.listing.farmer_id == farmer.id
                for item in order.items
            )
            if not farmer_owns:
                raise PermissionError("Farmer does not own items in this order")

            actor = LifecycleActor(user_id, UserRole.FARMER)

            if order.status == OrderStatus.PENDING:
                await lifecycle.transition_order(
                    order.id, actor, OrderStatus.CONFIRMED, reason="Farmer accepted order"
                )
            if order.status == OrderStatus.CONFIRMED:
                await lifecycle.transition_order(
                    order.id, actor, OrderStatus.PROCESSING, reason="Packing order"
                )

            shipment = order.shipment
            if shipment is None:
                hub_id = order.hub_id
                if hub_id is None:
                    farmer_facility = await self.repository.session.scalar(
                        select(Hub.id).where(Hub.farmer_id == farmer.id).order_by(Hub.created_at)
                    )
                    hub_id = farmer_facility
                if hub_id is None:
                    platform_hub = await self.repository.session.scalar(
                        select(Hub.id).where(Hub.status == HubStatus.ACTIVE).order_by(Hub.created_at)
                    )
                    hub_id = platform_hub
                if hub_id is None:
                    raise LifecycleConflict("No active hub found for shipment pickup")

                if not order.delivery_address:
                    order.delivery_address = (
                        order.consumer.address
                        or f"{order.consumer.city or 'Local Delivery Address'}, PIN {order.consumer.pin_code or '751001'}"
                    )
                if order.promised_window_start is None:
                    order.promised_window_start = datetime.now(timezone.utc)
                if order.promised_window_end is None:
                    order.promised_window_end = datetime.now(timezone.utc) + timedelta(minutes=60)

                shipment = await lifecycle.create_shipment(
                    order.id,
                    actor,
                    hub_id=hub_id,
                    reason="Shipment created for farmer pickup",
                )

            if shipment.status == ShipmentStatus.PACKING:
                await lifecycle.transition_shipment(
                    shipment.id,
                    actor,
                    ShipmentStatus.READY_FOR_PICKUP,
                    reason="Order packed and ready for rider pickup",
                )

            await lifecycle.notifications.stage(
                user_id=user_id,
                notification_type=NotificationType.DELIVERY,
                title="Ready for Rider Pickup",
                message=f"Order ORD-{str(order.id)[:8].upper()} is ready for rider pickup. Riders have been notified.",
                related_entity_type="order",
                related_entity_id=order.id,
            )
            await self.repository.session.flush()

        return await self._get_dashboard_order_response(order.id, user_id)

    async def deliver_order(
        self,
        user_id: UUID,
        order_id: UUID,
        *,
        otp: str | None = None,
        notes: str | None = None,
    ) -> DashboardOrderResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        lifecycle, _ = self._lifecycle_services()
        actor = LifecycleActor(user_id, UserRole.FARMER)

        await lifecycle.deliver_farmer_order(
            order_id,
            actor,
            otp=otp,
            reason=notes or "Delivered directly by farmer without rider",
        )

        return await self._get_dashboard_order_response(order_id, user_id)

    async def hide_order_from_history(self, user_id: UUID, order_id: UUID) -> None:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        order = await self.repository.session.scalar(
            select(Order)
            .where(Order.id == order_id)
            .options(
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer)
            )
        )
        if order is None:
            raise LookupError("Order not found")

        farmer_owns_item = any(item.listing.farmer.user_id == user_id for item in order.items)
        if not farmer_owns_item:
            raise PermissionError("You do not have permission to modify this order")

        if order.status not in {OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED}:
            raise ValueError("Cannot remove active, pending, or ongoing orders from history.")

        await self.repository.hide_order(farmer.id, order.id)
        await self.repository.session.commit()

    async def _get_dashboard_order_response(self, order_id: UUID, user_id: UUID) -> DashboardOrderResponse:
        orders = await self.dashboard_orders(user_id)
        for o in orders:
            if o.id == order_id:
                return o
        result = await self.repository.session.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(
                selectinload(Order.consumer),
                selectinload(Order.payment),
                selectinload(Order.delivery),
                selectinload(Order.hub),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer),
            )
        )
        order = result.scalar_one_or_none()
        if order is not None:
            return self._dashboard_order_response(order, user_id)
        raise LookupError("Order not found")

    async def get_wallet(self, user_id: UUID) -> FarmerWalletResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        # 1. Total sales/earned from orders
        orders = await self.repository.list_orders_for_dashboard(user_id)
        total_earned = Decimal("0.00")
        for order in orders:
            if order.status.value != "CANCELLED":
                total_earned += self._farmer_order_total(order, user_id)
        total_earned = total_earned.quantize(Decimal("0.01"))

        # 2. Withdrawals
        withdrawals = await self.repository.list_withdrawals(farmer.id)
        withdrawn_total = sum(
            (w.amount for w in withdrawals if w.status == "COMPLETED"),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))

        pending_withdrawals = sum(
            (w.amount for w in withdrawals if w.status in ["PENDING", "PROCESSING"]),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))

        available_balance = max(Decimal("0.00"), total_earned - withdrawn_total - pending_withdrawals).quantize(Decimal("0.01"))

        return FarmerWalletResponse(
            total_earned=total_earned,
            withdrawn_total=withdrawn_total,
            pending_withdrawals=pending_withdrawals,
            available_balance=available_balance,
            currency="INR",
            withdrawals=[
                FarmerWithdrawalResponse(
                    id=w.id,
                    amount=w.amount,
                    payout_method=w.payout_method,
                    account_holder_name=w.account_holder_name,
                    account_number=w.account_number,
                    ifsc_code=w.ifsc_code,
                    bank_name=w.bank_name,
                    upi_id=w.upi_id,
                    status=w.status,
                    reference_id=w.reference_id,
                    note=w.note,
                    created_at=w.created_at,
                    processed_at=w.processed_at,
                )
                for w in withdrawals
            ],
        )

    async def request_withdrawal(self, user_id: UUID, payload: FarmerWalletWithdrawalRequest) -> FarmerWithdrawalResponse:
        farmer = await self.repository.get_profile(user_id)
        if farmer is None:
            raise LookupError("Farmer profile not found")

        amount = payload.amount.quantize(Decimal("0.01"))
        if amount <= Decimal("0.00"):
            raise ValueError("Withdrawal amount must be greater than zero.")

        # Check available balance
        wallet = await self.get_wallet(user_id)
        if amount > wallet.available_balance:
            raise ValueError(f"Insufficient available balance. You can withdraw up to ₹{wallet.available_balance}.")

        # Validate payout details based on method
        if payload.payout_method == "BANK_TRANSFER":
            if not payload.account_number or not payload.account_number.strip():
                raise ValueError("Bank account number is required for bank transfer.")
            if not payload.ifsc_code or len(payload.ifsc_code.strip()) < 5:
                raise ValueError("Valid IFSC code is required for bank transfer.")
        elif payload.payout_method == "UPI":
            if not payload.upi_id or "@" not in payload.upi_id:
                raise ValueError("Valid UPI ID (e.g. name@upi) is required for UPI payout.")

        ref_id = f"PAY-{uuid4().hex[:10].upper()}"
        withdrawal = FarmerWithdrawal(
            farmer_id=farmer.id,
            amount=amount,
            payout_method=payload.payout_method,
            account_holder_name=payload.account_holder_name.strip(),
            account_number=payload.account_number.strip() if payload.account_number else None,
            ifsc_code=payload.ifsc_code.strip().upper() if payload.ifsc_code else None,
            bank_name=payload.bank_name.strip() if payload.bank_name else None,
            upi_id=payload.upi_id.strip() if payload.upi_id else None,
            status="COMPLETED",
            reference_id=ref_id,
            note=payload.note.strip() if payload.note else f"Payout to {payload.account_holder_name}",
            processed_at=datetime.now(timezone.utc),
        )
        saved = await self.repository.create_withdrawal(withdrawal)

        # Create real notification for the farmer
        try:
            from backend.app.models import Notification
            notif = Notification(
                user_id=user_id,
                notification_type=NotificationType.PAYMENT,
                title="Withdrawal Processed",
                message=f"₹{amount} has been successfully withdrawn to your {payload.payout_method.replace('_', ' ').title()} account (Ref: {ref_id}).",
                related_entity_type="WITHDRAWAL",
                related_entity_id=saved.id,
            )
            self.repository.session.add(notif)
            await self.repository.session.commit()
        except Exception:
            pass

        return FarmerWithdrawalResponse(
            id=saved.id,
            amount=saved.amount,
            payout_method=saved.payout_method,
            account_holder_name=saved.account_holder_name,
            account_number=saved.account_number,
            ifsc_code=saved.ifsc_code,
            bank_name=saved.bank_name,
            upi_id=saved.upi_id,
            status=saved.status,
            reference_id=saved.reference_id,
            note=saved.note,
            created_at=saved.created_at,
            processed_at=saved.processed_at,
        )


