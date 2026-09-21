from uuid import UUID

from backend.app.app_types import UserRepositoryType
from backend.app.core.security import hash_password, verify_password
from backend.app.models.user import User, UserRole


class AuthenticationService:
    def __init__(self, user_repository: UserRepositoryType) -> None:
        self.user_repository = user_repository

    async def register(self, email: str, password: str, role: UserRole) -> User:
        existing_user = await self.user_repository.get_by_email(email)
        if existing_user is not None:
            raise ValueError("An account with this email already exists")
        return await self.user_repository.create(email, hash_password(password), role)

    async def authenticate(self, email: str, password: str) -> User:
        user = await self.user_repository.get_by_email(email)
        if user is None or not verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password")
        if not user.is_active:
            raise ValueError("User account is inactive")
        return user

    async def get_user(self, user_id: UUID) -> User:
        user = await self.user_repository.get_by_id(user_id)
        if user is None or not user.is_active:
            raise ValueError("User account was not found or is inactive")
        return user
