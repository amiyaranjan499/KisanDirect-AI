from uuid import UUID

from backend.app.models import AvailabilityStatus, OrderStatus, UserRole
from backend.app.repositories.admin_repository import AdminRepository
from backend.app.schemas.admin import (
    AdminCategoryResponse,
    AdminConsumerResponse,
    AdminDashboardSummaryResponse,
    AdminFarmerResponse,
    AdminListingResponse,
    AdminNotificationResponse,
    AdminOrderResponse,
    AdminPaymentResponse,
    AdminReviewResponse,
    AdminUserStatusResponse,
)


class AdminService:
    def __init__(self, repository: AdminRepository) -> None:
        self.repository = repository

    async def dashboard_summary(self) -> AdminDashboardSummaryResponse:
        total_users = await self.repository.count_users()
        active_users = await self.repository.count_active_users()
        total_farmers = await self.repository.count_users_by_role(UserRole.FARMER)
        total_consumers = await self.repository.count_users_by_role(UserRole.CONSUMER)
        total_admins = await self.repository.count_users_by_role(UserRole.ADMIN)
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
        return AdminDashboardSummaryResponse(
            total_users=total_users,
            active_users=active_users,
            total_farmers=total_farmers,
            total_consumers=total_consumers,
            total_admins=total_admins,
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
        )

    async def list_farmers(self) -> list[AdminFarmerResponse]:
        farmers = await self.repository.list_farmers()
        responses = []
        for farmer in farmers:
            responses.append(
                AdminFarmerResponse(
                    id=farmer.id,
                    user_id=farmer.user_id,
                    name=farmer.name,
                    email=farmer.user.email,
                    phone=farmer.phone,
                    address=farmer.address,
                    is_active=farmer.user.is_active,
                    listing_count=len(farmer.listings),
                    active_listing_count=sum(1 for listing in farmer.listings if listing.availability_status == AvailabilityStatus.AVAILABLE),
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

    async def update_user_status(self, user_id: UUID, is_active: bool) -> AdminUserStatusResponse:
        user = await self.repository.get_user_by_id(user_id)
        if user is None:
            raise LookupError("User not found")
        updated = await self.repository.set_user_active_state(user, is_active)
        return AdminUserStatusResponse(
            id=updated.id,
            email=updated.email,
            role=updated.role.value,
            is_active=updated.is_active,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )
