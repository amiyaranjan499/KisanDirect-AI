from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.fulfillment_repository import FulfillmentRepository
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.schemas.fulfillment import FulfillmentCreate, FulfillmentResponse, FulfillmentStatusUpdate
from backend.app.services.fulfillment_service import FulfillmentService
from backend.app.services.notifications_service import NotificationsService

router = APIRouter(prefix="/orders", tags=["delivery-pickup"])


def get_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> FulfillmentService:
    return FulfillmentService(
        FulfillmentRepository(session),
        ConsumerRepository(session),
        NotificationsService(NotificationRepository(session)),
    )


async def consumer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.CONSUMER:
        raise HTTPException(status_code=403, detail="Consumer role required")
    return current_user


async def farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.post("/{order_id}/fulfillment", response_model=FulfillmentResponse, status_code=201)
async def create_fulfillment(order_id: UUID, payload: FulfillmentCreate, current_user: Annotated[User, Depends(consumer)], service: Annotated[FulfillmentService, Depends(get_service)]) -> FulfillmentResponse:
    try:
        return await service.create(current_user.id, order_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{order_id}/fulfillment", response_model=FulfillmentResponse)
async def get_fulfillment(order_id: UUID, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[FulfillmentService, Depends(get_service)]) -> FulfillmentResponse:
    if current_user.role not in {UserRole.CONSUMER, UserRole.FARMER}:
        raise HTTPException(status_code=403, detail="Fulfillment access is restricted")
    try:
        return await service.get(current_user.id, current_user.role, order_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{order_id}/fulfillment/status", response_model=FulfillmentResponse)
async def update_fulfillment_status(order_id: UUID, payload: FulfillmentStatusUpdate, current_user: Annotated[User, Depends(farmer)], service: Annotated[FulfillmentService, Depends(get_service)]) -> FulfillmentResponse:
    try:
        return await service.update_status(current_user.id, payload, order_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
