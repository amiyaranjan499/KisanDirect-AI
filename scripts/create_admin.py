"""Create the first administrator without exposing ADMIN registration publicly."""
import asyncio
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.security import hash_password
from backend.app.database.session import build_session_factory
from backend.app.models import Admin, User, UserRole


async def create_admin(email: str, password: str) -> None:
    settings = get_settings()
    factory = build_session_factory(settings)
    async with factory() as session:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise ValueError("A user with this email already exists")
        user = User(email=email, hashed_password=hash_password(password), role=UserRole.ADMIN)
        session.add(user)
        await session.flush()
        session.add(Admin(user_id=user.id, name="Platform Administrator"))
        await session.commit()


def main() -> None:
    email = input("Admin email: ").strip().lower()
    password = getpass.getpass("Admin password: ")
    confirmation = getpass.getpass("Confirm admin password: ")
    if not email or not password or password != confirmation:
        raise SystemExit("Email and matching non-empty passwords are required")
    asyncio.run(create_admin(email, password))
    print(f"Created administrator {email}")


if __name__ == "__main__":
    main()
