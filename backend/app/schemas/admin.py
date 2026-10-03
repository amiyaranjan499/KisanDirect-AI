from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AdminDashboardSummaryResponse(BaseModel):
    total_users: int
    active_users: int
    total_farmers: int
    total_consumers: int
    total_admins: int
    total_listings: int
    active_listings: int
    sold_out_listings: int
    total_orders: int
    pending_orders: int
    confirmed_orders: int
    completed_orders: int
    cancelled_orders: int
    total_payment_volume: Decimal
    total_reviews: int
    total_notifications: int
    unread_notifications: int


class AdminFarmerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    email: str
    phone: str | None
    address: str | None
    is_active: bool
    listing_count: int = 0
    active_listing_count: int = 0
    order_count: int = 0
    total_sales: Decimal = Decimal("0.00")
    created_at: datetime


class AdminConsumerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    email: str
    phone: str | None
    address: str | None
    is_active: bool
    order_count: int = 0
    total_spend: Decimal = Decimal("0.00")
    review_count: int = 0
    created_at: datetime


class AdminListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    crop_name: str
    crop_category: str | None
    farmer_name: str
    farmer_email: str | None
    quantity: Decimal
    unit: str
    asking_price: Decimal
    availability_status: str
    ai_quality_label: str | None = None
    ai_quality_status: str | None = None
    ai_price_predicted_price: Decimal | None = None
    ai_price_prediction_status: str | None = None
    created_at: datetime


class AdminOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    consumer_name: str | None = None
    consumer_email: str | None = None
    total_amount: Decimal
    status: str
    payment_status: str | None = None
    delivery_status: str | None = None
    item_count: int = 0
    created_at: datetime


class AdminPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    consumer_name: str | None = None
    amount: Decimal
    status: str
    provider_reference: str | None = None
    payment_method: str | None = None
    created_at: datetime


class AdminReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    consumer_name: str | None = None
    crop_name: str | None = None
    farmer_name: str | None = None
    rating: int
    comment: str
    created_at: datetime


class AdminCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: str | None
    listing_count: int
    active_listing_count: int
    average_price: Decimal | None = None


class AdminNotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_email: str | None = None
    notification_type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime


class AdminAnalyticsActivityResponse(BaseModel):
    id: UUID | None = None
    type: str
    title: str
    message: str
    created_at: datetime


class AdminAnalyticsTrendPoint(BaseModel):
    label: str
    total_orders: int = 0
    total_sales: Decimal = Decimal("0.00")


class AdminAnalyticsResponse(BaseModel):
    range: str
    total_users: int
    active_users: int
    total_orders: int
    total_sales: Decimal
    pending_orders: int
    confirmed_orders: int
    completed_orders: int
    cancelled_orders: int
    recent_activity: list[AdminAnalyticsActivityResponse] = Field(default_factory=list)
    revenue_by_day: list[AdminAnalyticsTrendPoint] = Field(default_factory=list)


class AdminUserStatusUpdate(BaseModel):
    is_active: bool = Field(default=True)


class AdminUserStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
