from typing import Protocol
from uuid import UUID

from backend.app.models.user import User, UserRole


class UserRepositoryType(Protocol):
    async def get_by_id(self, user_id: UUID) -> User | None:
        ...

    async def get_by_email(self, email: str) -> User | None:
        ...

    async def create(self, email: str, hashed_password: str, role: UserRole) -> User:
        ...
