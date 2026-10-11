from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError

from backend.app.core.config import Settings, get_settings
from backend.app.core.security import create_access_token
from backend.app.dependencies import get_auth_service, get_current_user
from backend.app.repositories.user_repository import DatabaseNotConfiguredError
from backend.app.schemas.auth import (
    LoginRequest,
    RegistrationRequest,
    TokenResponse,
    UserResponse,
)
from backend.app.services.auth_service import AuthenticationService

router = APIRouter(prefix="/auth", tags=["authentication"])


def _enforce_auth_rate_limit(request: Request, endpoint: str) -> None:
    client_ip = request.client.host if request.client is not None else "unknown"
    retry_after = request.app.state.auth_rate_limiter.check(endpoint, client_ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    payload: RegistrationRequest,
    auth_service: Annotated[AuthenticationService, Depends(get_auth_service)],
) -> UserResponse:
    _enforce_auth_rate_limit(request, "register")
    try:
        user = await auth_service.register(
            payload.email, payload.password, payload.role, payload.display_name
        )
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/LoginRequest"},
                },
                "application/x-www-form-urlencoded": {
                    "schema": {
                        "type": "object",
                        "required": ["username", "password"],
                        "properties": {
                            "username": {"type": "string", "format": "email"},
                            "password": {"type": "string", "format": "password"},
                            "grant_type": {"type": "string", "default": "password"},
                            "scope": {"type": "string", "default": ""},
                            "client_id": {"type": "string"},
                            "client_secret": {"type": "string", "format": "password"},
                        },
                    }
                },
            },
        }
    },
)
async def login(
    request: Request,
    auth_service: Annotated[AuthenticationService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type == "application/json":
        try:
            payload = LoginRequest.model_validate(await request.json())
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="Invalid JSON login payload") from exc
    elif content_type == "application/x-www-form-urlencoded":
        form = await request.form()
        try:
            payload = LoginRequest(
                email=form.get("username"),
                password=form.get("password"),
            )
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="Invalid OAuth2 login form") from exc
    else:
        raise HTTPException(
            status_code=415,
            detail="Login requires application/json or application/x-www-form-urlencoded",
        )

    _enforce_auth_rate_limit(request, "login")
    try:
        user = await auth_service.authenticate(payload.email, payload.password)
    except DatabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role, settings),
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
