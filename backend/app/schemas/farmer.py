from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LocationInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class FarmerProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = None
    state: str | None = Field(default=None, min_length=2, max_length=80)
    village: str | None = Field(default=None, max_length=160)
    post_office: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=160)
    district: str | None = Field(default=None, max_length=160)
    pin_code: str | None = Field(default=None, pattern=r"^\d{6}$")
    address_line: str | None = None
    location: LocationInput | None = None
    profile_image: str | None = None
    cover_image: str | None = None


class FarmerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    phone: str | None
    address: str | None
    state: str | None
    village: str | None
    post_office: str | None
    city: str | None
    district: str | None
    pin_code: str | None
    address_line: str | None
    location: LocationInput | None
    profile_image: str | None = None
    cover_image: str | None = None
    created_at: datetime
    updated_at: datetime


class CropListingCreate(BaseModel):
    crop_name: str = Field(min_length=1, max_length=120)
    crop_category: str | None = Field(default=None, max_length=120)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: str = Field(min_length=1, max_length=32)
    asking_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    description: str | None = None
    harvest_date: datetime | None = None
    location: LocationInput | None = None

    @field_validator("crop_name", "unit")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value must not be blank")
        return value


class CropListingUpdate(BaseModel):
    crop_name: str | None = Field(default=None, min_length=1, max_length=120)
    crop_category: str | None = Field(default=None, max_length=120)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=3)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    asking_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    description: str | None = None
    harvest_date: datetime | None = None
    location: LocationInput | None = None
    availability_status: str | None = None


class CropImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    listing_id: UUID
    storage_url: str
    content_type: str | None
    created_at: datetime


class CropListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    crop_name: str
    crop_category: str | None
    farmer_id: UUID
    quantity: Decimal
    unit: str
    asking_price: Decimal
    description: str | None
    harvest_date: datetime | None
    availability_status: str
    location: LocationInput | None
    images: list[CropImageResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DashboardListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    crop_name: str
    crop_category: str | None
    farmer_id: UUID
    quantity: Decimal
    unit: str
    asking_price: Decimal
    description: str | None
    harvest_date: datetime | None
    availability_status: str
    location: LocationInput | None
    images: list[CropImageResponse] = Field(default_factory=list)
    ai_quality_label: str | None = None
    ai_quality_status: str | None = None
    ai_quality_confidence: float | None = None
    ai_price_predicted_price: Decimal | None = None
    ai_price_prediction_status: str | None = None
    ai_price_confidence: float | None = None
    created_at: datetime
    updated_at: datetime


class DashboardOrderItemResponse(BaseModel):
    id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    subtotal: Decimal


class DashboardOrderResponse(BaseModel):
    id: UUID
    consumer_id: UUID
    consumer_name: str | None = None
    hub_name: str | None = None
    status: str
    total_amount: Decimal
    payment_status: str | None = None
    payment_provider_reference: str | None = None
    fulfillment_method: str | None = None
    fulfillment_status: str | None = None
    order_date: datetime
    items: list[DashboardOrderItemResponse] = Field(default_factory=list)


class DashboardAnalyticsActivityResponse(BaseModel):
    type: str
    title: str
    message: str
    created_at: datetime


class DashboardRecentOrderResponse(BaseModel):
    id: UUID
    consumer_name: str | None = None
    total_amount: Decimal
    status: str
    created_at: datetime


class DashboardAnalyticsResponse(BaseModel):
    total_sales: str
    orders_by_status: dict[str, int]
    crop_wise_order_count: dict[str, int]
    crop_wise_sales: dict[str, Decimal]
    recent_orders: list[DashboardRecentOrderResponse] = Field(default_factory=list)
    recent_activity: list[DashboardAnalyticsActivityResponse] = Field(default_factory=list)


class DashboardSummaryResponse(BaseModel):
    total_listings: int
    active_listings: int
    inactive_listings: int
    total_orders_received: int
    active_orders: int = 0
    pending_orders: int
    confirmed_orders: int
    completed_orders: int
    cancelled_orders: int
    total_sales: str
    average_rating: float | None
    total_reviews: int
    unread_notification_count: int


class DashboardReviewResponse(BaseModel):
    id: UUID
    consumer_id: UUID
    order_id: UUID
    listing_id: UUID
    rating: int
    comment: str
    reviewer_name: str
    farmer_name: str
    crop_name: str
    created_at: datetime
    updated_at: datetime


class DashboardReviewsResponse(BaseModel):
    average_rating: float | None
    review_count: int
    rating_distribution: dict[str, int]
    recent_reviews: list[DashboardReviewResponse] = Field(default_factory=list)


class DashboardAIQualityAssessmentResponse(BaseModel):
    id: UUID
    listing_id: UUID | None
    crop_name: str | None = None
    quality_label: str | None = None
    prediction_status: str
    confidence: float | None = None
    created_at: datetime


class DashboardAIPredictionResponse(BaseModel):
    id: UUID
    listing_id: UUID | None
    crop_name: str | None = None
    predicted_price: Decimal | None = None
    currency: str
    unit: str | None = None
    prediction_status: str
    confidence: float | None = None
    created_at: datetime


class DashboardAISummaryResponse(BaseModel):
    quality_assessments: list[DashboardAIQualityAssessmentResponse] = Field(default_factory=list)
    price_predictions: list[DashboardAIPredictionResponse] = Field(default_factory=list)


class FarmerFacilityCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=5)
    village_or_locality: str | None = None
    district: str | None = None
    state: str | None = None
    pincode: str = Field(pattern=r"^[1-9][0-9]{5}$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    service_radius_km: Decimal = Field(default=Decimal("8.00"), gt=0, le=100)


class FarmerFacilityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    address: str | None = Field(default=None, min_length=5)
    village_or_locality: str | None = None
    district: str | None = None
    state: str | None = None
    pincode: str | None = Field(default=None, pattern=r"^[1-9][0-9]{5}$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    service_radius_km: Decimal | None = Field(default=None, gt=0, le=100)
    status: str | None = None


class FarmerFacilityResponse(BaseModel):
    id: UUID
    name: str
    address: str
    pincode: str
    latitude: float | None = None
    longitude: float | None = None
    service_radius_km: Decimal
    status: str
    farmer_id: UUID
    staff_count: int = 0
    created_at: datetime
    updated_at: datetime


class FarmerStaffCreate(BaseModel):
    email: EmailStr
    initial_password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=160)


class FarmerStaffResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    facility_id: UUID
    facility_name: str
    is_active: bool
    created_at: datetime


class FarmerOrderAssignStaffRequest(BaseModel):
    facility_id: UUID
    staff_user_id: UUID | None = None
    notes: str | None = None


class FarmerOrderPreparePersonallyRequest(BaseModel):
    notes: str | None = None


class FarmerWalletWithdrawalRequest(BaseModel):
    amount: Decimal = Field(gt=Decimal("0.00"), description="Withdrawal amount in INR")
    payout_method: Literal["BANK_TRANSFER", "UPI"] = Field(default="BANK_TRANSFER")
    account_holder_name: str = Field(min_length=2, max_length=160)
    account_number: str | None = Field(default=None, max_length=64)
    ifsc_code: str | None = Field(default=None, max_length=32)
    bank_name: str | None = Field(default=None, max_length=120)
    upi_id: str | None = Field(default=None, max_length=80)
    note: str | None = None


class FarmerWithdrawalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    amount: Decimal
    payout_method: str
    account_holder_name: str
    account_number: str | None = None
    ifsc_code: str | None = None
    bank_name: str | None = None
    upi_id: str | None = None
    status: str
    reference_id: str
    note: str | None = None
    created_at: datetime
    processed_at: datetime | None = None


class FarmerWalletResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_earned: Decimal
    withdrawn_total: Decimal
    pending_withdrawals: Decimal
    available_balance: Decimal
    currency: str = "INR"
    withdrawals: list[FarmerWithdrawalResponse]

