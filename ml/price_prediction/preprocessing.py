from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class PriceFeatures:
    crop_name: str
    category: str | None
    quantity: Decimal
    unit: str
    latitude: float | None
    longitude: float | None
    quality_grade: str | None
    harvest_date: str | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "crop_name": self.crop_name,
            "category": self.category,
            "quantity": str(self.quantity),
            "unit": self.unit,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "quality_grade": self.quality_grade,
            "harvest_date": self.harvest_date,
        }
