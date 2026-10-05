import asyncio

from backend.app.core.config import get_settings
from backend.app.database.session import build_session_factory
from backend.app.services.order_lifecycle_service import OrderLifecycleService


async def expire_reservations() -> int:
    session_factory = build_session_factory(get_settings())
    async with session_factory() as session:
        return await OrderLifecycleService(session).expire_holds()


def main() -> None:
    expired_count = asyncio.run(expire_reservations())
    print(f"Expired checkout reservations: {expired_count}")


if __name__ == "__main__":
    main()
