from uuid import UUID

from pydantic import BaseModel, Field

from backend.app.schemas.consumer import MarketplaceListingResponse
from backend.app.schemas.farmer import LocationInput


class NearbyFarmerResponse(BaseModel):
    id: UUID
    name: str
    location: LocationInput
    distance_km: float
    rating: float | None
    active_listing_count: int
    listings: list[MarketplaceListingResponse] = Field(default_factory=list)
    city: str | None = None
    district: str | None = None
    state: str | None = None
    address: str | None = None
    pin_code: str | None = None
    profile_image: str | None = None
    cover_image: str | None = None


class NearbyFarmerPage(BaseModel):
    items: list[NearbyFarmerResponse]
    latitude: float
    longitude: float
    radius_km: float
    page: int
    page_size: int
    total: int
    pages: int
