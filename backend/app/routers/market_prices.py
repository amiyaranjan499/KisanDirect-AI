from typing import Annotated

from fastapi import APIRouter, Depends, Query

from backend.app.dependencies import get_current_user
from backend.app.models import User
from backend.app.schemas.market_price import MarketPriceResponse
from backend.app.services.market_price_service import MarketPriceService

router = APIRouter(prefix="/market-prices", tags=["market-prices"])

_market_service: MarketPriceService | None = None


def get_market_price_service() -> MarketPriceService:
    global _market_service
    if _market_service is None:
        _market_service = MarketPriceService()
    return _market_service


@router.get("/latest", response_model=MarketPriceResponse)
async def get_latest_market_price(
    crop: str = Query(..., description="Crop name e.g. potato, tomato, onion"),
    state: str | None = Query(default=None, description="State name e.g. Maharashtra, Karnataka"),
    district: str | None = Query(default=None, description="District name e.g. Pune, Kolar"),
    _user: Annotated[User, Depends(get_current_user)] = None,
    service: Annotated[MarketPriceService, Depends(get_market_price_service)] = None,
) -> MarketPriceResponse:
    return service.get_market_price(crop_name=crop, state=state, district=district)

