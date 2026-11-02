from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User
from backend.app.repositories.hub_operations_repository import HubOperationsRepository
from backend.app.repositories.rider_repository import RiderRepository
from backend.app.schemas.hub_operations import (
    FarmerHubOptionResponse,
    HubOperationsOverviewResponse,
    HubShipmentResponse,
    HubStaffHubResponse,
    StockDeliveryCreate,
    StockDeliveryReceiveRequest,
    StockDeliveryResponse,
)
from backend.app.services.hub_operations_service import HubOperationsService
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)
from backend.app.services.rider_service import RiderService
from backend.app.core.config import get_settings

router = APIRouter(prefix="/hub-operations", tags=["hub-operations"])


def get_hub_operations_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> HubOperationsService:
    lifecycle = OrderLifecycleService(session)
    rider_dispatch = RiderService(
        session,
        RiderRepository(session),
        lifecycle,
        get_settings(),
    )
    lifecycle.shipment_ready_hook = rider_dispatch.dispatch_ready_shipment
    return HubOperationsService(
        session,
        HubOperationsRepository(session),
        lifecycle,
    )


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, LifecycleNotFound):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, LifecyclePermissionError):
        return HTTPException(status_code=403, detail=str(error))
    if isinstance(error, LifecycleConflict):
        return HTTPException(status_code=409, detail=str(error))
    raise error


@router.get("/farmer/hubs", response_model=list[FarmerHubOptionResponse])
async def farmer_hubs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> list[FarmerHubOptionResponse]:
    try:
        return await service.farmer_hubs(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.get("/farmer/stock-deliveries", response_model=list[StockDeliveryResponse])
async def farmer_stock_deliveries(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> list[StockDeliveryResponse]:
    try:
        return await service.farmer_stock_deliveries(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.post(
    "/farmer/stock-deliveries",
    response_model=StockDeliveryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_stock_delivery(
    payload: StockDeliveryCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> StockDeliveryResponse:
    try:
        return await service.submit_stock_delivery(_actor(current_user), payload)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.get("/hub-staff/hubs", response_model=list[HubStaffHubResponse])
async def staff_hubs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> list[HubStaffHubResponse]:
    try:
        return await service.staff_hubs(_actor(current_user))
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.get(
    "/hub-staff/hubs/{hub_id}/overview",
    response_model=HubOperationsOverviewResponse,
)
async def hub_overview(
    hub_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> HubOperationsOverviewResponse:
    try:
        return await service.overview(_actor(current_user), hub_id)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.post(
    "/hub-staff/hubs/{hub_id}/stock-deliveries/{delivery_id}/receive",
    response_model=StockDeliveryResponse,
)
async def receive_stock_delivery(
    hub_id: UUID,
    delivery_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
    payload: StockDeliveryReceiveRequest | None = None,
) -> StockDeliveryResponse:
    try:
        return await service.receive_stock_delivery(
            _actor(current_user),
            hub_id,
            delivery_id,
            received_quantity=payload.received_quantity if payload else None,
        )
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.post(
    "/hub-staff/hubs/{hub_id}/orders/{order_id}/start-packing",
    response_model=HubShipmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_packing(
    hub_id: UUID,
    order_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> HubShipmentResponse:
    try:
        return await service.start_packing(_actor(current_user), hub_id, order_id)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


@router.post(
    "/hub-staff/hubs/{hub_id}/shipments/{shipment_id}/ready",
    response_model=HubShipmentResponse,
)
async def mark_shipment_ready(
    hub_id: UUID,
    shipment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HubOperationsService, Depends(get_hub_operations_service)],
) -> HubShipmentResponse:
    try:
        return await service.mark_ready(_actor(current_user), hub_id, shipment_id)
    except (LifecycleNotFound, LifecyclePermissionError, LifecycleConflict) as exc:
        raise _http_error(exc) from exc


def _actor(user: User):
    return LifecycleActor(user.id, user.role)
