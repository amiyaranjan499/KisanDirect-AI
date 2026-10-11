from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.domain import (
    Consumer,
    Farmer,
    Rider,
    RiderApprovalStatus,
    User,
    UserRole,
)


class SqlAlchemyUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    async def create(
        self,
        email: str,
        hashed_password: str,
        role: UserRole,
        display_name: str | None = None,
    ) -> User:
        async with self.session.begin_nested():
            user = User(email=email.lower(), hashed_password=hashed_password, role=role)
            self.session.add(user)
            await self.session.flush()
            profile_name = email.split("@", 1)[0].replace(".", " ").strip() or role.value.title()
            if role is UserRole.FARMER:
                self.session.add(Farmer(user_id=user.id, name=profile_name))
            elif role is UserRole.CONSUMER:
                self.session.add(Consumer(user_id=user.id, name=profile_name))
            elif role is UserRole.RIDER:
                self.session.add(
                    Rider(
                        user_id=user.id,
                        display_name=display_name.strip() if display_name else None,
                        approval_status=RiderApprovalStatus.PENDING_APPROVAL,
                    )
                )
            await self.session.flush()
        await self.session.commit()
        await self.session.refresh(user)
        return user
