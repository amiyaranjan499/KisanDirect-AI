from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.core.security import decode_access_token
from backend.app.database.session import get_db_session
from backend.app.models.user import UserRole
from backend.app.repositories.sqlalchemy_user_repository import SqlAlchemyUserRepository
from backend.app.repositories.user_repository import DatabaseNotConfiguredError, UserRepository
from backend.app.services.auth_service import AuthenticationService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_user_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserRepository:
    return SqlAlchemyUserRepository(session)


def get_auth_service(
    repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> AuthenticationService:
    return AuthenticationService(repository)


async def get_current_token_data(
    token: Annotated[str, Depends(oauth2_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        return decode_access_token(token, settings)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    token_data=Depends(get_current_token_data),
    auth_service: AuthenticationService = Depends(get_auth_service),
):
    try:
        return await auth_service.get_user(UUID(token_data.subject))
    except (DatabaseNotConfiguredError, ValueError) as exc:
        if isinstance(exc, DatabaseNotConfiguredError):
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def require_roles(*roles: UserRole) -> Callable:
    async def role_dependency(token_data=Depends(get_current_token_data)):
        if token_data.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return token_data

    return role_dependency
