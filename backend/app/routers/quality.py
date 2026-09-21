from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.farmer_repository import FarmerRepository
from backend.app.repositories.quality_repository import QualityRepository
from backend.app.schemas.quality import QualityPredictionResponse
from backend.app.services.farmer_service import FarmerService
from backend.app.services.quality_service import QualityService

router = APIRouter(prefix="/ai/quality", tags=["ai-quality"])


def get_quality_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> QualityService:
    return QualityService(QualityRepository(session), Path(__file__).resolve().parents[2] / "storage")


def get_image_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> FarmerService:
    return FarmerService(FarmerRepository(session), Path(__file__).resolve().parents[2] / "storage" / "uploads")


async def require_farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.post("/predict", response_model=QualityPredictionResponse, status_code=status.HTTP_201_CREATED)
async def predict_quality(
    listing_id: UUID,
    image: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(require_farmer)],
    image_service: Annotated[FarmerService, Depends(get_image_service)],
    quality_service: Annotated[QualityService, Depends(get_quality_service)],
) -> QualityPredictionResponse:
    try:
        stored_image = await image_service.add_image(current_user.id, listing_id, image)
        return await quality_service.predict(current_user.id, stored_image.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{prediction_id}", response_model=QualityPredictionResponse)
async def get_quality_prediction(
    prediction_id: UUID,
    current_user: Annotated[User, Depends(require_farmer)],
    service: Annotated[QualityService, Depends(get_quality_service)],
) -> QualityPredictionResponse:
    try:
        return await service.get_prediction(current_user.id, prediction_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
