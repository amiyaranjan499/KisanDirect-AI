from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from backend.app.models.user import UserRole

RegistrationRole = Literal[UserRole.FARMER, UserRole.CONSUMER, UserRole.RIDER]


class RegistrationRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: RegistrationRole = UserRole.CONSUMER
    display_name: str | None = Field(default=None, min_length=2, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    subject: str
    role: UserRole


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: UserRole
    is_active: bool
