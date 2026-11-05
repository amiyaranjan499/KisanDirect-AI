from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import ShipmentStatus, User, UserRole
from backend.app.repositories.admin_repository import AdminRepository
from backend.app.schemas.admin import (
    AdminAnalyticsResponse,
    AdminCategoryResponse,
    AdminConsumerResponse,
    AdminDashboardSummaryResponse,
    AdminFarmerResponse,
    AdminHubCreate,
    AdminHubResponse,
    AdminHubStaffAssignment,
    AdminHubStaffCreate,
    AdminHubStaffResponse,
    AdminHubUpdate,
    AdminListingResponse,
    AdminNotificationResponse,
    AdminOrderResponse,
    AdminPaymentResponse,
    AdminReviewResponse,
    AdminRiderResponse,
    AdminRiderStatusUpdate,
    AdminShipmentCancel,
    AdminShipmentReassign,
    AdminShipmentResponse,
    AdminUserStatusResponse,
    AdminUserStatusUpdate,
    OtpResetRequest,
)
from backend.app.services.admin_service import AdminService
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)

router = APIRouter(prefix="/admins", tags=["admin"])


def get_admin_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminService:
    return AdminService(AdminRepository(session))


def get_order_lifecycle_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrderLifecycleService:
    return OrderLifecycleService(session)


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
        return await service.update_user_status(
            user_id, payload.is_active, LifecycleActor(current_user.id, current_user.role)
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/riders", response_model=list[AdminRiderResponse])
async def list_admin_riders(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminRiderResponse]:
    return await service.list_riders()


@router.patch("/riders/{rider_id}/approval", response_model=AdminRiderResponse)
async def update_rider_approval(
    rider_id: UUID,
    payload: AdminRiderStatusUpdate,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminRiderResponse:
    try:
        return await service.update_rider_approval(
            rider_id,
            payload.approval_status,
            payload.reason,
            LifecycleActor(current_user.id, current_user.role),
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/hubs", response_model=list[AdminHubResponse])
async def list_admin_hubs(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminHubResponse]:
    return await service.list_hubs()


@router.post("/hubs", response_model=AdminHubResponse, status_code=201)
async def create_admin_hub(
    payload: AdminHubCreate,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminHubResponse:
    try:
        return await service.create_hub(
            payload.model_dump(), LifecycleActor(current_user.id, current_user.role)
        )
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.patch("/hubs/{hub_id}", response_model=AdminHubResponse)
async def update_admin_hub(
    hub_id: UUID,
    payload: AdminHubUpdate,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminHubResponse:
    try:
        return await service.update_hub(
            hub_id,
            payload.model_dump(exclude_unset=True),
            LifecycleActor(current_user.id, current_user.role),
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/hub-staff", response_model=list[AdminHubStaffResponse])
async def list_admin_hub_staff(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminHubStaffResponse]:
    return await service.list_hub_staff()


@router.post("/hub-staff", response_model=AdminHubStaffResponse, status_code=201)
async def create_admin_hub_staff(
    payload: AdminHubStaffCreate,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminHubStaffResponse:
    try:
        return await service.create_hub_staff(
            payload.email,
            payload.initial_password,
            payload.hub_id,
            LifecycleActor(current_user.id, current_user.role),
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/hub-staff/assignments", status_code=204)
async def assign_admin_hub_staff(
    payload: AdminHubStaffAssignment,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> None:
    try:
        await service.assign_hub_staff(
            payload.user_id, payload.hub_id, LifecycleActor(current_user.id, current_user.role)
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.delete("/hub-staff/{user_id}/assignments/{hub_id}", status_code=204)
async def unassign_admin_hub_staff(
    user_id: UUID,
    hub_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> None:
    try:
        await service.unassign_hub_staff(
            user_id, hub_id, LifecycleActor(current_user.id, current_user.role)
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/shipments", response_model=list[AdminShipmentResponse])
async def list_admin_shipments(
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> list[AdminShipmentResponse]:
    return await service.list_shipments()


@router.post("/shipments/{shipment_id}/reassign", response_model=AdminShipmentResponse)
async def reassign_admin_shipment(
    shipment_id: UUID,
    payload: AdminShipmentReassign,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    lifecycle: Annotated[OrderLifecycleService, Depends(get_order_lifecycle_service)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminShipmentResponse:
    try:
        await lifecycle.reassign_shipment(
            shipment_id,
            payload.rider_user_id,
            LifecycleActor(current_user.id, current_user.role),
            reason=payload.reason,
        )
        return next(row for row in await service.list_shipments() if row.id == shipment_id)
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/shipments/{shipment_id}/cancel", response_model=AdminShipmentResponse)
async def cancel_admin_shipment(
    shipment_id: UUID,
    payload: AdminShipmentCancel,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    lifecycle: Annotated[OrderLifecycleService, Depends(get_order_lifecycle_service)],
    service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminShipmentResponse:
    try:
        await lifecycle.transition_shipment(
            shipment_id,
            LifecycleActor(current_user.id, current_user.role),
            ShipmentStatus.CANCELLED,
            reason=payload.reason,
        )
        return next(row for row in await service.list_shipments() if row.id == shipment_id)
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LifecyclePermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/shipments/{shipment_id}/otp-reset", status_code=204)
async def reset_delivery_otp(
    shipment_id: UUID,
    payload: OtpResetRequest,
    current_user: Annotated[User, Depends(get_authenticated_admin)],
    service: Annotated[OrderLifecycleService, Depends(get_order_lifecycle_service)],
) -> None:
    try:
        await service.reset_delivery_otp(
            shipment_id,
            LifecycleActor(current_user.id, current_user.role),
            payload.reason,
        )
    except LifecycleNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (LifecyclePermissionError, ValueError) as exc:
        raise HTTPException(
            status_code=403 if isinstance(exc, LifecyclePermissionError) else 422,
            detail=str(exc),
        ) from exc
