from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.repositories.orders_repository import OrdersRepository
from backend.app.schemas.consumer import (
    ConsumerDashboardCartSummaryResponse,
    ConsumerDashboardOrderResponse,
    ConsumerDashboardPurchaseHistoryResponse,
    ConsumerDashboardReviewResponse,
    ConsumerDashboardSummaryResponse,
    ConsumerProfileResponse,
    ConsumerProfileUpdate,
)
from backend.app.services.consumer_service import ConsumerService
from backend.app.services.notifications_service import NotificationsService

router = APIRouter(prefix="/consumers", tags=["consumers"])


def get_consumer_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ConsumerService:
    return ConsumerService(
        ConsumerRepository(session),
        OrdersRepository(session),
        NotificationsService(NotificationRepository(session)),
    )


async def get_authenticated_consumer(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role is not UserRole.CONSUMER:
        raise HTTPException(status_code=403, detail="Consumer role required")
    return current_user


@router.get("/me", response_model=ConsumerProfileResponse)
async def get_profile(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> ConsumerProfileResponse:
    try:
        return await service.get_profile(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/summary", response_model=ConsumerDashboardSummaryResponse)
async def dashboard_summary(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> ConsumerDashboardSummaryResponse:
    try:
        return await service.dashboard_summary(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/orders", response_model=list[ConsumerDashboardOrderResponse])
async def dashboard_orders(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> list[ConsumerDashboardOrderResponse]:
    try:
        return await service.dashboard_orders(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/purchase-history", response_model=list[ConsumerDashboardPurchaseHistoryResponse])
async def dashboard_purchase_history(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> list[ConsumerDashboardPurchaseHistoryResponse]:
    try:
        return await service.dashboard_purchase_history(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/cart-summary", response_model=ConsumerDashboardCartSummaryResponse)
async def dashboard_cart_summary(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> ConsumerDashboardCartSummaryResponse:
    try:
        return await service.dashboard_cart_summary(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/reviews", response_model=list[ConsumerDashboardReviewResponse])
async def dashboard_reviews(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> list[ConsumerDashboardReviewResponse]:
    try:
        return await service.dashboard_reviews(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard/notifications", response_model=dict[str, int | list])
async def dashboard_notifications(
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> dict[str, int | list]:
    try:
        return await service.dashboard_notifications(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/me", response_model=ConsumerProfileResponse)
async def update_profile(
    payload: ConsumerProfileUpdate,
    current_user: Annotated[User, Depends(get_authenticated_consumer)],
    service: Annotated[ConsumerService, Depends(get_consumer_service)],
) -> ConsumerProfileResponse:
    try:
        return await service.update_profile(current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
