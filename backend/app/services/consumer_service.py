from decimal import Decimal
from uuid import UUID

from sqlalchemy import text

from backend.app.models import DeliveryStatus, OrderStatus, PaymentStatus
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.orders_repository import OrdersRepository
from backend.app.schemas.consumer import (
    ConsumerDashboardActivityResponse,
    ConsumerDashboardCartSummaryResponse,
    ConsumerDashboardOrderItemResponse,
    ConsumerDashboardOrderResponse,
    ConsumerDashboardPurchaseHistoryResponse,
    ConsumerDashboardReviewResponse,
    ConsumerDashboardSummaryResponse,
    ConsumerProfileResponse,
    ConsumerProfileUpdate,
    FarmerMarketplaceResponse,
    MarketplaceListingFilters,
    MarketplaceListingResponse,
    MarketplacePage,
)
from backend.app.schemas.farmer import LocationInput
from backend.app.schemas.nearby import NearbyFarmerPage, NearbyFarmerResponse


class ConsumerService:
    def __init__(
        self,
        repository: ConsumerRepository,
        orders_repository: OrdersRepository | None = None,
        notification_service=None,
        payment_method_repository=None,
    ) -> None:
        self.repository = repository
        self.orders_repository = orders_repository
        self.notification_service = notification_service
        self.payment_method_repository = payment_method_repository

    async def get_profile(self, user_id: UUID) -> ConsumerProfileResponse:
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        return ConsumerProfileResponse.model_validate(consumer)

    async def update_profile(
        self, user_id: UUID, payload: ConsumerProfileUpdate
    ) -> ConsumerProfileResponse:
        values = payload.model_dump(exclude_unset=True)
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            if not payload.name:
                raise ValueError("name is required when creating a consumer profile")
            consumer = await self.repository.create_profile(user_id, values)
        else:
            consumer = await self.repository.update_profile(consumer, values)
        return ConsumerProfileResponse.model_validate(consumer)

    async def dashboard_summary(self, user_id: UUID) -> ConsumerDashboardSummaryResponse:
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        orders, total_orders = await self.orders_repository.consumer_orders(consumer.id, 1, 1000)
        recent_orders = [self._dashboard_order_response(order) for order in orders[:5]]
        pending_orders = sum(1 for order in orders if order.status == OrderStatus.PENDING)
        confirmed_orders = sum(1 for order in orders if order.status == OrderStatus.CONFIRMED)
        completed_orders = sum(1 for order in orders if order.status == OrderStatus.COMPLETED)
        cancelled_orders = sum(1 for order in orders if order.status == OrderStatus.CANCELLED)

        total_purchase_value = sum((order.total_amount for order in orders), Decimal("0.00"))

        notification_payload = await self.notification_service.list_for_user(user_id, page=1, page_size=20)
        notifications = notification_payload["items"]
        unread_notification_count = sum(1 for notification in notifications if not notification["is_read"])

        recent_activity = []
        for order in orders[:5]:
            recent_activity.append(
                ConsumerDashboardActivityResponse(
                    id=order.id,
                    type="order",
                    title=f"Order {order.status.value.lower()}",
                    message=f"Order {str(order.id)[:8]} updated to {order.status.value}.",
                    created_at=order.created_at,
                )
            )

        for notification in notifications[:5]:
            recent_activity.append(
                ConsumerDashboardActivityResponse(
                    id=notification["id"],
                    type=notification["notification_type"].lower(),
                    title=notification["title"],
                    message=notification["message"],
                    created_at=notification["created_at"],
                )
            )

        recent_activity.sort(key=lambda item: item.created_at, reverse=True)

        return ConsumerDashboardSummaryResponse(
            total_orders=total_orders,
            pending_orders=pending_orders,
            confirmed_orders=confirmed_orders,
            completed_orders=completed_orders,
            cancelled_orders=cancelled_orders,
            total_purchase_value=total_purchase_value,
            unread_notification_count=unread_notification_count,
            recent_orders=recent_orders,
            recent_activity=recent_activity[:10],
        )

    async def dashboard_orders(self, user_id: UUID) -> list[ConsumerDashboardOrderResponse]:
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        orders, _ = await self.orders_repository.consumer_orders(consumer.id, 1, 1000)
        return [self._dashboard_order_response(order) for order in sorted(orders, key=lambda order: order.created_at, reverse=True)]

    async def dashboard_purchase_history(self, user_id: UUID) -> list[ConsumerDashboardPurchaseHistoryResponse]:
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        orders, _ = await self.orders_repository.consumer_orders(consumer.id, 1, 1000)
        history = []
        for order in orders:
            if order.status not in {OrderStatus.COMPLETED, OrderStatus.DELIVERED}:
                continue
            for item in order.items:
                history.append(
                    ConsumerDashboardPurchaseHistoryResponse(
                        id=order.id,
                        crop_name=item.listing.crop.name,
                        farmer_name=item.listing.farmer.name,
                        quantity=item.quantity,
                        amount=item.subtotal,
                        order_date=order.created_at,
                        payment_status=(order.payment.status.value if order.payment else PaymentStatus.PENDING.value),
                        fulfillment_status=(order.delivery.status.value if order.delivery else DeliveryStatus.PENDING.value),
                    )
                )
        return sorted(history, key=lambda item: item.order_date, reverse=True)

    async def dashboard_cart_summary(self, user_id: UUID) -> ConsumerDashboardCartSummaryResponse:
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        cart = await self.orders_repository.get_or_create_cart(consumer.id)
        item_count = len(cart.items)
        total_quantity = sum((item.quantity for item in cart.items), Decimal("0")).quantize(Decimal("1"))
        subtotal = Decimal("0.00")
        for item in cart.items:
            subtotal += (Decimal(item.listing.asking_price) * Decimal(item.quantity)).quantize(Decimal("0.01"))
        return ConsumerDashboardCartSummaryResponse(
            item_count=item_count,
            total_quantity=total_quantity,
            subtotal=subtotal,
        )

    async def dashboard_reviews(self, user_id: UUID) -> list[ConsumerDashboardReviewResponse]:
        consumer = await self.repository.get_profile(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        reviews = []
        for review in consumer.reviews:
            reviews.append(
                ConsumerDashboardReviewResponse(
                    id=review.id,
                    order_id=review.order_id,
                    listing_id=review.listing_id,
                    crop_name=review.listing.crop.name,
                    farmer_name=review.listing.farmer.name,
                    rating=review.rating,
                    comment=review.comment,
                    created_at=review.created_at,
                )
            )
        return sorted(reviews, key=lambda review: review.created_at, reverse=True)

    async def dashboard_notifications(self, user_id: UUID) -> dict[str, int | list]:
        notification_payload = await self.notification_service.list_for_user(user_id, page=1, page_size=10)
        notifications = notification_payload["items"]
        recent = [
            {
                "id": notification["id"],
                "notification_type": notification["notification_type"],
                "title": notification["title"],
                "message": notification["message"],
                "is_read": notification["is_read"],
                "created_at": notification["created_at"],
            }
            for notification in notifications
        ]
        return {
            "total": notification_payload["total"],
            "items": recent,
            "unread_count": sum(1 for notification in notifications if not notification["is_read"]),
        }

    async def list_payment_methods(self, user_id: UUID):
        if self.payment_method_repository is None:
            raise LookupError("Payment methods are unavailable")
        consumer = await self.payment_method_repository.get_consumer(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        methods = await self.payment_method_repository.list_for_consumer(consumer.id)
        return [self._payment_method_response(method) for method in methods]

    async def add_payment_method(self, user_id: UUID, payload):
        if self.payment_method_repository is None:
            raise LookupError("Payment methods are unavailable")
        consumer = await self.payment_method_repository.get_consumer(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        method_type = str(payload.type).upper()
        if method_type not in {"CARD", "UPI"}:
            raise ValueError("Payment method type must be CARD or UPI")

        raw_value = str(payload.value).strip()
        if method_type == "CARD":
            digits = "".join(ch for ch in raw_value if ch.isdigit())
            if len(digits) < 4:
                raise ValueError("Card number is invalid")
            masked_value = f"•••• •••• •••• {digits[-4:]}"
            last4 = digits[-4:]
        else:
            if "@" not in raw_value:
                raise ValueError("UPI handle must include '@'")
            masked_value = raw_value
            last4 = None

        from backend.app.models import PaymentMethod as PaymentMethodModel

        model = PaymentMethodModel(
            consumer_id=consumer.id,
            method_type=method_type,
            provider=payload.provider.strip(),
            masked_value=masked_value,
            last4=last4,
            provider_reference=None,
        )
        saved = await self.payment_method_repository.create(model)
        return self._payment_method_response(saved)

    async def remove_payment_method(self, user_id: UUID, payment_method_id: UUID | str):
        if self.payment_method_repository is None:
            raise LookupError("Payment methods are unavailable")
        consumer = await self.payment_method_repository.get_consumer(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        method = await self.payment_method_repository.get_for_consumer(consumer.id, UUID(str(payment_method_id)))
        if method is None:
            raise LookupError("Payment method not found")
        deleted = await self.payment_method_repository.delete(method)
        return self._payment_method_response(deleted)

    @staticmethod
    def _payment_method_response(method) -> dict:
        return {
            "id": method.id,
            "consumer_id": method.consumer_id,
            "type": method.method_type,
            "provider": method.provider,
            "masked_value": method.masked_value,
            "last4": method.last4,
            "provider_reference": method.provider_reference,
            "created_at": method.created_at,
            "updated_at": method.updated_at,
        }

    def _dashboard_order_response(self, order) -> ConsumerDashboardOrderResponse:
        first_item = None
        if order.items:
            first_item = order.items[0]
        quantity = first_item.quantity if first_item else Decimal("0")
        crop_name = first_item.listing.crop.name if first_item else None
        farmer_name = first_item.listing.farmer.name if first_item else None

        return ConsumerDashboardOrderResponse(
            id=order.id,
            farmer_name=farmer_name,
            crop_name=crop_name,
            quantity=quantity,
            amount=order.total_amount,
            status=order.status.value,
            payment_status=(order.payment.status.value if order.payment else PaymentStatus.PENDING.value),
            delivery_status=(order.delivery.status.value if order.delivery else DeliveryStatus.PENDING.value),
            order_date=order.created_at,
            item_count=len(order.items),
            items=[
                ConsumerDashboardOrderItemResponse(
                    id=item.id,
                    listing_id=item.listing_id,
                    crop_name=item.listing.crop.name,
                    farmer_name=item.listing.farmer.name,
                    quantity=item.quantity,
                    unit=item.listing.unit,
                    unit_price=item.unit_price,
                    subtotal=item.subtotal,
                )
                for item in order.items
            ],
        )

    @staticmethod
    def _listing_response(row, location=None) -> MarketplaceListingResponse:
        listing, quality, quality_score, ai_price, rating = row[:5]
        distance = row[5] if len(row) > 5 else None
        return MarketplaceListingResponse.model_validate(
            {
                "id": listing.id,
                "crop_name": listing.crop.name,
                "category": listing.crop.category,
                "quantity": listing.quantity,
                "unit": listing.unit,
                "asking_price": listing.asking_price,
                "description": listing.description,
                "harvest_date": listing.harvest_date,
                "availability_status": listing.availability_status.value,
                "location": location,
                "farmer_name": listing.farmer.name,
                "farmer_id": listing.farmer.id,
                "distance_km": float(distance) if distance is not None else None,
                "quality": quality,
                "quality_score": float(quality_score) if quality_score is not None else None,
                "ai_recommended_price": ai_price,
                "farmer_rating": float(rating) if rating is not None else None,
                "minimum_order_quantity": None,
                "images": [image.storage_url for image in listing.images],
                "created_at": listing.created_at,
                "updated_at": listing.updated_at,
            }
        )

    async def browse_listings(
        self, filters: MarketplaceListingFilters
    ) -> MarketplacePage:
        listings, total = await self.repository.list_active_listings(
            search=filters.search,
            category=filters.category,
            min_price=filters.min_price,
            max_price=filters.max_price,
            sort=filters.sort,
            quality=filters.quality,
            min_distance_km=filters.min_distance_km,
            max_distance_km=filters.max_distance_km,
            min_rating=filters.min_rating,
            latitude=filters.latitude,
            longitude=filters.longitude,
            page=filters.page,
            page_size=filters.page_size,
        )
        responses = []
        for row in listings:
            coordinates = await self._coordinates(row[0])
            responses.append(self._listing_response(row, coordinates))
        return MarketplacePage(items=responses, page=filters.page, page_size=filters.page_size, total=total, pages=(total + filters.page_size - 1) // filters.page_size)

    async def get_listing(self, listing_id: UUID) -> MarketplaceListingResponse:
        row = await self.repository.get_active_listing(listing_id)
        if row is None:
            raise LookupError("Active crop listing not found")
        coordinates = await self._coordinates(row[0])
        return self._listing_response(row, coordinates)

    async def get_farmer(self, farmer_id: UUID) -> FarmerMarketplaceResponse:
        farmer = await self.repository.get_farmer(farmer_id)
        if farmer is None:
            raise LookupError("Farmer not found")
        listings = []
        for listing in farmer.listings:
            if listing.availability_status.value != "AVAILABLE":
                continue
            row = await self.repository.get_active_listing(listing.id)
            if row is not None:
                listings.append(self._listing_response(row, await self._coordinates(listing)))
        return FarmerMarketplaceResponse(
            id=farmer.id,
            name=farmer.name,
            location=await self._coordinates(farmer, "farmers"),
            rating=(sum(item.farmer_rating or 0 for item in listings) / len(listings) if listings else None),
            listings=listings,
            city=farmer.city,
            district=farmer.district,
            state=farmer.state,
            address=farmer.address or farmer.address_line,
            pin_code=farmer.pin_code,
            profile_image=getattr(farmer, "profile_image", None),
            cover_image=getattr(farmer, "cover_image", None),
        )

    async def _coordinates(self, listing, table="crop_listings") -> dict | None:
        result = await self.repository.session.execute(
            text(
                "SELECT ST_Y(location::geometry), ST_X(location::geometry) "
                f"FROM {table} WHERE id = :listing_id"
            ),
            {"listing_id": listing.id},
        )
        row = result.one_or_none()
        if not row or row[0] is None:
            return None
        return {"latitude": float(row[0]), "longitude": float(row[1])}

    async def nearby_farmers(self, latitude: float, longitude: float, radius_km: float, page: int, page_size: int) -> NearbyFarmerPage:
        rows, total = await self.repository.nearby_farmers(latitude, longitude, radius_km, page, page_size)
        items = []
        for farmer, distance, rating, active_count in rows:
            farmer_location = await self._coordinates(farmer, "farmers")
            listings = []
            for listing in farmer.listings:
                if listing.availability_status.value != "AVAILABLE":
                    continue
                listing_row = await self.repository.get_active_listing(listing.id)
                if listing_row is not None:
                    listings.append(self._listing_response(listing_row, await self._coordinates(listing)))
            if farmer_location is not None:
                items.append(NearbyFarmerResponse(
                    id=farmer.id,
                    name=farmer.name,
                    location=LocationInput(**farmer_location),
                    distance_km=float(distance),
                    rating=float(rating) if rating is not None else None,
                    active_listing_count=int(active_count),
                    listings=listings,
                    city=farmer.city,
                    district=farmer.district,
                    state=farmer.state,
                    address=farmer.address or farmer.address_line,
                    pin_code=farmer.pin_code,
                    profile_image=getattr(farmer, "profile_image", None),
                    cover_image=getattr(farmer, "cover_image", None),
                ))
        return NearbyFarmerPage(items=items, latitude=latitude, longitude=longitude, radius_km=radius_km, page=page, page_size=page_size, total=total, pages=(total + page_size - 1) // page_size)
