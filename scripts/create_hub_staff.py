"""Provision a Kisan Hub and Hub Staff user securely via backend CLI."""
import argparse
import asyncio
import sys
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.security import hash_password
from backend.app.database.session import build_session_factory
from backend.app.models import User, UserRole
from backend.app.models.domain import Hub, HubStaff, HubStatus


async def provision_hub_staff(
    email: str = "hubstaff@kisandirect.ai",
    password: str = "HubStaff123!",
    hub_name: str = "Bhubaneswar Central Kisan Hub",
    pincode: str = "751001",
    address: str = "Kisan Mandi Complex, Unit 3, Bhubaneswar, Odisha",
) -> tuple[User, Hub]:
    settings = get_settings()
    factory = build_session_factory(settings)

    clean_email = email.strip().lower()

    async with factory() as session:
        # 1. Find or create Hub
        hub = await session.scalar(select(Hub).where(Hub.pincode == pincode, Hub.status == HubStatus.ACTIVE).limit(1))
        if hub is None:
            hub = Hub(
                id=uuid4(),
                name=hub_name,
                address=address,
                pincode=pincode,
                service_radius_km=Decimal("15.00"),
                status=HubStatus.ACTIVE,
                location=WKTElement("POINT(20.2961 85.8245)", srid=4326),
            )
            session.add(hub)
            await session.flush()
            print(f"Created Kisan Hub: {hub.name} (ID: {hub.id}, Pincode: {hub.pincode})")
        else:
            print(f"Found active Kisan Hub: {hub.name} (ID: {hub.id}, Pincode: {hub.pincode})")

        # 2. Find or create Hub Staff User
        user = await session.scalar(select(User).where(User.email == clean_email))
        if user is None:
            user = User(
                id=uuid4(),
                email=clean_email,
                hashed_password=hash_password(password),
                role=UserRole.HUB_STAFF,
                is_active=True,
            )
            session.add(user)
            await session.flush()
            print(f"Created Hub Staff User: {user.email} (ID: {user.id})")
        else:
            # Ensure role is HUB_STAFF and is_active is True
            user.role = UserRole.HUB_STAFF
            user.is_active = True
            user.hashed_password = hash_password(password)
            session.add(user)
            await session.flush()
            print(f"Updated User to HUB_STAFF with new password: {user.email} (ID: {user.id})")

        # 3. Associate with Hub
        assignment = await session.scalar(
            select(HubStaff).where(HubStaff.user_id == user.id, HubStaff.hub_id == hub.id)
        )
        if assignment is None:
            assignment = HubStaff(user_id=user.id, hub_id=hub.id)
            session.add(assignment)
            await session.flush()
            print(f"Assigned staff {user.email} to hub {hub.name}")
        else:
            print(f"Staff {user.email} is already assigned to hub {hub.name}")

        await session.commit()
        return user, hub


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or ensure a Kisan Hub Staff account.")
    parser.add_argument("--email", default="hubstaff@kisandirect.ai", help="Staff login email")
    parser.add_argument("--password", default="HubStaff123!", help="Staff login password")
    parser.add_argument("--hub-name", default="Bhubaneswar Central Kisan Hub", help="Hub name")
    parser.add_argument("--pincode", default="751001", help="Hub 6-digit pincode")

    args = parser.parse_args()
    asyncio.run(
        provision_hub_staff(
            email=args.email,
            password=args.password,
            hub_name=args.hub_name,
            pincode=args.pincode,
        )
    )
    print("\n[OK] Hub staff provisioning complete!")


if __name__ == "__main__":
    main()
