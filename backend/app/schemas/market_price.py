from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MarketPriceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    commodity: str
    commodity_display: str
    state: str | None = None
    district: str | None = None
    market_name: str | None = None
    market_price: Decimal | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    price_trend: str = "Stable"
    market_source: str
    market_timestamp: datetime | str | None = None
    currency: str = "INR"
    unit: str = "kg"
    status: str
    message: str | None = None
