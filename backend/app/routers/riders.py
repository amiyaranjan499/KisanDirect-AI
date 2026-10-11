from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import get_settings
from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import ShipmentStatus, User, UserRole
from backend.app.repositories.rider_repository import RiderRepository
from backend.app.schemas.rider import (
    RiderAvailabilityUpdate,
    RiderHistoryResponse,
    RiderLocationCreate,
    RiderLocationResponse,
    RiderOfferActionResponse,
    RiderOfferResponse,
    RiderOtpVerificationRequest,
    RiderSelfResponse,
    RiderShipmentResponse,
    RiderShipmentStatusUpdate,
)
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)
from backend.app.services.rider_service import RiderService

router = APIRouter(prefix="/rider", tags=["rider-operations"])


def get_rider_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RiderService:
    lifecycle = OrderLifecycleService(session)
    return RiderService(
        session,
        RiderRepository(session),
        lifecycle,
        get_settings(),
    )


async def rider_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role is not UserRole.RIDER:
        raise HTTPException(status_code=403, detail="Rider role required")
    return current_user


def _actor(user: User):
    return LifecycleActor(user.id, user.role)


def _raise_http_error(error: Exception) -> None:
    if isinstance(error, LifecycleNotFound):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, LifecyclePermissionError):
        raise HTTPException(status_code=403, detail=str(error)) from error
    if isinstance(error, LifecycleConflict):
        raise HTTPException(status_code=409, detail=str(error)) from error
    raise error


@router.get("/me", response_model=RiderSelfResponse)
async def rider_status(
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderSelfResponse:
    try:
        return await service.self_status(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.patch("/availability", response_model=RiderSelfResponse)
async def update_availability(
    payload: RiderAvailabilityUpdate,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderSelfResponse:
    try:
        return await service.set_availability(_actor(current_user), online=payload.online)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post("/location", response_model=RiderLocationResponse)
async def update_location(
    payload: RiderLocationCreate,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderLocationResponse:
    try:
        await service.post_location(
            _actor(current_user),
            latitude=payload.latitude,
            longitude=payload.longitude,
            accuracy=payload.accuracy,
        )
        return RiderLocationResponse(stored=True)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post("/offers/poll", response_model=list[RiderOfferResponse])
async def poll_offers(
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> list[RiderOfferResponse]:
    try:
        return await service.poll_offers(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post("/offers/{offer_id}/accept", response_model=RiderShipmentResponse)
async def accept_offer(
    offer_id: UUID,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderShipmentResponse:
    try:
        return await service.accept_offer(_actor(current_user), offer_id)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post("/offers/{offer_id}/decline", response_model=RiderOfferActionResponse)
async def decline_offer(
    offer_id: UUID,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderOfferActionResponse:
    try:
        response_status = await service.decline_offer(_actor(current_user), offer_id)
        return RiderOfferActionResponse(status=response_status)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.get("/shipments/active", response_model=RiderShipmentResponse | None)
async def active_shipment(
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderShipmentResponse | None:
    try:
        return await service.active_shipment(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post(
    "/shipments/{shipment_id}/status",
    response_model=RiderShipmentResponse,
)
async def update_shipment_status(
    shipment_id: UUID,
    payload: RiderShipmentStatusUpdate,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderShipmentResponse:
    try:
        return await service.update_shipment_status(
            _actor(current_user),
            shipment_id,
            ShipmentStatus(payload.status),
        )
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post(
    "/shipments/{shipment_id}/cod-cash-collected",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def record_cod_cash_collected(
    shipment_id: UUID,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> None:
    try:
        await service.record_cod_cash_collected(_actor(current_user), shipment_id)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)


@router.post(
    "/shipments/{shipment_id}/otp-verification",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
async def verify_delivery_otp_phase6_stub(
    shipment_id: UUID,
    payload: RiderOtpVerificationRequest,
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> None:
    try:
        await service.verify_otp_phase6_stub(
            _actor(current_user), shipment_id, payload.code
        )
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="OTP verification is not available until Phase 6",
    )


@router.get("/history", response_model=RiderHistoryResponse)
async def rider_history(
    current_user: Annotated[User, Depends(rider_user)],
    service: Annotated[RiderService, Depends(get_rider_service)],
) -> RiderHistoryResponse:
    try:
        return await service.history(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        _raise_http_error(exc)
