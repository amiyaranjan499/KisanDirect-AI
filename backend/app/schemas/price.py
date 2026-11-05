from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PricePredictionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    listing_id: UUID | None
    predicted_price: Decimal | None
    currency: str
    unit: str | None
    model_name: str
    model_version: str | None
    prediction_status: str
    confidence: float | None
    input_features: dict | None
    result_metadata: dict | None
    created_at: datetime


class PricePredictionQuery(BaseModel):
    quality_grade: str | None = Field(default=None, max_length=80)
    crop_name: str | None = Field(default=None, max_length=120)
    quantity: Decimal | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=32)
    market_price: Decimal | None = Field(default=None, ge=0)
    state: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    harvest_date: str | None = None


class PriceEstimateRequest(BaseModel):
    crop_name: str = Field(..., max_length=120)
    quality_grade: str | None = Field(default="Grade B", max_length=80)
    quantity: Decimal = Field(default=Decimal("10"), gt=0)
    unit: str = Field(default="kg", max_length=32)
    market_price: Decimal | None = Field(default=None, ge=0)
    state: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    harvest_date: str | None = None


class PriceEstimateResponse(BaseModel):
    crop_name: str
    predicted_price: Decimal | None
    currency: str
    unit: str
    model_name: str
    model_version: str | None
    prediction_status: str
    confidence: float | None
    total_estimated_value: Decimal | None
    result_metadata: dict | None
