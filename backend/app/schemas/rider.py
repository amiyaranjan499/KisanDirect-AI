from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RiderSelfResponse(BaseModel):
    approval_status: str
    availability: str
    id: UUID | None = None
    display_name: str | None = None
    vehicle_type: str | None = None
    email: str | None = None
    created_at: datetime | None = None


class RiderProfileUpdate(BaseModel):
    display_name: str | None = None
    vehicle_type: str | None = None


class RiderAvailabilityUpdate(BaseModel):
    online: bool


class RiderLocationCreate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: Decimal | None = Field(default=None, ge=0, max_digits=8, decimal_places=2)


class RiderOfferResponse(BaseModel):
    id: UUID
    shipment_id: UUID
    offered_at: datetime
    expires_at: datetime
    hub_name: str
    pickup_address: str
    dropoff_address: str


class RiderOfferActionResponse(BaseModel):
    status: str


class RiderLocationResponse(BaseModel):
    stored: bool


class RiderShipmentResponse(BaseModel):
    id: UUID
    order_id: UUID
    status: str
    hub_name: str
    pickup_address: str
    pickup_maps_url: str
    dropoff_address: str
    promised_window_start: datetime
    promised_window_end: datetime
    payment_method: str | None
    payment_status: str | None


class RiderShipmentStatusUpdate(BaseModel):
    status: Literal["PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED"]


class RiderCompletedShipmentResponse(BaseModel):
    id: UUID
    order_id: UUID
    hub_name: str
    delivered_at: datetime


class RiderHistoryResponse(BaseModel):
    completed_deliveries: list[RiderCompletedShipmentResponse]
    delivery_count: int
    earnings_message: str


class RiderOtpVerificationRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
