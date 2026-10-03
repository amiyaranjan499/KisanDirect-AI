from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.admin_repository import AdminRepository
from backend.app.schemas.admin import (
    AdminAnalyticsResponse,
    AdminCategoryResponse,
    AdminConsumerResponse,
    AdminDashboardSummaryResponse,
    AdminFarmerResponse,
    AdminListingResponse,
    AdminNotificationResponse,
    AdminOrderResponse,
    AdminPaymentResponse,
    AdminReviewResponse,
    AdminUserStatusResponse,
    AdminUserStatusUpdate,
)
from backend.app.services.admin_service import AdminService

router = APIRouter(prefix="/admins", tags=["admin"])


def get_admin_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminService:
    return AdminService(AdminRepository(session))


async def get_authenticated_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role is not UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


@router.get("/analytics", response_model=AdminAnalyticsResponse)
async def analytics(
    range: Annotated[str | None, Query(alias="range")] = "30d",
    current_user: Annotated[User, Depends(get_authenticated_admin)] = None,
    service: Annotated[AdminService, Depends(get_admin_service)] = None,
) -> AdminAnalyticsResponse:
    try:
        return await service.analytics(range or "30d")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/dashboard/summary", response_model=AdminDashboardSummaryResponse)
async def dashboard_summary(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminDashboardSummaryResponse:
    return await service.dashboard_summary()


@router.get("/farmers", response_model=list[AdminFarmerResponse])
async def list_farmers(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminFarmerResponse]:
    return await service.list_farmers()


@router.get("/consumers", response_model=list[AdminConsumerResponse])
async def list_consumers(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminConsumerResponse]:
    return await service.list_consumers()


@router.get("/listings", response_model=list[AdminListingResponse])
async def list_listings(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminListingResponse]:
    return await service.list_listings()


@router.get("/orders", response_model=list[AdminOrderResponse])
async def list_orders(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminOrderResponse]:
    return await service.list_orders()


@router.get("/payments", response_model=list[AdminPaymentResponse])
async def list_payments(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminPaymentResponse]:
    return await service.list_payments()


@router.get("/reviews", response_model=list[AdminReviewResponse])
async def list_reviews(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminReviewResponse]:
    return await service.list_reviews()


@router.get("/notifications", response_model=list[AdminNotificationResponse])
async def list_notifications(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminNotificationResponse]:
    return await service.list_notifications()


@router.get("/categories", response_model=list[AdminCategoryResponse])
async def list_categories(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminCategoryResponse]:
    return await service.list_categories()


@router.patch("/users/{user_id}/status", response_model=AdminUserStatusResponse)
async def update_user_status(
    user_id: UUID,
    payload: AdminUserStatusUpdate,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminUserStatusResponse:
    try:
        return await service.update_user_status(user_id, payload.is_active)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
