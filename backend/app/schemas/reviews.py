from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    listing_id: UUID
    order_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, min_length=1, max_length=2000)


class ReviewConsumerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    consumer_id: UUID
    order_id: UUID
    listing_id: UUID
    rating: int
    comment: str
    reviewer_name: str
    farmer_name: str
    crop_name: str
    created_at: datetime
    updated_at: datetime


class ReviewListPage(BaseModel):
    items: list[ReviewResponse]
    total: int
    page: int
    page_size: int
    pages: int


class FarmerRatingSummary(BaseModel):
    farmer_id: UUID
    average_rating: float | None
    review_count: int
