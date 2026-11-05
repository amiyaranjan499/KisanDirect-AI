from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

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
from ml.crop_quality.inference import CropQualityInference

router = APIRouter(prefix="/ai/quality", tags=["ai-quality"])

_quality_inference: CropQualityInference | None = None


def get_quality_inference() -> CropQualityInference:
    global _quality_inference
    if _quality_inference is None:
        _quality_inference = CropQualityInference()
    return _quality_inference


def get_quality_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> QualityService:
    return QualityService(QualityRepository(session), Path(__file__).resolve().parents[2] / "storage")


def get_image_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> FarmerService:
    return FarmerService(FarmerRepository(session), Path(__file__).resolve().parents[2] / "storage" / "uploads")


async def require_farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.post("/analyze", response_model=QualityPredictionResponse, status_code=status.HTTP_200_OK)
async def analyze_crop_quality(
    image: Annotated[UploadFile, File()],
    crop_name: str | None = None,
    _farmer: Annotated[User, Depends(require_farmer)] = None,
    inference: Annotated[CropQualityInference, Depends(get_quality_inference)] = None,
) -> QualityPredictionResponse:
    """Analyze crop quality directly from an uploaded image in-memory without creating a database listing."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Only image files are accepted.")

    content = await image.read()
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="Uploaded image file is empty.")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Image file exceeds maximum 15MB limit.")

    effective_crop = crop_name or "vegetable"
    result = inference.predict(content, crop_name=effective_crop)
    return QualityPredictionResponse(
        id=uuid4(),
        listing_id=None,
        image_id=None,
        quality_label=result.quality_label,
        confidence=result.confidence,
        model_name=result.model_name,
        model_version=result.model_version,
        prediction_status=result.prediction_status,
        result_metadata=result.metadata,
        created_at=datetime.now(timezone.utc),
    )


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
