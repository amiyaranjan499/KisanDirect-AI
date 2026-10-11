from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models import Notification, NotificationType


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for_user(self, user_id: UUID, *, unread_only: bool = False, page: int = 1, page_size: int = 20) -> tuple[list[Notification], int]:
        statement = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            statement = statement.where(Notification.is_read.is_(False))
        statement = statement.order_by(Notification.created_at.desc())

        count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
        total = int((await self.session.execute(count_statement)).scalar_one())

        result = await self.session.execute(statement.offset((page - 1) * page_size).limit(page_size))
        return list(result.scalars().all()), total

    async def get_for_user(self, user_id: UUID, notification_id: UUID) -> Notification | None:
        result = await self.session.execute(
            select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def latest_delivery_otp(self, user_id: UUID, shipment_id: UUID) -> Notification | None:
        result = await self.session.execute(
            select(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.related_entity_type == "shipment_otp",
                Notification.related_entity_id == shipment_id,
                Notification.title == "Delivery verification code",
            )
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, notification: Notification) -> Notification:
        self.session.add(notification)
        await self.session.commit()
        await self.session.refresh(notification)
        return notification

    def add_without_commit(self, notification: Notification) -> Notification:
        self.session.add(notification)
        return notification

    async def mark_read(self, notification: Notification) -> Notification:
        notification.is_read = True
        notification.read_at = notification.read_at or notification.updated_at
        await self.session.commit()
        await self.session.refresh(notification)
        return notification

    async def mark_all_read(self, user_id: UUID) -> int:
        result = await self.session.execute(
            select(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
        notifications = list(result.scalars().all())
        for item in notifications:
            item.is_read = True
            item.read_at = item.read_at or item.updated_at
        await self.session.commit()
        return len(notifications)

    async def find_recent_duplicate(
        self,
        *,
        user_id: UUID,
        notification_type: NotificationType,
        title: str,
        message: str,
        related_entity_type: str | None,
        related_entity_id: UUID | None,
    ) -> Notification | None:
        conditions = [
            Notification.user_id == user_id,
            Notification.notification_type == notification_type,
            Notification.title == title,
            Notification.message == message,
        ]
        if related_entity_type is None:
            conditions.append(Notification.related_entity_type.is_(None))
        else:
            conditions.append(Notification.related_entity_type == related_entity_type)
        if related_entity_id is None:
            conditions.append(Notification.related_entity_id.is_(None))
        else:
            conditions.append(Notification.related_entity_id == related_entity_id)

        result = await self.session.execute(
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
