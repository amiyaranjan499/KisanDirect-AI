from typing import Any

from pydantic import BaseModel, ConfigDict


class CropClassificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    crop_name: str | None
    category: str | None
    source: str = "local"  # "local" or "gemini"
    prediction_status: str
    metadata: dict[str, Any] | None = None
