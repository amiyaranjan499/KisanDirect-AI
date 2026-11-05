from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.price_repository import PriceRepository
from backend.app.schemas.price import (
    PriceEstimateRequest,
    PriceEstimateResponse,
    PricePredictionQuery,
    PricePredictionResponse,
)
from backend.app.services.price_service import PriceService

router = APIRouter(prefix="/ai/price", tags=["ai-price"])


def get_price_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> PriceService:
    return PriceService(PriceRepository(session))


async def require_farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.post("/predict", response_model=PricePredictionResponse, status_code=status.HTTP_201_CREATED)
async def predict_price(
    listing_id: UUID,
    query: PricePredictionQuery,
    current_user: Annotated[User, Depends(require_farmer)],
    service: Annotated[PriceService, Depends(get_price_service)],
) -> PricePredictionResponse:
    try:
        return await service.predict(current_user.id, listing_id, query)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/estimate", response_model=PriceEstimateResponse, status_code=status.HTTP_200_OK)
async def estimate_price(
    request: PriceEstimateRequest,
    _current_user: Annotated[User, Depends(require_farmer)],
    service: Annotated[PriceService, Depends(get_price_service)],
) -> PriceEstimateResponse:
    return service.estimate(request)


@router.get("/{prediction_id}", response_model=PricePredictionResponse)
async def get_price_prediction(
    prediction_id: UUID,
    current_user: Annotated[User, Depends(require_farmer)],
    service: Annotated[PriceService, Depends(get_price_service)],
) -> PricePredictionResponse:
    try:
        return await service.get_prediction(current_user.id, prediction_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
