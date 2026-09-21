from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class QualityPredictionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    listing_id: UUID | None
    image_id: UUID | None
    quality_label: str | None
    model_name: str
    model_version: str | None
    prediction_status: str
    confidence: float | None
    result_metadata: dict | None
    created_at: datetime
