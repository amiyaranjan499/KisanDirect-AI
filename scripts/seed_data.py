"""Create deterministic demo users, farmers, crops, and listings."""
import asyncio
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.platform == "win32":
	asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.security import hash_password
from backend.app.database.session import build_session_factory
from backend.app.models import Admin, Consumer, Crop, CropImage, CropListing, Farmer, User, UserRole

FARMERS = [("demo.farmer1@example.com", "Demo Farmer 1", "751001", "20.2961 85.8245"), ("demo.farmer2@example.com", "Demo Farmer 2", "751002", "20.3000 85.8300"), ("demo.farmer3@example.com", "Demo Farmer 3", "751003", "20.3100 85.8400")]
CROPS = [("Tomato", "Vegetables"), ("Potato", "Vegetables"), ("Onion", "Vegetables"), ("Carrot", "Vegetables"), ("Spinach", "Leafy greens"), ("Coriander", "Leafy greens"), ("Cauliflower", "Vegetables"), ("Cabbage", "Vegetables"), ("Brinjal", "Vegetables"), ("Okra", "Vegetables"), ("Green peas", "Vegetables"), ("Bell pepper", "Vegetables"), ("Cucumber", "Vegetables"), ("Pumpkin", "Vegetables"), ("Banana", "Fruits"), ("Mango", "Fruits"), ("Guava", "Fruits"), ("Papaya", "Fruits"), ("Lemon", "Fruits"), ("Ginger", "Spices")]


async def seed() -> None:
	factory = build_session_factory(get_settings())
	async with factory() as session:
		admin = await session.scalar(select(User).where(User.email == "admin@demo.kisandirect.local"))
		if admin is None:
			admin = User(email="admin@demo.kisandirect.local", hashed_password=hash_password("DemoAdmin-ChangeMe-123!"), role=UserRole.ADMIN)
			session.add(admin)
			await session.flush()
			session.add(Admin(user_id=admin.id, name="Demo Administrator"))
		farmer_profiles = []
		for email, name, pin_code, point in FARMERS:
			user = await session.scalar(select(User).where(User.email == email))
			if user is None:
				user = User(email=email, hashed_password=hash_password("DemoFarmer-ChangeMe-123!"), role=UserRole.FARMER)
				session.add(user)
				await session.flush()
			farmer = await session.scalar(select(Farmer).where(Farmer.user_id == user.id))
			if farmer is None:
				farmer = Farmer(user_id=user.id, name=name, pin_code=pin_code, city="Bhubaneswar", state="Odisha", location=WKTElement(f"POINT({point})", srid=4326))
				session.add(farmer)
				await session.flush()
			farmer_profiles.append(farmer)
		consumer_user = await session.scalar(select(User).where(User.email == "consumer@demo.kisandirect.local"))
		if consumer_user is None:
			consumer_user = User(email="consumer@demo.kisandirect.local", hashed_password=hash_password("DemoConsumer-ChangeMe-123!"), role=UserRole.CONSUMER)
			session.add(consumer_user)
			await session.flush()
			session.add(Consumer(user_id=consumer_user.id, name="Demo Consumer", pin_code="751001", city="Bhubaneswar", state="Odisha"))
		for index, (name, category) in enumerate(CROPS):
			crop = await session.scalar(select(Crop).where(Crop.name == name))
			if crop is None:
				crop = Crop(name=name, category=category, description=f"Fresh {name.lower()} from a local Kisan farmer.")
				session.add(crop)
				await session.flush()
			farmer = farmer_profiles[index % len(farmer_profiles)]
			listing = await session.scalar(select(CropListing).where(CropListing.crop_id == crop.id, CropListing.farmer_id == farmer.id))
			if listing is None:
				listing = CropListing(crop_id=crop.id, farmer_id=farmer.id, quantity=Decimal("100"), unit="kg", asking_price=Decimal(str(20 + index)), minimum_order_quantity=Decimal("1"), description="Demo listing with placeholder image.")
				session.add(listing)
				await session.flush()
				session.add(CropImage(listing_id=listing.id, storage_url=f"placeholders/{name.lower().replace(' ', '-')}.svg", content_type="image/svg+xml"))
		await session.commit()


if __name__ == "__main__":
	asyncio.run(seed())
	print("Demo data is ready. Change all demo passwords before shared use.")
