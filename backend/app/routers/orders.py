from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import get_settings
from backend.app.database.session import get_db_session
from backend.app.dependencies import get_current_user
from backend.app.models import User, UserRole
from backend.app.repositories.consumer_repository import ConsumerRepository
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.repositories.orders_repository import OrdersRepository
from backend.app.schemas.orders import (
    CartItemCreate,
    CartItemUpdate,
    CartResponse,
    OrderPage,
    OrderResponse,
    OrderStatusUpdate,
)
from backend.app.schemas.payments import PaymentResponse, TestPaymentRequest
from backend.app.services.notifications_service import NotificationsService
from backend.app.services.orders_service import OrdersService

router = APIRouter(tags=["cart-orders"])


def get_orders_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> OrdersService:
    return OrdersService(
        OrdersRepository(session),
        ConsumerRepository(session),
        NotificationsService(NotificationRepository(session)),
    )


async def require_consumer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.CONSUMER:
        raise HTTPException(status_code=403, detail="Consumer role required")
    return current_user


async def require_farmer(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role is not UserRole.FARMER:
        raise HTTPException(status_code=403, detail="Farmer role required")
    return current_user


@router.get("/cart", response_model=CartResponse)
async def get_cart(current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> CartResponse:
    try:
        return await service.get_cart(current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/cart/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
async def add_cart_item(payload: CartItemCreate, current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> CartResponse:
    try:
        return await service.add_item(current_user.id, payload.listing_id, payload.quantity)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/cart/items/{item_id}", response_model=CartResponse)
async def update_cart_item(item_id: UUID, payload: CartItemUpdate, current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> CartResponse:
    try:
        return await service.update_item(current_user.id, item_id, payload.quantity)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/cart/items/{item_id}", response_model=CartResponse)
async def remove_cart_item(item_id: UUID, current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> CartResponse:
    try:
        return await service.remove_item(current_user.id, item_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/cart", response_model=CartResponse)
async def clear_cart(current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> CartResponse:
    return await service.clear_cart(current_user.id)


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> OrderResponse:
    try:
        return await service.checkout(current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/orders", response_model=OrderPage)
async def consumer_orders(current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)], page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=50)) -> OrderPage:
    return await service.consumer_orders(current_user.id, page, page_size)


@router.get("/farmer/orders", response_model=OrderPage)
async def farmer_orders(current_user: Annotated[User, Depends(require_farmer)], service: Annotated[OrdersService, Depends(get_orders_service)], page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=50)) -> OrderPage:
    return await service.farmer_orders(current_user.id, page, page_size)


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def order_detail(order_id: UUID, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> OrderResponse:
    if current_user.role not in {UserRole.CONSUMER, UserRole.FARMER}:
        raise HTTPException(status_code=403, detail="Order access is restricted")
    try:
        return await service.order_detail(current_user.id, current_user.role, order_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(order_id: UUID, payload: OrderStatusUpdate, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> OrderResponse:
    try:
        return await service.update_status(current_user.id, current_user.role, order_id, payload.status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (PermissionError, ValueError) as exc:
        raise HTTPException(status_code=403 if isinstance(exc, PermissionError) else 422, detail=str(exc)) from exc


@router.post("/payments/test/{order_id}", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def initiate_test_payment(order_id: UUID, payload: TestPaymentRequest, current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> PaymentResponse:
    if not get_settings().enable_sandbox_payments:
        raise HTTPException(status_code=404, detail="Test endpoint is disabled")
    try:
        return await service.initiate_test_payment(current_user.id, order_id, payload.outcome)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/payments/test/{payment_id}", response_model=PaymentResponse)
async def get_test_payment(payment_id: UUID, current_user: Annotated[User, Depends(require_consumer)], service: Annotated[OrdersService, Depends(get_orders_service)]) -> PaymentResponse:
    if not get_settings().enable_sandbox_payments:
        raise HTTPException(status_code=404, detail="Test endpoint is disabled")
    try:
        return await service.get_test_payment(current_user.id, payment_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
