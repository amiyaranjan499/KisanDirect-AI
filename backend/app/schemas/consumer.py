from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.farmer import LocationInput


class ConsumerProfileUpdate(BaseModel):
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


class ConsumerProfileResponse(BaseModel):
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
    created_at: datetime
    updated_at: datetime


class ConsumerDashboardOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    subtotal: Decimal


class ConsumerDashboardOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farmer_name: str | None
    crop_name: str | None
    quantity: Decimal | None
    amount: Decimal
    status: str
    payment_status: str
    delivery_status: str
    order_date: datetime
    item_count: int
    items: list[ConsumerDashboardOrderItemResponse] = Field(default_factory=list)


class ConsumerDashboardPurchaseHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    crop_name: str | None
    farmer_name: str | None
    quantity: Decimal
    amount: Decimal
    order_date: datetime
    payment_status: str
    fulfillment_status: str


class ConsumerDashboardCartSummaryResponse(BaseModel):
    item_count: int
    total_quantity: Decimal
    subtotal: Decimal


class ConsumerDashboardReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    rating: int
    comment: str
    created_at: datetime


class ConsumerDashboardActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    title: str
    message: str
    created_at: datetime


class ConsumerDashboardSummaryResponse(BaseModel):
    total_orders: int
    pending_orders: int
    confirmed_orders: int
    completed_orders: int
    cancelled_orders: int
    total_purchase_value: Decimal
    unread_notification_count: int
    recent_orders: list[ConsumerDashboardOrderResponse] = Field(default_factory=list)
    recent_activity: list[ConsumerDashboardActivityResponse] = Field(default_factory=list)


class MarketplaceListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    crop_name: str
    category: str | None
    quantity: Decimal
    unit: str
    asking_price: Decimal
    description: str | None
    harvest_date: datetime | None
    availability_status: str
    location: LocationInput | None
    farmer_name: str
    farmer_id: UUID
    distance_km: float | None
    quality: str | None
    quality_score: float | None
    ai_recommended_price: Decimal | None
    farmer_rating: float | None
    minimum_order_quantity: Decimal | None
    images: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class MarketplaceListingFilters(BaseModel):
    search: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=120)
    min_price: Decimal | None = Field(default=None, ge=0)
    max_price: Decimal | None = Field(default=None, ge=0)
    quality: str | None = Field(default=None, max_length=80)
    min_distance_km: float | None = Field(default=None, ge=0)
    max_distance_km: float | None = Field(default=None, ge=0)
    min_rating: float | None = Field(default=None, ge=0, le=5)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=12, ge=1, le=50)
    sort: str = Field(default="newest", pattern="^(newest|price_asc|price_desc|nearest|highest_rated)$")


class MarketplacePage(BaseModel):
    items: list[MarketplaceListingResponse]
    page: int
    page_size: int
    total: int
    pages: int


class FarmerMarketplaceResponse(BaseModel):
    id: UUID
    name: str
    location: LocationInput | None
    rating: float | None
    listings: list[MarketplaceListingResponse]
