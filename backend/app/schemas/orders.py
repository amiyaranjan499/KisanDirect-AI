from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from backend.app.schemas.payments import PaymentResponse


class CartItemCreate(BaseModel):
    listing_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class CartItemUpdate(BaseModel):
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class CartItemResponse(BaseModel):
    id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    available_quantity: Decimal
    minimum_order_quantity: Decimal
    unit: str
    unit_price: Decimal
    subtotal: Decimal
    image_url: str | None = None


class CartResponse(BaseModel):
    id: UUID
    items: list[CartItemResponse]
    subtotal: Decimal
    delivery_fee: Decimal = Decimal("0.00")
    platform_fee: Decimal = Decimal("0.00")
    total: Decimal = Decimal("0.00")
    total_quantity: Decimal


class OrderItemResponse(BaseModel):
    id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    subtotal: Decimal


class OrderResponse(BaseModel):
    id: UUID
    consumer_id: UUID
    status: str
    subtotal: Decimal = Decimal("0.00")
    delivery_fee: Decimal = Decimal("0.00")
    platform_fee: Decimal = Decimal("0.00")
    total_amount: Decimal
    hub_id: UUID | None = None
    delivery_address: str | None = None
    delivery_slot_id: UUID | None = None
    promised_window_start: datetime | None = None
    promised_window_end: datetime | None = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]
    payment: "PaymentResponse | None" = None


class CheckoutRequest(BaseModel):
    hub_id: UUID | None = None
    delivery_slot_id: UUID | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str = Field(min_length=5, max_length=2000)


class CheckoutUnavailableItem(BaseModel):
    listing_id: UUID
    crop_name: str
    requested_quantity: Decimal
    available_quantity: Decimal
    unit: str


class CheckoutSlotOption(BaseModel):
    id: UUID
    starts_at: datetime
    ends_at: datetime
    remaining_capacity: int


class CheckoutHubOption(BaseModel):
    id: UUID
    name: str
    address: str
    distance_km: float
    available: bool
    unavailable_items: list[CheckoutUnavailableItem]
    eta_min_minutes: int
    eta_max_minutes: int
    slots: list[CheckoutSlotOption]


class CheckoutOptionsResponse(BaseModel):
    item_count: int
    subtotal: Decimal
    delivery_fee: Decimal
    platform_fee: Decimal
    total: Decimal
    reservation_ttl_minutes: int
    hubs: list[CheckoutHubOption]


class OrderPage(BaseModel):
    items: list[OrderResponse]
    page: int
    page_size: int
    total: int
    pages: int


class TrackingEventResponse(BaseModel):
    status: str
    occurred_at: datetime


class TrackingLocationResponse(BaseModel):
    latitude: float
    longitude: float
    recorded_at: datetime


class OrderTrackingResponse(BaseModel):
    order_id: UUID
    order_status: str
    shipment_status: str | None
    events: list[TrackingEventResponse]
    pickup_address: str | None
    pickup_location: TrackingLocationResponse | None
    delivery_address: str | None
    delivery_location: TrackingLocationResponse | None
    rider_name: str | None
    rider_vehicle: str | None
    rider_location: TrackingLocationResponse | None
    rider_location_available: bool
    promised_window_start: datetime | None
    promised_window_end: datetime | None
    delivery_otp: str | None
    review_listing_ids: list[UUID]
    can_cancel: bool


class OrderStatusUpdate(BaseModel):
    status: str = Field(pattern="^(CONFIRMED|PROCESSING|CANCELLED|COMPLETED)$")
    reason: str | None = Field(default=None, max_length=1000)
