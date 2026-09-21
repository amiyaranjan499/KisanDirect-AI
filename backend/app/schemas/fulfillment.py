from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FulfillmentCreate(BaseModel):
    method: str = Field(pattern="^(DELIVERY|FARMER_PICKUP)$")
    address: str | None = Field(default=None, min_length=5, max_length=2000)
    village: str | None = Field(default=None, max_length=160)
    post_office: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=160)
    district: str | None = Field(default=None, max_length=160)
    state: str | None = Field(default=None, max_length=80)
    pin_code: str | None = Field(default=None, pattern=r"^\d{6}$")
    address_line: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    scheduled_at: datetime | None = None


class FulfillmentStatusUpdate(BaseModel):
    status: str = Field(pattern="^(CONFIRMED|READY|OUT_FOR_DELIVERY|DELIVERED|PICKED_UP|CANCELLED)$")


class FulfillmentResponse(BaseModel):
    id: UUID
    order_id: UUID
    method: str
    status: str
    address: str | None
    recipient_name: str | None
    recipient_phone: str | None
    village: str | None
    post_office: str | None
    city: str | None
    district: str | None
    state: str | None
    pin_code: str | None
    address_line: str | None
    latitude: float | None
    longitude: float | None
    pickup_location: str | None
    scheduled_at: datetime | None
    created_at: datetime
    updated_at: datetime
