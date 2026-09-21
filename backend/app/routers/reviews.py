from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.repositories.reviews_repository import ReviewsRepository
from backend.app.schemas.reviews import FarmerRatingSummary, ReviewCreate, ReviewListPage, ReviewResponse, ReviewUpdate
from backend.app.services.notifications_service import NotificationsService
from backend.app.services.reviews_service import ReviewsService

router = APIRouter(tags=["reviews"])


def get_reviews_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> ReviewsService:
    return ReviewsService(
        ReviewsRepository(session),
        ConsumerRepository(session),
        NotificationsService(NotificationRepository(session)),
    )


async def require_consumer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.CONSUMER:
        raise HTTPException(status_code=403, detail="Consumer role required")
    return current_user


@router.post("/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    current_user: Annotated[User, Depends(require_consumer)],
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> ReviewResponse:
    try:
        return await service.create(current_user.id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/listings/{listing_id}/reviews", response_model=ReviewListPage)
async def list_reviews_for_listing(
    listing_id: UUID,
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> ReviewListPage:
    return await service.list_for_listing(listing_id)


@router.get("/farmers/{farmer_id}/reviews", response_model=ReviewListPage)
async def list_reviews_for_farmer(
    farmer_id: UUID,
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> ReviewListPage:
    return await service.list_for_farmer(farmer_id)


@router.get("/reviews/{review_id}", response_model=ReviewResponse)
async def get_review(
    review_id: UUID,
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> ReviewResponse:
    try:
        return await service.get(review_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/reviews/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: UUID,
    payload: ReviewUpdate,
    current_user: Annotated[User, Depends(require_consumer)],
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> ReviewResponse:
    try:
        return await service.update(current_user.id, review_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/reviews/{review_id}", response_model=dict[str, bool])
async def delete_review(
    review_id: UUID,
    current_user: Annotated[User, Depends(require_consumer)],
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> dict[str, bool]:
    try:
        return await service.delete(current_user.id, review_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/farmers/{farmer_id}/rating-summary", response_model=FarmerRatingSummary)
async def farmer_rating_summary(
    farmer_id: UUID,
    service: Annotated[ReviewsService, Depends(get_reviews_service)],
) -> FarmerRatingSummary:
    return await service.rating_summary(farmer_id)
