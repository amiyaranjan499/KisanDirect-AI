from datetime import datetime, timezone
from math import ceil
from uuid import UUID

from backend.app.models import Notification, NotificationType
from backend.app.repositories.notifications_repository import NotificationRepository


class NotificationsService:
    def __init__(self, repository: NotificationRepository) -> None:
        self.repository = repository

    async def list_for_user(self, user_id: UUID, *, unread_only: bool = False, page: int = 1, page_size: int = 20) -> dict[str, object]:
        notifications, total = await self.repository.list_for_user(user_id, unread_only=unread_only, page=page, page_size=page_size)
        return {
            "items": [self._response(item) for item in notifications],
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": ceil(total / page_size) if total else 0,
        }

    async def get(self, user_id: UUID, notification_id: UUID) -> Notification:
        notification = await self.repository.get_for_user(user_id, notification_id)
        if notification is None:
            raise LookupError("Notification not found")
        return notification

    async def mark_read(self, user_id: UUID, notification_id: UUID) -> Notification:
        notification = await self.repository.get_for_user(user_id, notification_id)
        if notification is None:
            raise LookupError("Notification not found")
        if notification.is_read:
            raise ValueError("Notification is already read")
        notification.read_at = datetime.now(timezone.utc)
        return await self.repository.mark_read(notification)

    async def mark_all_read(self, user_id: UUID) -> dict[str, int]:
        marked = await self.repository.mark_all_read(user_id)
        return {"marked": marked}

    async def create(
        self,
        *,
        user_id: UUID,
        notification_type: NotificationType,
        title: str,
        message: str,
        related_entity_type: str | None = None,
        related_entity_id: UUID | None = None,
        deduplicate: bool = True,
    ) -> Notification:
        if deduplicate:
            existing = await self.repository.find_recent_duplicate(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
            )
            if existing is not None:
                return existing

        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            is_read=False,
            read_at=None,
        )
        return await self.repository.create(notification)

    @staticmethod
    def _response(notification: Notification) -> dict[str, object]:
        return {
            "id": notification.id,
            "user_id": notification.user_id,
            "notification_type": notification.notification_type.value,
            "title": notification.title,
            "message": notification.message,
            "related_entity_type": notification.related_entity_type,
            "related_entity_id": notification.related_entity_id,
            "is_read": notification.is_read,
            "read_at": notification.read_at,
            "created_at": notification.created_at,
            "updated_at": notification.updated_at,
        }
