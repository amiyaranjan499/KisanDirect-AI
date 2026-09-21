from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.farmer_repository import FarmerRepository
from backend.app.schemas.farmer import (
    CropImageResponse,
    CropListingCreate,
    CropListingResponse,
    CropListingUpdate,
    DashboardAISummaryResponse,
    DashboardAnalyticsResponse,
    DashboardListingResponse,
    DashboardOrderResponse,
    DashboardReviewsResponse,
    DashboardSummaryResponse,
    FarmerProfileResponse,
    FarmerProfileUpdate,
)
from backend.app.services.farmer_service import FarmerService

router = APIRouter(prefix="/farmers", tags=["farmers"])


def get_farmer_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> FarmerService:
    return FarmerService(FarmerRepository(session), Path(__file__).resolve().parents[2] / "storage" / "uploads")


async def get_authenticated_farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.get("/me", response_model=FarmerProfileResponse)
async def get_profile(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerProfileResponse:
    try:
        return await service.profile(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/me", response_model=FarmerProfileResponse)
async def update_profile(
    payload: FarmerProfileUpdate,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerProfileResponse:
    try:
        return await service.update_profile(current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/me/listings", response_model=list[CropListingResponse])
async def list_my_listings(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> list[CropListingResponse]:
    return await service.list_listings(current_user.id)


@router.post("/me/listings", response_model=CropListingResponse, status_code=status.HTTP_201_CREATED)
async def create_listing(
    payload: CropListingCreate,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> CropListingResponse:
    return await service.create_listing(current_user.id, payload)


@router.patch("/me/listings/{listing_id}", response_model=CropListingResponse)
async def update_listing(
    listing_id: UUID,
    payload: CropListingUpdate,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> CropListingResponse:
    try:
        return await service.update_listing(current_user.id, listing_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/me/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_listing(
    listing_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> None:
    try:
        await service.deactivate_listing(current_user.id, listing_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/me/listings/{listing_id}/images", response_model=CropImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_listing_image(
    listing_id: UUID,
    image: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> CropImageResponse:
    try:
        return await service.add_image(current_user.id, listing_id, image)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> DashboardSummaryResponse:
    try:
        return await service.dashboard_summary(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/listings", response_model=list[DashboardListingResponse])
async def dashboard_listings(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> list[DashboardListingResponse]:
    try:
        return await service.dashboard_listings(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/orders", response_model=list[DashboardOrderResponse])
async def dashboard_orders(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> list[DashboardOrderResponse]:
    try:
        return await service.dashboard_orders(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/analytics", response_model=DashboardAnalyticsResponse)
async def dashboard_analytics(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> DashboardAnalyticsResponse:
    try:
        return await service.dashboard_analytics(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/reviews", response_model=DashboardReviewsResponse)
async def dashboard_reviews(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> DashboardReviewsResponse:
    try:
        return await service.dashboard_reviews(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/ai-summary", response_model=DashboardAISummaryResponse)
async def dashboard_ai_summary(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> DashboardAISummaryResponse:
    try:
        return await service.dashboard_ai_summary(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
