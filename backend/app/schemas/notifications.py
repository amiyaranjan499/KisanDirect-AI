from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationCreate(BaseModel):
    user_id: UUID | None = None
    notification_type: str = Field(pattern="^(SYSTEM|ORDER|LISTING|PAYMENT|DELIVERY|REVIEW|AI)$")
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1)
    related_entity_type: str | None = Field(default=None, max_length=80)
    related_entity_id: UUID | None = None


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    notification_type: str
    title: str
    message: str
    related_entity_type: str | None
    related_entity_id: UUID | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationResponse]
    page: int
    page_size: int
    total: int
    pages: int
