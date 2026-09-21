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
