from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.services.order_lifecycle_service import LifecycleConflict
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
    FarmerFacilityCreate,
    FarmerFacilityResponse,
    FarmerFacilityUpdate,
    FarmerProfileResponse,
    FarmerProfileUpdate,
    FarmerStaffCreate,
    FarmerStaffResponse,
    FarmerOrderAssignStaffRequest,
    FarmerOrderPreparePersonallyRequest,
    FarmerOrderDeliverRequest,
    FarmerWalletResponse,
    FarmerWalletWithdrawalRequest,
    FarmerWithdrawalResponse,
)
from backend.app.services.farmer_service import FarmerService

router = APIRouter(prefix="/farmers", tags=["farmers"])


def get_farmer_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> FarmerService:
    return FarmerService(FarmerRepository(session), Path(__file__).resolve().parents[2] / "storage" / "uploads", settings=settings)


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


@router.post("/me/profile-image", status_code=status.HTTP_200_OK)
async def upload_profile_image(
    image: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> dict[str, str]:
    try:
        path = await service.upload_profile_image(current_user.id, image)
        return {"profile_image": path}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/me/cover-image", status_code=status.HTTP_200_OK)
async def upload_cover_image(
    image: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> dict[str, str]:
    try:
        path = await service.upload_cover_image(current_user.id, image)
        return {"cover_image": path}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/me/listings", response_model=list[CropListingResponse])
async def list_my_listings(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> list[CropListingResponse]:
    return await service.list_listings(current_user.id)


@router.get("/me/listings/{listing_id}", response_model=CropListingResponse)
async def get_my_listing(
    listing_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> CropListingResponse:
    try:
        return await service.get_listing(current_user.id, listing_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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


@router.get("/reverse-geocode")
async def reverse_geocode(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    """Resolve coordinates into area, city, state, and postal pincode."""
    import json
    import urllib.request

    # 1. Primary: BigDataCloud reverse geocode client API
    try:
        url = f"https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={latitude}&longitude={longitude}&localityLanguage=en"
        req = urllib.request.Request(url, headers={"User-Agent": "KisanDirect-AI/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            postcode = (data.get("postcode") or "").strip()
            city = data.get("city") or data.get("locality") or ""
            state = data.get("principalSubdivision") or ""
            locality = data.get("locality") or ""
            if postcode:
                return {
                    "latitude": latitude,
                    "longitude": longitude,
                    "pincode": postcode,
                    "locality": locality,
                    "city": city,
                    "state": state,
                    "formatted": f"{locality}, {city}, {state} - {postcode}".strip(", - "),
                }
    except Exception:
        pass

    # 2. Fallback: OpenStreetMap Nominatim
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={latitude}&lon={longitude}"
        req = urllib.request.Request(url, headers={"User-Agent": "KisanDirect-AI/1.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            addr = data.get("address", {})
            postcode = (addr.get("postcode") or "").strip()
            locality = addr.get("suburb") or addr.get("village") or addr.get("neighbourhood") or ""
            city = addr.get("city") or addr.get("county") or addr.get("state_district") or ""
            state = addr.get("state") or ""
            return {
                "latitude": latitude,
                "longitude": longitude,
                "pincode": postcode,
                "locality": locality,
                "city": city,
                "state": state,
                "formatted": f"{locality}, {city}, {state} - {postcode}".strip(", - "),
            }
    except Exception:
        pass

    return {
        "latitude": latitude,
        "longitude": longitude,
        "pincode": "",
        "locality": "",
        "city": "",
        "state": "",
        "formatted": f"{latitude}, {longitude}",
    }


@router.get("/me/facilities", response_model=list[FarmerFacilityResponse])
async def list_facilities(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> list[FarmerFacilityResponse]:
    try:
        return await service.list_facilities(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/me/facilities",
    response_model=FarmerFacilityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_facility(
    payload: FarmerFacilityCreate,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerFacilityResponse:
    try:
        return await service.create_facility(current_user.id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/me/facilities/{facility_id}", response_model=FarmerFacilityResponse)
async def update_facility(
    facility_id: UUID,
    payload: FarmerFacilityUpdate,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerFacilityResponse:
    try:
        return await service.update_facility(current_user.id, facility_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/me/staff", response_model=list[FarmerStaffResponse])
async def list_staff(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
    facility_id: UUID | None = Query(default=None),
) -> list[FarmerStaffResponse]:
    try:
        return await service.list_staff(current_user.id, facility_id=facility_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/me/facilities/{facility_id}/staff",
    response_model=FarmerStaffResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_facility_staff(
    facility_id: UUID,
    payload: FarmerStaffCreate,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerStaffResponse:
    try:
        return await service.create_staff(current_user.id, facility_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete(
    "/me/facilities/{facility_id}/staff/{staff_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_facility_staff(
    facility_id: UUID,
    staff_user_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> None:
    try:
        await service.remove_staff(current_user.id, facility_id, staff_user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/me/orders/{order_id}/assign-staff",
    response_model=DashboardOrderResponse,
)
async def assign_staff_order(
    order_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
    payload: FarmerOrderAssignStaffRequest | None = None,
) -> DashboardOrderResponse:
    try:
        return await service.assign_staff_order(
            current_user.id,
            order_id,
            payload.facility_id if payload else None,
            staff_user_id=payload.staff_user_id if payload else None,
            notes=payload.notes if payload else None,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/me/orders/{order_id}/send-to-hub",
    response_model=DashboardOrderResponse,
)
async def send_to_hub_order(
    order_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> DashboardOrderResponse:
    try:
        return await service.send_order_to_hub(current_user.id, order_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/me/orders/{order_id}/prepare-personally",
    response_model=DashboardOrderResponse,
)
async def prepare_personally_order(
    order_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
    payload: FarmerOrderPreparePersonallyRequest | None = None,
) -> DashboardOrderResponse:
    try:
        return await service.prepare_personally_order(
            current_user.id,
            order_id,
            notes=payload.notes if payload else None,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/me/orders/{order_id}/ready-for-pickup",
    response_model=DashboardOrderResponse,
)
async def ready_for_pickup_order(
    order_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> DashboardOrderResponse:
    try:
        return await service.ready_for_pickup_order(
            current_user.id,
            order_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/me/orders/{order_id}/deliver",
    response_model=DashboardOrderResponse,
)
async def deliver_farmer_order(
    order_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
    payload: FarmerOrderDeliverRequest | None = None,
) -> DashboardOrderResponse:
    try:
        return await service.deliver_order(
            current_user.id,
            order_id,
            otp=payload.otp if payload else None,
            notes=payload.notes if payload else None,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete(
    "/me/orders/{order_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_farmer_order_history(
    order_id: UUID,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> dict[str, str]:
    try:
        await service.hide_order_from_history(current_user.id, order_id)
        return {"status": "success", "message": "Order removed from history"}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/wallet",
    response_model=FarmerWalletResponse,
)
@router.get(
    "/me/wallet",
    response_model=FarmerWalletResponse,
)
async def get_farmer_wallet(
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerWalletResponse:
    try:
        return await service.get_wallet(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/wallet/withdraw",
    response_model=FarmerWithdrawalResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/me/wallet/withdraw",
    response_model=FarmerWithdrawalResponse,
    status_code=status.HTTP_201_CREATED,
)
async def withdraw_farmer_funds(
    payload: FarmerWalletWithdrawalRequest,
    current_user: Annotated[User, Depends(get_authenticated_farmer)],
    service: Annotated[FarmerService, Depends(get_farmer_service)],
) -> FarmerWithdrawalResponse:
    try:
        return await service.request_withdrawal(current_user.id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


