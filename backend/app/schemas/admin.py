from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models import HubStatus, RiderApprovalStatus


class AdminDashboardSummaryResponse(BaseModel):
    total_users: int
    active_users: int
    total_farmers: int
    total_consumers: int
    total_admins: int
    total_genuine_users: int = 0
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
    active_shipments: int = 0
    average_placed_to_delivered_minutes: float | None = None
    failed_deliveries: int = 0


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
    active_shipments: int = 0
    average_placed_to_delivered_minutes: float | None = None
    failed_deliveries: int = 0


class AdminRiderResponse(BaseModel):
    id: UUID
    user_id: UUID
    display_name: str
    email: str
    approval_status: RiderApprovalStatus
    availability: str
    active_shipment_count: int
    completed_delivery_count: int


class AdminRiderStatusUpdate(BaseModel):
    approval_status: RiderApprovalStatus
    reason: str | None = Field(default=None, max_length=1000)


class AdminHubCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    address: str = Field(min_length=1, max_length=500)
    pincode: str = Field(pattern=r"^\d{6}$")
    service_radius_km: Decimal = Field(gt=Decimal("0"), max_digits=6, decimal_places=2)
    status: HubStatus = HubStatus.ACTIVE
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AdminHubUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    address: str | None = Field(default=None, min_length=1, max_length=500)
    pincode: str | None = Field(default=None, pattern=r"^\d{6}$")
    service_radius_km: Decimal | None = Field(
        default=None, gt=Decimal("0"), max_digits=6, decimal_places=2
    )
    status: HubStatus | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class AdminHubStockResponse(BaseModel):
    listing_id: UUID
    crop_name: str
    quantity: Decimal
    unit: str


class AdminHubDeliveryResponse(BaseModel):
    id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    status: str
    created_at: datetime


class AdminHubResponse(BaseModel):
    id: UUID
    name: str
    address: str
    pincode: str
    service_radius_km: Decimal
    status: HubStatus
    latitude: float
    longitude: float
    stock: list[AdminHubStockResponse] = Field(default_factory=list)
    recent_deliveries: list[AdminHubDeliveryResponse] = Field(default_factory=list)


class AdminHubStaffResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    hub_id: UUID | None = None
    hub_name: str | None = None


class AdminHubStaffAssignment(BaseModel):
    user_id: UUID
    hub_id: UUID


class AdminHubStaffCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    initial_password: str = Field(min_length=12, max_length=128)
    hub_id: UUID


class AdminShipmentResponse(BaseModel):
    id: UUID
    order_id: UUID
    status: str
    rider_id: UUID | None
    rider_name: str | None
    hub_id: UUID
    hub_name: str
    pickup_address: str
    delivery_address: str
    eta_start: datetime | None
    eta_end: datetime | None
    can_cancel: bool
    otp_locked: bool
    created_at: datetime


class AdminShipmentReassign(BaseModel):
    rider_user_id: UUID
    reason: str = Field(min_length=1, max_length=1000)


class AdminShipmentCancel(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class AdminUserStatusUpdate(BaseModel):
    is_active: bool = Field(default=True)


class OtpResetRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class AdminUserStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
