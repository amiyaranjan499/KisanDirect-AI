from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.core.config import get_settings
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.models import NotificationType
from backend.app.schemas.notifications import NotificationCreate, NotificationPage, NotificationResponse
from backend.app.services.notifications_service import NotificationsService

router = APIRouter(tags=["notifications"])


def get_notifications_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> NotificationsService:
    return NotificationsService(NotificationRepository(session))


async def require_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role not in {UserRole.CONSUMER, UserRole.FARMER, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Notification access is restricted")
    return current_user


@router.get("/notifications", response_model=NotificationPage)
async def list_notifications(
    current_user: Annotated[User, Depends(require_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
) -> NotificationPage:
    result = await service.list_for_user(current_user.id, unread_only=unread_only, page=page, page_size=page_size)
    return NotificationPage(**result)


@router.get("/notifications/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: UUID,
    current_user: Annotated[User, Depends(require_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
) -> NotificationResponse:
    try:
        notification = await service.get(current_user.id, notification_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return NotificationResponse.model_validate(notification)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    current_user: Annotated[User, Depends(require_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
) -> NotificationResponse:
    try:
        notification = await service.mark_read(current_user.id, notification_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return NotificationResponse.model_validate(notification)


@router.post("/notifications/read-all", response_model=dict[str, int], status_code=status.HTTP_200_OK)
async def mark_all_notifications_read(
    current_user: Annotated[User, Depends(require_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
) -> dict[str, int]:
    return await service.mark_all_read(current_user.id)


@router.post("/notifications/test-create", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def test_create_notification(
    payload: NotificationCreate,
    current_user: Annotated[User, Depends(require_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
) -> NotificationResponse:
    if get_settings().app_env.lower() != "development":
        raise HTTPException(status_code=404, detail="Test endpoint is disabled")
    target_user_id = payload.user_id or current_user.id
    if current_user.id != target_user_id:
        raise HTTPException(status_code=403, detail="Users can only create notifications for themselves in tests")
    notification = await service.create(
        user_id=target_user_id,
        notification_type=NotificationType(payload.notification_type),
        title=payload.title,
        message=payload.message,
        related_entity_type=payload.related_entity_type,
        related_entity_id=payload.related_entity_id,
    )
    return NotificationResponse.model_validate(notification)
