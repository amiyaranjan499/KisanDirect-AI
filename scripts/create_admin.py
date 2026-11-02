"""Create an administrator account securely via backend CLI without exposing public registration."""
import argparse
import asyncio
import getpass
import sys
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import select
from sqlalchemy.engine.url import make_url

from backend.app.core.config import get_settings
from backend.app.core.security import hash_password
from backend.app.database.session import build_session_factory
from backend.app.models import Admin, User, UserRole


async def admin_exists() -> bool:
    """Check whether at least one administrator user already exists."""
    settings = get_settings()
    factory = build_session_factory(settings)
    async with factory() as session:
        existing = await session.scalar(select(User.id).where(User.role == UserRole.ADMIN).limit(1))
        return existing is not None


async def create_admin(
    email: str,
    password: str,
    name: str = "Platform Administrator",
    allow_additional: bool = False,
) -> User:
    """Provision a new administrator user and corresponding Admin profile record."""
    clean_email = email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise ValueError("A valid email address is required")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters in length")

    clean_name = name.strip() or "Platform Administrator"
    if len(clean_name) > 160:
        raise ValueError("Admin name cannot exceed 160 characters")

    settings = get_settings()
    factory = build_session_factory(settings)
    async with factory() as session:
        async with session.begin():
            # Refuse to create another initial admin if one already exists unless authorized
            existing_admin = await session.scalar(
                select(User.id).where(User.role == UserRole.ADMIN).limit(1)
            )
            if existing_admin is not None and not allow_additional:
                raise ValueError(
                    "An administrator account already exists. "
                    "Creating additional administrators requires explicit authorization (--allow-additional)."
                )

            existing_user = await session.scalar(select(User.id).where(User.email == clean_email))
            if existing_user is not None:
                raise ValueError(f"A user with email '{clean_email}' already exists")

            user = User(
                email=clean_email,
                hashed_password=hash_password(password),
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(user)
            await session.flush()

            admin_profile = Admin(user_id=user.id, name=clean_name)
            session.add(admin_profile)
            await session.flush()

        return user


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Securely provision an administrator account for KisanDirect AI."
    )
    parser.add_argument("--email", "-e", help="Admin email address")
    parser.add_argument("--password", "-p", help="Admin password (min 8 characters)")
    parser.add_argument("--name", "-n", default="Platform Administrator", help="Admin display name")
    parser.add_argument(
        "--allow-additional",
        action="store_true",
        help="Authorize creating an additional administrator if an admin already exists",
    )
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Confirm database target environment without interactive prompt",
    )
    args = parser.parse_args()

    settings = get_settings()
    db_url = make_url(settings.database_url)
    target_summary = f"{db_url.drivername} on {db_url.host or 'localhost'}:{db_url.port or 5432}/{db_url.database}"

    print("=" * 60)
    print("KisanDirect AI - Secure Admin Provisioning")
    print(f"Target Database : {target_summary}")
    print(f"App Environment : {settings.app_env}")
    print("=" * 60)

    if not args.yes:
        try:
            confirm = input(
                f"Confirm target database '{db_url.database}'? Enter 'yes' to proceed: "
            ).strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nProvisioning cancelled.")
            sys.exit(1)

        if confirm not in ("yes", "y"):
            print("Provisioning aborted by operator.")
            sys.exit(1)

    allow_additional = args.allow_additional
    try:
        has_existing_admin = asyncio.run(admin_exists())
    except Exception as exc:
        raise SystemExit(f"Database connection error: {exc}")

    if has_existing_admin and not allow_additional:
        if sys.stdin.isatty():
            try:
                choice = input(
                    "Notice: An administrator account already exists.\n"
                    "Authorize creating an additional administrator? (yes/no): "
                ).strip().lower()
                if choice in ("yes", "y"):
                    allow_additional = True
                else:
                    raise SystemExit("Provisioning aborted: Additional administrator was not authorized.")
            except (KeyboardInterrupt, EOFError):
                print("\nProvisioning cancelled.")
                sys.exit(1)
        else:
            raise SystemExit(
                "Provisioning aborted: An administrator already exists. "
                "Use --allow-additional to authorize creating more administrators."
            )

    email = args.email
    password = args.password
    name = args.name

    if not email:
        try:
            email = input("Admin email: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nProvisioning cancelled.")
            sys.exit(1)

    if not password:
        try:
            password = getpass.getpass("Admin password (min 8 characters): ")
            confirmation = getpass.getpass("Confirm admin password: ")
        except (KeyboardInterrupt, EOFError):
            print("\nProvisioning cancelled.")
            sys.exit(1)

        if password != confirmation:
            raise SystemExit("Error: Passwords do not match.")

    if not email or not password:
        raise SystemExit("Error: Both email and a non-empty password are required.")

    try:
        user = asyncio.run(create_admin(email, password, name, allow_additional=allow_additional))
        print(f"Successfully provisioned Administrator account: {user.email} (ID: {user.id})")
    except ValueError as exc:
        raise SystemExit(f"Provisioning error: {exc}")


if __name__ == "__main__":
    main()
