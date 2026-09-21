from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.schemas.consumer import MarketplaceListingFilters, MarketplacePage, MarketplaceListingResponse, FarmerMarketplaceResponse
from backend.app.schemas.nearby import NearbyFarmerPage
from backend.app.services.consumer_service import ConsumerService

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def get_marketplace_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ConsumerService:
    return ConsumerService(ConsumerRepository(session))


async def require_consumer(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role is not UserRole.CONSUMER:
        raise HTTPException(status_code=403, detail="Consumer role required")
    return current_user


@router.get("/listings", response_model=MarketplacePage)
async def browse_listings(
    _consumer: Annotated[User, Depends(require_consumer)],
    service: Annotated[ConsumerService, Depends(get_marketplace_service)],
    search: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=120),
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    quality: str | None = Query(default=None, max_length=80),
    min_distance_km: float | None = Query(default=None, ge=0),
    max_distance_km: float | None = Query(default=None, ge=0),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    sort: str = Query(default="newest", pattern="^(newest|price_asc|price_desc|nearest|highest_rated)$"),
) -> MarketplacePage:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="min_price cannot exceed max_price")
    return await service.browse_listings(
        MarketplaceListingFilters(
            search=search,
            category=category,
            min_price=min_price,
            max_price=max_price,
            sort=sort,
            quality=quality,
            min_distance_km=min_distance_km,
            max_distance_km=max_distance_km,
            min_rating=min_rating,
            latitude=latitude,
            longitude=longitude,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/listings/{listing_id}", response_model=MarketplaceListingResponse)
async def listing_details(
    listing_id: UUID,
    _consumer: Annotated[User, Depends(require_consumer)],
    service: Annotated[ConsumerService, Depends(get_marketplace_service)],
) -> MarketplaceListingResponse:
    try:
        return await service.get_listing(listing_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/farmers/nearby", response_model=NearbyFarmerPage)
async def nearby_farmers(
    _consumer: Annotated[User, Depends(require_consumer)],
    service: Annotated[ConsumerService, Depends(get_marketplace_service)],
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=25, gt=0, le=500),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
) -> NearbyFarmerPage:
    return await service.nearby_farmers(latitude, longitude, radius_km, page, page_size)


@router.get("/farmers/{farmer_id}", response_model=FarmerMarketplaceResponse)
async def farmer_details(
    farmer_id: UUID,
    _consumer: Annotated[User, Depends(require_consumer)],
    service: Annotated[ConsumerService, Depends(get_marketplace_service)],
) -> FarmerMarketplaceResponse:
    try:
        return await service.get_farmer(farmer_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
