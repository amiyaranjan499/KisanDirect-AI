import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.security import hash_password
from backend.app.models import (
    AdminAuditEvent,
    AvailabilityStatus,
    Hub,
    HubStaff,
    HubStatus,
    OrderStatus,
    RiderApprovalStatus,
    RiderAvailability,
    ShipmentStatus,
    User,
    UserRole,
)
from backend.app.repositories.admin_repository import AdminRepository
from backend.app.schemas.admin import (
    AdminAnalyticsActivityResponse,
    AdminAnalyticsResponse,
    AdminAnalyticsTrendPoint,
    AdminCategoryResponse,
    AdminConsumerResponse,
    AdminDashboardSummaryResponse,
    AdminFarmerResponse,
    AdminHubDeliveryResponse,
    AdminHubResponse,
    AdminHubStaffResponse,
    AdminHubStockResponse,
    AdminListingResponse,
    AdminNotificationResponse,
    AdminOrderResponse,
    AdminPaymentResponse,
    AdminReviewResponse,
    AdminRiderResponse,
    AdminShipmentResponse,
    AdminUserStatusResponse,
)
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
)


class AdminService:
    def __init__(self, repository: AdminRepository) -> None:
        self.repository = repository

    @staticmethod
    def _resolve_range(range_value: str) -> tuple[datetime, datetime, str]:
        value = (range_value or "30d").strip().lower()
        end = datetime.now(timezone.utc)
        if value.endswith("d"):
            days = int(value[:-1] or 30)
            start = end - timedelta(days=days)
            return start, end, value
        if value.endswith("m"):
            months = int(value[:-1] or 3)
            start = end - timedelta(days=30 * months)
            return start, end, value
        raise ValueError("Unsupported range, use 7d, 30d, or 90d")

    async def analytics(self, range_value: str = "30d") -> AdminAnalyticsResponse:
        start, end, normalized_range = self._resolve_range(range_value)
        orders = await self.repository.list_orders_for_range(start, end)
        total_orders = len(orders)
        total_sales = sum((order.total_amount for order in orders), Decimal("0.00")).quantize(Decimal("0.01"))
        status_counts = {status.value: 0 for status in OrderStatus}
        for order in orders:
            status_counts[order.status.value] = status_counts.get(order.status.value, 0) + 1

        revenue_by_day: dict[str, Decimal] = {}
        for order in orders:
            label = order.created_at.strftime("%Y-%m-%d")
            revenue_by_day[label] = revenue_by_day.get(label, Decimal("0.00")) + order.total_amount

        recent_activity = [
            AdminAnalyticsActivityResponse(
                id=order.id,
                type="order",
                title=f"Order {str(order.id)[:8]}",
                message=f"Status changed to {order.status.value}.",
                created_at=order.created_at,
            )
            for order in sorted(orders, key=lambda item: item.created_at, reverse=True)[:5]
        ]

        trend_points = [
            AdminAnalyticsTrendPoint(
                label=day,
                total_orders=sum(1 for order in orders if order.created_at.strftime("%Y-%m-%d") == day),
                total_sales=sum((order.total_amount for order in orders if order.created_at.strftime("%Y-%m-%d") == day), Decimal("0.00")).quantize(Decimal("0.01")),
            )
            for day in sorted(revenue_by_day)
        ]

        delivery_metrics = await self.repository.delivery_metrics(start, end)
        return AdminAnalyticsResponse(
            range=normalized_range,
            total_users=await self.repository.count_users_in_range(start, end),
            active_users=await self.repository.count_active_users_in_range(start, end),
            total_orders=total_orders,
            total_sales=total_sales,
            pending_orders=status_counts.get(OrderStatus.PENDING.value, 0),
            confirmed_orders=status_counts.get(OrderStatus.CONFIRMED.value, 0),
            completed_orders=status_counts.get(OrderStatus.COMPLETED.value, 0),
            cancelled_orders=status_counts.get(OrderStatus.CANCELLED.value, 0),
            recent_activity=recent_activity,
            revenue_by_day=trend_points,
            **delivery_metrics,
        )

    async def dashboard_summary(self) -> AdminDashboardSummaryResponse:
        total_users = await self.repository.count_users()
        active_users = await self.repository.count_active_users()
        total_farmers = await self.repository.count_genuine_farmers()
        total_consumers = await self.repository.count_genuine_consumers()
        total_admins = await self.repository.count_users_by_role(UserRole.ADMIN)
        total_genuine_users = total_farmers + total_consumers
        total_listings = await self.repository.count_listings()
        active_listings = await self.repository.count_listings_by_status(AvailabilityStatus.AVAILABLE)
        sold_out_listings = await self.repository.count_listings_by_status(AvailabilityStatus.SOLD_OUT)
        total_orders = await self.repository.count_orders()
        pending_orders = await self.repository.count_orders_by_status(OrderStatus.PENDING)
        confirmed_orders = await self.repository.count_orders_by_status(OrderStatus.CONFIRMED)
        completed_orders = await self.repository.count_orders_by_status(OrderStatus.COMPLETED)
        cancelled_orders = await self.repository.count_orders_by_status(OrderStatus.CANCELLED)
        total_payment_volume = await self.repository.total_payment_volume()
        total_reviews = await self.repository.count_reviews()
        total_notifications = await self.repository.count_notifications()
        unread_notifications = await self.repository.count_unread_notifications()
        delivery_metrics = await self.repository.delivery_metrics(
            datetime.min.replace(tzinfo=timezone.utc),
            datetime.now(timezone.utc),
        )
        return AdminDashboardSummaryResponse(
            total_users=total_users,
            active_users=active_users,
            total_farmers=total_farmers,
            total_consumers=total_consumers,
            total_admins=total_admins,
            total_genuine_users=total_genuine_users,
            total_listings=total_listings,
            active_listings=active_listings,
            sold_out_listings=sold_out_listings,
            total_orders=total_orders,
            pending_orders=pending_orders,
            confirmed_orders=confirmed_orders,
            completed_orders=completed_orders,
            cancelled_orders=cancelled_orders,
            total_payment_volume=total_payment_volume,
            total_reviews=total_reviews,
            total_notifications=total_notifications,
            unread_notifications=unread_notifications,
            **delivery_metrics,
        )

    async def list_farmers(self) -> list[AdminFarmerResponse]:
        farmers = await self.repository.list_farmers()
        responses = []
        for farmer in farmers:
            current_listings = [
                listing for listing in farmer.listings
                if listing.availability_status != AvailabilityStatus.UNAVAILABLE
            ]
            responses.append(
                AdminFarmerResponse(
                    id=farmer.id,
                    user_id=farmer.user_id,
                    name=farmer.name,
                    email=farmer.user.email,
                    phone=farmer.phone,
                    address=farmer.address,
                    is_active=farmer.user.is_active,
                    listing_count=len(current_listings),
                    active_listing_count=sum(1 for listing in current_listings if listing.availability_status == AvailabilityStatus.AVAILABLE),
                    order_count=await self.repository.count_orders_for_farmer(farmer.id),
                    total_sales=await self.repository.total_sales_for_farmer(farmer.id),
                    created_at=farmer.created_at,
                )
            )
        return responses

    async def list_consumers(self) -> list[AdminConsumerResponse]:
        consumers = await self.repository.list_consumers()
        responses = []
        for consumer in consumers:
            responses.append(
                AdminConsumerResponse(
                    id=consumer.id,
                    user_id=consumer.user_id,
                    name=consumer.name,
                    email=consumer.user.email,
                    phone=consumer.phone,
                    address=consumer.address,
                    is_active=consumer.user.is_active,
                    order_count=await self.repository.count_orders_for_consumer(consumer.id),
                    total_spend=await self.repository.total_spend_for_consumer(consumer.id),
                    review_count=await self.repository.count_reviews_for_consumer(consumer.id),
                    created_at=consumer.created_at,
                )
            )
        return responses

    async def list_listings(self) -> list[AdminListingResponse]:
        listings = await self.repository.list_listings()
        responses = []
        for listing in listings:
            latest_quality = max(listing.quality_predictions, key=lambda item: item.created_at, default=None)
            latest_price = max(listing.price_predictions, key=lambda item: item.created_at, default=None)
            responses.append(
                AdminListingResponse(
                    id=listing.id,
                    crop_name=listing.crop.name,
                    crop_category=listing.crop.category,
                    farmer_name=listing.farmer.name,
                    farmer_email=listing.farmer.user.email,
                    quantity=listing.quantity,
                    unit=listing.unit,
                    asking_price=listing.asking_price,
                    availability_status=listing.availability_status.value,
                    ai_quality_label=latest_quality.quality_label if latest_quality else None,
                    ai_quality_status=latest_quality.prediction_status if latest_quality else None,
                    ai_price_predicted_price=latest_price.predicted_price if latest_price else None,
                    ai_price_prediction_status=latest_price.prediction_status if latest_price else None,
                    created_at=listing.created_at,
                )
            )
        return responses

    async def list_orders(self) -> list[AdminOrderResponse]:
        orders = await self.repository.list_orders()
        responses = []
        for order in orders:
            responses.append(
                AdminOrderResponse(
                    id=order.id,
                    consumer_name=order.consumer.name if order.consumer else None,
                    consumer_email=order.consumer.user.email if order.consumer and order.consumer.user else None,
                    total_amount=order.total_amount,
                    status=order.status.value,
                    payment_status=order.payment.status.value if order.payment else None,
                    delivery_status=order.delivery.status.value if order.delivery else None,
                    item_count=len(order.items),
                    created_at=order.created_at,
                )
            )
        return responses

    async def list_payments(self) -> list[AdminPaymentResponse]:
        payments = await self.repository.list_payments()
        responses = []
        for payment in payments:
            responses.append(
                AdminPaymentResponse(
                    id=payment.id,
                    order_id=payment.order_id,
                    consumer_name=payment.order.consumer.name if payment.order and payment.order.consumer else None,
                    amount=payment.amount,
                    status=payment.status.value,
                    provider_reference=payment.provider_reference,
                    payment_method=payment.payment_method,
                    created_at=payment.created_at,
                )
            )
        return responses

    async def list_reviews(self) -> list[AdminReviewResponse]:
        reviews = await self.repository.list_reviews()
        responses = []
        for review in reviews:
            responses.append(
                AdminReviewResponse(
                    id=review.id,
                    consumer_name=review.consumer.name if review.consumer else None,
                    crop_name=review.listing.crop.name if review.listing and review.listing.crop else None,
                    farmer_name=review.listing.farmer.name if review.listing and review.listing.farmer else None,
                    rating=review.rating,
                    comment=review.comment,
                    created_at=review.created_at,
                )
            )
        return responses

    async def list_notifications(self) -> list[AdminNotificationResponse]:
        notifications = await self.repository.list_notifications()
        responses = []
        for notification in notifications:
            responses.append(
                AdminNotificationResponse(
                    id=notification.id,
                    user_email=notification.user.email if notification.user else None,
                    notification_type=notification.notification_type.value,
                    title=notification.title,
                    message=notification.message,
                    is_read=notification.is_read,
                    created_at=notification.created_at,
                )
            )
        return responses

    async def list_categories(self) -> list[AdminCategoryResponse]:
        rows = await self.repository.list_categories()
        responses = []
        for category, listing_count, active_listing_count, average_price in rows:
            responses.append(
                AdminCategoryResponse(
                    category=category,
                    listing_count=listing_count,
                    active_listing_count=active_listing_count,
                    average_price=average_price,
                )
            )
        return responses

    async def update_user_status(
        self, user_id: UUID, is_active: bool, actor: LifecycleActor
    ) -> AdminUserStatusResponse:
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            user = await self.repository.get_user_by_id_for_update(user_id)
            if user is None:
                raise LifecycleNotFound("User not found")
            user_state_transitions = {True: {False}, False: {True}}
            if is_active not in user_state_transitions[user.is_active]:
                raise LifecycleConflict("User already has the requested active state")
            from_value = "ACTIVE" if user.is_active else "INACTIVE"
            user = await self.repository.set_user_active_state(user, is_active)
            await self._audit(
                actor,
                "USER_ACTIVATED" if is_active else "USER_DEACTIVATED",
                "user",
                user.id,
                from_value,
                "ACTIVE" if is_active else "INACTIVE",
                None,
            )
            await self.repository.session.refresh(user)
            updated = user
        return AdminUserStatusResponse(
            id=updated.id,
            email=updated.email,
            role=updated.role.value,
            is_active=updated.is_active,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def list_riders(self) -> list[AdminRiderResponse]:
        rows = await self.repository.list_riders()
        return [
            AdminRiderResponse(
                id=rider.id,
                user_id=rider.user_id,
                display_name=rider.display_name or rider.user.email,
                email=rider.user.email,
                approval_status=rider.approval_status,
                availability=rider.availability.value,
                active_shipment_count=active_count,
                completed_delivery_count=completed_count,
            )
            for rider, active_count, completed_count in rows
        ]

    async def update_rider_approval(
        self,
        rider_id: UUID,
        approval_status: RiderApprovalStatus,
        reason: str | None,
        actor: LifecycleActor,
    ) -> AdminRiderResponse:
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            rider = await self.repository.get_rider_for_update(rider_id)
            if rider is None:
                raise LifecycleNotFound("Rider not found")
            current = rider.approval_status
            allowed = {
                RiderApprovalStatus.PENDING_APPROVAL: {RiderApprovalStatus.APPROVED},
                RiderApprovalStatus.APPROVED: {RiderApprovalStatus.SUSPENDED},
                RiderApprovalStatus.SUSPENDED: {RiderApprovalStatus.APPROVED},
            }
            if approval_status not in allowed.get(current, set()):
                raise LifecycleConflict(
                    f"Rider cannot transition from {current.value} to {approval_status.value}"
                )
            active_count = await self.repository.count_active_shipments_for_rider(rider.id)
            if approval_status is RiderApprovalStatus.SUSPENDED and active_count:
                raise LifecycleConflict(
                    "Rider with active shipments must be reassigned or completed before suspension"
                )
            rider.approval_status = approval_status
            if approval_status is RiderApprovalStatus.SUSPENDED:
                rider.availability = RiderAvailability.OFFLINE
            await self.repository.session.flush()
            await self._audit(
                actor,
                f"RIDER_{approval_status.value}",
                "rider",
                rider.id,
                current.value,
                approval_status.value,
                reason,
            )
        active, completed = await self._rider_counts(rider.id)
        return AdminRiderResponse(
            id=rider.id,
            user_id=rider.user_id,
            display_name=rider.display_name or rider.user.email,
            email=rider.user.email,
            approval_status=rider.approval_status,
            availability=rider.availability.value,
            active_shipment_count=active,
            completed_delivery_count=completed,
        )

    async def list_hubs(self) -> list[AdminHubResponse]:
        hubs = await self.repository.list_hubs()
        stocks = await self.repository.hub_stock_rows()
        deliveries = await self.repository.hub_delivery_rows()
        stock_by_hub: dict[UUID, list[AdminHubStockResponse]] = {}
        for stock, crop_name, unit in stocks:
            stock_by_hub.setdefault(stock.hub_id, []).append(
                AdminHubStockResponse(
                    listing_id=stock.listing_id,
                    crop_name=crop_name,
                    quantity=stock.available_quantity,
                    unit=unit,
                )
            )
        deliveries_by_hub: dict[UUID, list[AdminHubDeliveryResponse]] = {}
        for delivery, crop_name, farmer_name in deliveries:
            rows = deliveries_by_hub.setdefault(delivery.hub_id, [])
            if len(rows) < 5:
                rows.append(
                    AdminHubDeliveryResponse(
                        id=delivery.id,
                        crop_name=crop_name,
                        farmer_name=farmer_name,
                        quantity=delivery.quantity,
                        status=delivery.status,
                        created_at=delivery.created_at,
                    )
                )
        return [
            AdminHubResponse(
                id=hub.id,
                name=hub.name,
                address=hub.address,
                pincode=hub.pincode,
                service_radius_km=hub.service_radius_km,
                status=hub.status,
                latitude=latitude,
                longitude=longitude,
                stock=stock_by_hub.get(hub.id, []),
                recent_deliveries=deliveries_by_hub.get(hub.id, []),
            )
            for hub, latitude, longitude in hubs
        ]

    async def create_hub(self, values: dict, actor: LifecycleActor) -> AdminHubResponse:
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            location = WKTElement(
                f"POINT({values['longitude']} {values['latitude']})", srid=4326
            )
            hub = Hub(
                name=values["name"],
                address=values["address"],
                pincode=values["pincode"],
                service_radius_km=values["service_radius_km"],
                status=values["status"],
                location=location,
            )
            self.repository.session.add(hub)
            await self.repository.session.flush()
            await self._audit(
                actor,
                "HUB_CREATED",
                "hub",
                hub.id,
                None,
                self._json_value(values),
                None,
            )
        return AdminHubResponse(
            id=hub.id,
            name=hub.name,
            address=hub.address,
            pincode=hub.pincode,
            service_radius_km=hub.service_radius_km,
            status=hub.status,
            latitude=values["latitude"],
            longitude=values["longitude"],
        )

    async def update_hub(
        self, hub_id: UUID, values: dict, actor: LifecycleActor
    ) -> AdminHubResponse:
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            hub = await self.repository.get_hub_for_update(hub_id)
            if hub is None:
                raise LifecycleNotFound("Hub not found")
            latitude = values.pop("latitude", None)
            longitude = values.pop("longitude", None)
            values = {key: value for key, value in values.items() if value is not None}
            if (latitude is None) != (longitude is None):
                raise ValueError("Latitude and longitude must be provided together")
            before_latitude, before_longitude = await self.repository.hub_coordinates(hub.id)
            if latitude == before_latitude and longitude == before_longitude:
                latitude = longitude = None
            values = {
                key: value for key, value in values.items() if getattr(hub, key) != value
            }
            if not values and latitude is None:
                raise LifecycleConflict("No hub changes were provided")
            if "status" in values:
                permitted_statuses = {
                    HubStatus.ACTIVE: {HubStatus.INACTIVE},
                    HubStatus.INACTIVE: {HubStatus.ACTIVE},
                }
                if values["status"] not in permitted_statuses.get(hub.status, set()):
                    raise LifecycleConflict("Hub is already in the requested status")
            before = {
                key: getattr(hub, key).value if key == "status" else str(getattr(hub, key))
                for key in values
            }
            before["latitude"] = str(before_latitude)
            before["longitude"] = str(before_longitude)
            for key, value in values.items():
                setattr(hub, key, value)
            if latitude is not None and longitude is not None:
                hub.location = WKTElement(f"POINT({longitude} {latitude})", srid=4326)
            elif latitude is None:
                latitude, longitude = before_latitude, before_longitude
            await self.repository.session.flush()
            after = {
                key: value.value if key == "status" else str(value)
                for key, value in values.items()
            }
            after["latitude"] = str(latitude)
            after["longitude"] = str(longitude)
            await self._audit(
                actor,
                "HUB_UPDATED",
                "hub",
                hub.id,
                self._json_value(before),
                self._json_value(after),
                None,
            )
        return await self._get_hub_response(hub.id)

    async def list_hub_staff(self) -> list[AdminHubStaffResponse]:
        return [
            AdminHubStaffResponse(
                user_id=user.id,
                email=user.email,
                display_name=user.email,
                hub_id=hub_id,
                hub_name=hub_name,
            )
            for user, hub_id, hub_name in await self.repository.list_hub_staff()
        ]

    async def create_hub_staff(
        self, email: str, initial_password: str, hub_id: UUID, actor: LifecycleActor
    ) -> AdminHubStaffResponse:
        normalized_email = email.strip().lower()
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            if await self.repository.get_user_by_email(normalized_email) is not None:
                raise LifecycleConflict("An account with this email already exists")
            hub = await self.repository.get_hub_for_update(hub_id)
            if hub is None:
                raise LifecycleNotFound("Hub not found")
            user = User(
                email=normalized_email,
                hashed_password=hash_password(initial_password),
                role=UserRole.HUB_STAFF,
                is_active=True,
            )
            self.repository.session.add(user)
            await self.repository.session.flush()
            self.repository.session.add(HubStaff(user_id=user.id, hub_id=hub.id))
            await self.repository.session.flush()
            await self._audit(
                actor, "HUB_STAFF_CREATED_AND_ASSIGNED", "hub_staff", user.id, None, str(hub.id), None
            )
        return AdminHubStaffResponse(
            user_id=user.id,
            email=user.email,
            display_name=user.email,
            hub_id=hub.id,
            hub_name=hub.name,
        )

    async def assign_hub_staff(
        self, user_id: UUID, hub_id: UUID, actor: LifecycleActor
    ) -> None:
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            user = await self.repository.get_hub_staff_user(user_id)
            if user is None or not user.is_active:
                raise LifecycleNotFound("Active hub staff user not found")
            hub = await self.repository.get_hub_for_update(hub_id)
            if hub is None:
                raise LifecycleNotFound("Hub not found")
            existing = await self.repository.get_hub_staff_assignment(user_id, hub_id)
            if existing is not None:
                raise LifecycleConflict("Hub staff user is already assigned to this hub")
            self.repository.session.add(HubStaff(user_id=user_id, hub_id=hub_id))
            await self.repository.session.flush()
            await self._audit(
                actor, "HUB_STAFF_ASSIGNED", "hub_staff", user_id, None, str(hub_id), None
            )

    async def unassign_hub_staff(
        self, user_id: UUID, hub_id: UUID, actor: LifecycleActor
    ) -> None:
        async with self.repository.session.begin_nested():
            await self._require_admin(actor)
            assignment = await self.repository.get_hub_staff_assignment(user_id, hub_id)
            if assignment is None:
                raise LifecycleNotFound("Hub staff assignment not found")
            await self.repository.session.delete(assignment)
            await self.repository.session.flush()
            await self._audit(
                actor, "HUB_STAFF_UNASSIGNED", "hub_staff", user_id, str(hub_id), None, None
            )

    async def list_shipments(self) -> list[AdminShipmentResponse]:
        return [
            AdminShipmentResponse(
                id=shipment.id,
                order_id=shipment.order_id,
                status=shipment.status.value,
                rider_id=shipment.rider_id,
                rider_name=(
                    shipment.rider.display_name or shipment.rider.user.email
                    if shipment.rider is not None
                    else None
                ),
                hub_id=shipment.hub_id,
                hub_name=shipment.hub.name if shipment.hub is not None else "Direct Farm Pickup",
                pickup_address=shipment.pickup_address_snapshot,
                delivery_address=shipment.dropoff_address_snapshot,
                eta_start=shipment.promised_window_start,
                eta_end=shipment.promised_window_end,
                can_cancel=shipment.status
                in {
                    ShipmentStatus.PACKING,
                    ShipmentStatus.READY_FOR_PICKUP,
                    ShipmentStatus.RIDER_ASSIGNED,
                },
                otp_locked=shipment.otp_attempts >= get_settings().otp_max_attempts,
                created_at=shipment.created_at,
            )
            for shipment in await self.repository.list_shipments()
        ]

    async def _get_hub_response(self, hub_id: UUID) -> AdminHubResponse:
        return next(hub for hub in await self.list_hubs() if hub.id == hub_id)

    async def _rider_counts(self, rider_id: UUID) -> tuple[int, int]:
        return next(
            (active, completed)
            for rider, active, completed in await self.repository.list_riders()
            if rider.id == rider_id
        )

    async def _require_admin(self, actor: LifecycleActor) -> None:
        if actor.user_id is None or actor.role is not UserRole.ADMIN:
            raise LifecyclePermissionError("Admin role required")
        active_admin = await self.repository.session.scalar(
            select(User.id).where(
                User.id == actor.user_id,
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
            )
        )
        if active_admin is None:
            raise LifecyclePermissionError("Active admin actor required")

    async def _audit(
        self,
        actor: LifecycleActor,
        action: str,
        entity_type: str,
        entity_id: UUID,
        from_value: str | None,
        to_value: str | None,
        reason: str | None,
    ) -> None:
        self.repository.session.add(
            AdminAuditEvent(
                actor_user_id=actor.user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                from_value=from_value,
                to_value=to_value,
                reason=reason.strip() if reason and reason.strip() else None,
            )
        )
        await self.repository.session.flush()

    @staticmethod
    def _json_value(value: dict) -> str:
        return json.dumps(
            value,
            sort_keys=True,
            default=lambda item: item.value if isinstance(item, Enum) else str(item),
        )

    async def delete_order(self, order_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_order(order_id)
        if not deleted:
            raise LifecycleNotFound(f"Order {order_id} not found")
        await self._audit(actor, "DELETE", "order", order_id, None, None, "Admin permanently deleted order")

    async def delete_farmer(self, farmer_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_farmer(farmer_id)
        if not deleted:
            raise LifecycleNotFound(f"Farmer {farmer_id} not found")
        await self._audit(actor, "DELETE", "farmer", farmer_id, None, None, "Admin permanently deleted farmer account")

    async def delete_listing(self, listing_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_listing(listing_id)
        if not deleted:
            raise LifecycleNotFound(f"Crop listing {listing_id} not found")
        await self._audit(actor, "DELETE", "crop_listing", listing_id, None, None, "Admin permanently deleted crop listing")

    async def delete_hub_staff(self, user_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_hub_staff(user_id)
        if not deleted:
            raise LifecycleNotFound(f"Hub staff {user_id} not found")
        await self._audit(actor, "DELETE", "hub_staff", user_id, None, None, "Admin permanently deleted hub staff account")

    async def delete_rider(self, rider_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_rider(rider_id)
        if not deleted:
            raise LifecycleNotFound(f"Rider {rider_id} not found")
        await self._audit(actor, "DELETE", "rider", rider_id, None, None, "Admin permanently deleted rider")

    async def delete_shipment(self, shipment_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_shipment(shipment_id)
        if not deleted:
            raise LifecycleNotFound(f"Shipment {shipment_id} not found")
        await self._audit(actor, "DELETE", "shipment", shipment_id, None, None, "Admin permanently deleted shipment")

    async def delete_payment(self, payment_id: UUID, actor: LifecycleActor) -> None:
        await self._require_admin(actor)
        deleted = await self.repository.delete_payment(payment_id)
        if not deleted:
            raise LifecycleNotFound(f"Payment {payment_id} not found")
        await self._audit(actor, "DELETE", "payment", payment_id, None, None, "Admin permanently deleted payment record")
