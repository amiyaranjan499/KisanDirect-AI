from uuid import UUID
from decimal import Decimal

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    Crop,
    CropImage,
    CropListing,
    Farmer,
    FarmerHiddenOrder,
    FarmerWithdrawal,
    Hub,
    HubStaff,
    HubStatus,
    HubStock,
    Notification,
    Order,
    OrderItem,
    Review,
    User,
    UserRole,
)


class FarmerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_profile(self, user_id: UUID) -> Farmer | None:
        result = await self.session.execute(select(Farmer).where(Farmer.user_id == user_id))
        return result.scalar_one_or_none()

    async def create_profile(self, user_id: UUID, values: dict) -> Farmer:
        farmer = Farmer(user_id=user_id, **values)
        self.session.add(farmer)
        await self.session.commit()
        await self.session.refresh(farmer)
        return farmer

    async def update_profile(self, farmer: Farmer, values: dict) -> Farmer:
        for key, value in values.items():
            setattr(farmer, key, value)
        await self.session.commit()
        await self.session.refresh(farmer)
        return farmer

    async def get_coordinates(self, table_name: str, record_id: UUID) -> tuple[float, float] | None:
        if table_name not in {"farmers", "crop_listings", "hubs"}:
            raise ValueError("Unsupported location table")
        result = await self.session.execute(
            text(f"SELECT ST_Y(location::geometry), ST_X(location::geometry) FROM {table_name} WHERE id = :record_id"),
            {"record_id": record_id},
        )
        row = result.one_or_none()
        return (float(row[0]), float(row[1])) if row and row[0] is not None else None

    async def get_coordinates_batch(self, table_name: str, record_ids: list[UUID]) -> dict[UUID, tuple[float, float]]:
        if not record_ids:
            return {}
        if table_name not in {"farmers", "crop_listings", "hubs"}:
            raise ValueError("Unsupported location table")
        result = await self.session.execute(
            text(f"SELECT id, ST_Y(location::geometry), ST_X(location::geometry) FROM {table_name} WHERE id = ANY(:ids) AND location IS NOT NULL"),
            {"ids": record_ids},
        )
        return {row[0]: (float(row[1]), float(row[2])) for row in result.all()}

    async def get_listing(self, listing_id: UUID, farmer_id: UUID) -> CropListing | None:
        result = await self.session.execute(
            select(CropListing)
            .where(CropListing.id == listing_id, CropListing.farmer_id == farmer_id)
            .options(
                selectinload(CropListing.crop),
                selectinload(CropListing.images),
                selectinload(CropListing.quality_predictions),
                selectinload(CropListing.price_predictions),
            )
        )
        return result.scalar_one_or_none()

    async def list_listings(self, farmer_id: UUID) -> list[CropListing]:
        result = await self.session.execute(
            select(CropListing)
            .where(CropListing.farmer_id == farmer_id)
            .order_by(CropListing.created_at.desc())
            .options(
                selectinload(CropListing.crop),
                selectinload(CropListing.images),
                selectinload(CropListing.quality_predictions),
                selectinload(CropListing.price_predictions),
            )
        )
        return list(result.scalars().unique().all())

    async def list_listings_for_dashboard(self, farmer_id: UUID) -> list[CropListing]:
        result = await self.session.execute(
            select(CropListing)
            .where(CropListing.farmer_id == farmer_id)
            .order_by(CropListing.created_at.desc())
            .options(
                selectinload(CropListing.crop),
                selectinload(CropListing.images),
                selectinload(CropListing.quality_predictions),
                selectinload(CropListing.price_predictions),
            )
        )
        return list(result.scalars().unique().all())

    async def list_orders_for_dashboard(self, farmer_user_id: UUID) -> list[Order]:
        hidden_subquery = (
            select(FarmerHiddenOrder.order_id)
            .join(Farmer, Farmer.id == FarmerHiddenOrder.farmer_id)
            .where(Farmer.user_id == farmer_user_id)
        )
        result = await self.session.execute(
            select(Order)
            .join(Order.items)
            .join(OrderItem.listing)
            .join(CropListing.farmer)
            .where(
                Farmer.user_id == farmer_user_id,
                ~Order.id.in_(hidden_subquery),
                or_(
                    Order.hub_id.is_(None),
                    select(Hub.id)
                    .where(Hub.id == Order.hub_id, Hub.farmer_id == Farmer.id)
                    .exists(),
                    select(HubStock.id)
                    .where(
                        HubStock.hub_id == Order.hub_id,
                        HubStock.listing_id == CropListing.id,
                    )
                    .exists(),
                ),
            )
            .distinct()
            .order_by(Order.created_at.desc())
            .options(
                selectinload(Order.consumer),
                selectinload(Order.payment),
                selectinload(Order.delivery),
                selectinload(Order.hub),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.crop),
                selectinload(Order.items).selectinload(OrderItem.listing).selectinload(CropListing.farmer),
            )
        )
        return list(result.unique().scalars().all())

    async def hide_order(self, farmer_id: UUID, order_id: UUID) -> FarmerHiddenOrder:
        existing = await self.session.scalar(
            select(FarmerHiddenOrder).where(
                FarmerHiddenOrder.farmer_id == farmer_id,
                FarmerHiddenOrder.order_id == order_id,
            )
        )
        if existing is not None:
            return existing
        record = FarmerHiddenOrder(farmer_id=farmer_id, order_id=order_id)
        self.session.add(record)
        await self.session.flush()
        return record

    async def count_unread_notifications(self, user_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(Notification.id)).where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
        return int(result.scalar_one() or 0)

    async def list_reviews_for_farmer(self, farmer_id: UUID) -> list[Review]:
        result = await self.session.execute(
            select(Review)
            .join(Review.listing)
            .where(CropListing.farmer_id == farmer_id)
            .order_by(Review.created_at.desc())
            .options(
                selectinload(Review.consumer),
                selectinload(Review.listing).selectinload(CropListing.crop),
                selectinload(Review.listing).selectinload(CropListing.farmer),
                selectinload(Review.order),
            )
        )
        return list(result.scalars().all())

    async def get_dashboard_review_summary(self, farmer_id: UUID) -> tuple[float | None, int]:
        result = await self.session.execute(
            select(
                func.avg(Review.rating).label("average_rating"),
                func.count(Review.id).label("review_count"),
            )
            .join(Review.listing)
            .where(CropListing.farmer_id == farmer_id)
        )
        row = result.one_or_none()
        if row is None or row.average_rating is None:
            return None, 0
        return float(row.average_rating), int(row.review_count or 0)

    async def get_or_create_crop(self, name: str, category: str | None) -> Crop:
        result = await self.session.execute(select(Crop).where(Crop.name == name))
        crop = result.scalar_one_or_none()
        if crop is None:
            crop = Crop(name=name, category=category)
            self.session.add(crop)
            await self.session.flush()
        elif category is not None and crop.category != category:
            crop.category = category
        return crop

    async def create_listing(self, farmer_id: UUID, values: dict) -> CropListing:
        crop = await self.get_or_create_crop(values.pop("crop_name"), values.pop("crop_category", None))
        listing = CropListing(farmer_id=farmer_id, crop=crop, **values)
        self.session.add(listing)
        await self.session.commit()
        await self.session.refresh(listing)
        await self.session.refresh(crop)
        return listing

    async def update_listing(self, listing: CropListing, values: dict) -> CropListing:
        if "crop_name" in values:
            listing.crop = await self.get_or_create_crop(values.pop("crop_name"), values.pop("crop_category", None))
        elif "crop_category" in values:
            listing.crop.category = values.pop("crop_category")
        for key, value in values.items():
            setattr(listing, key, value)
        await self.session.commit()
        await self.session.refresh(listing)
        return listing

    async def add_image(self, listing_id: UUID, storage_url: str, content_type: str) -> CropImage:
        image = CropImage(listing_id=listing_id, storage_url=storage_url, content_type=content_type)
        self.session.add(image)
        await self.session.commit()
        await self.session.refresh(image)
        return image

    async def get_farmer_coordinates(self, farmer_id: UUID) -> tuple[float, float] | None:
        coords_res = await self.session.execute(
            select(
                func.ST_Y(cast(Farmer.location, Geometry)),
                func.ST_X(cast(Farmer.location, Geometry)),
            ).where(Farmer.id == farmer_id)
        )
        row = coords_res.one_or_none()
        if row and row[0] is not None and row[1] is not None:
            return (float(row[0]), float(row[1]))
        return None

    async def list_facilities(self, farmer_id: UUID) -> list[tuple[Hub, int, float | None, float | None]]:
        result = await self.session.execute(
            select(
                Hub,
                func.count(HubStaff.user_id).label("staff_count"),
                func.ST_Y(cast(Hub.location, Geometry)).label("latitude"),
                func.ST_X(cast(Hub.location, Geometry)).label("longitude"),
            )
            .outerjoin(HubStaff, HubStaff.hub_id == Hub.id)
            .where(Hub.farmer_id == farmer_id)
            .group_by(Hub.id)
            .order_by(Hub.name, Hub.id)
        )
        return [
            (
                hub,
                int(staff_count),
                float(lat) if lat is not None else None,
                float(lng) if lng is not None else None,
            )
            for hub, staff_count, lat, lng in result.all()
        ]

    async def get_facility(self, farmer_id: UUID, facility_id: UUID) -> tuple[Hub, int, float | None, float | None] | None:
        result = await self.session.execute(
            select(
                Hub,
                func.count(HubStaff.user_id).label("staff_count"),
                func.ST_Y(cast(Hub.location, Geometry)).label("latitude"),
                func.ST_X(cast(Hub.location, Geometry)).label("longitude"),
            )
            .outerjoin(HubStaff, HubStaff.hub_id == Hub.id)
            .where(Hub.id == facility_id, Hub.farmer_id == farmer_id)
            .group_by(Hub.id)
        )
        row = result.first()
        if not row:
            return None
        hub, staff_count, lat, lng = row
        return (
            hub,
            int(staff_count),
            float(lat) if lat is not None else None,
            float(lng) if lng is not None else None,
        )

    async def get_facility_for_update(self, farmer_id: UUID, facility_id: UUID) -> Hub | None:
        result = await self.session.execute(
            select(Hub).where(Hub.id == facility_id, Hub.farmer_id == farmer_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def create_facility(
        self,
        farmer_id: UUID,
        name: str,
        address: str,
        pincode: str,
        latitude: float | None,
        longitude: float | None,
        service_radius_km: Decimal,
    ) -> tuple[Hub, float | None, float | None]:
        lat = latitude if latitude is not None else 20.2961
        lng = longitude if longitude is not None else 85.8245
        location = WKTElement(f"POINT({lng} {lat})", srid=4326)
        hub = Hub(
            name=name,
            address=address,
            pincode=pincode,
            service_radius_km=service_radius_km,
            status=HubStatus.ACTIVE,
            farmer_id=farmer_id,
            location=location,
        )
        self.session.add(hub)
        await self.session.flush()
        return (hub, latitude, longitude)

    async def update_facility(
        self,
        facility: Hub,
        values: dict,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> tuple[Hub, float | None, float | None]:
        for key, value in values.items():
            if value is not None:
                if key == "status":
                    setattr(facility, key, HubStatus(value))
                else:
                    setattr(facility, key, value)
        if latitude is not None and longitude is not None:
            facility.location = WKTElement(f"POINT({longitude} {latitude})", srid=4326)
        await self.session.flush()
        coords_res = await self.session.execute(
            select(
                func.ST_Y(cast(Hub.location, Geometry)),
                func.ST_X(cast(Hub.location, Geometry)),
            ).where(Hub.id == facility.id)
        )
        row = coords_res.one_or_none()
        lat = float(row[0]) if row and row[0] is not None else None
        lng = float(row[1]) if row and row[1] is not None else None
        return (facility, lat, lng)

    async def list_facility_staff(self, farmer_id: UUID) -> list[tuple[User, Hub]]:
        result = await self.session.execute(
            select(User, Hub)
            .join(HubStaff, HubStaff.user_id == User.id)
            .join(Hub, Hub.id == HubStaff.hub_id)
            .where(Hub.farmer_id == farmer_id, User.role == UserRole.HUB_STAFF)
            .order_by(Hub.name, User.email)
        )
        return list(result.all())

    async def list_staff_for_facility(self, farmer_id: UUID, facility_id: UUID) -> list[tuple[User, Hub]]:
        result = await self.session.execute(
            select(User, Hub)
            .join(HubStaff, HubStaff.user_id == User.id)
            .join(Hub, Hub.id == HubStaff.hub_id)
            .where(Hub.id == facility_id, Hub.farmer_id == farmer_id, User.role == UserRole.HUB_STAFF)
            .order_by(User.email)
        )
        return list(result.all())

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create_facility_staff(
        self,
        facility_id: UUID,
        email: str,
        hashed_password: str,
        display_name: str | None = None,
    ) -> tuple[User, Hub]:
        user = User(
            email=email,
            hashed_password=hashed_password,
            role=UserRole.HUB_STAFF,
            is_active=True,
        )
        self.session.add(user)
        await self.session.flush()
        self.session.add(HubStaff(user_id=user.id, hub_id=facility_id))
        await self.session.flush()
        hub = await self.session.get(Hub, facility_id)
        return (user, hub)

    async def remove_facility_staff(self, facility_id: UUID, staff_user_id: UUID) -> bool:
        result = await self.session.execute(
            select(HubStaff).where(
                HubStaff.hub_id == facility_id,
                HubStaff.user_id == staff_user_id,
            )
        )
        assignment = result.scalar_one_or_none()
        if assignment is None:
            return False
        await self.session.delete(assignment)
        await self.session.flush()
        return True

    async def list_withdrawals(self, farmer_id: UUID) -> list[FarmerWithdrawal]:
        result = await self.session.execute(
            select(FarmerWithdrawal)
            .where(FarmerWithdrawal.farmer_id == farmer_id)
            .order_by(FarmerWithdrawal.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_withdrawal(self, withdrawal: FarmerWithdrawal) -> FarmerWithdrawal:
        self.session.add(withdrawal)
        await self.session.commit()
        await self.session.refresh(withdrawal)
        return withdrawal

