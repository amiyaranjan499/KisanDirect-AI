from uuid import UUID

from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import (
    AIPricePrediction,
    AIQualityPrediction,
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    Review,
)


class ConsumerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_profile(self, user_id: UUID) -> Consumer | None:
        result = await self.session.execute(
            select(Consumer)
            .where(Consumer.user_id == user_id)
            .options(
                selectinload(Consumer.reviews)
                .selectinload(Review.listing)
                .selectinload(CropListing.crop),
                selectinload(Consumer.reviews)
                .selectinload(Review.listing)
                .selectinload(CropListing.farmer),
            )
        )
        return result.scalar_one_or_none()

    async def get_profile_by_id(self, consumer_id: UUID) -> Consumer | None:
        result = await self.session.execute(
            select(Consumer)
            .where(Consumer.id == consumer_id)
            .options(
                selectinload(Consumer.reviews)
                .selectinload(Review.listing)
                .selectinload(CropListing.crop),
                selectinload(Consumer.reviews)
                .selectinload(Review.listing)
                .selectinload(CropListing.farmer),
            )
        )
        return result.scalar_one_or_none()

    async def create_profile(self, user_id: UUID, values: dict) -> Consumer:
        consumer = Consumer(user_id=user_id, **values)
        self.session.add(consumer)
        await self.session.commit()
        await self.session.refresh(consumer)
        return consumer

    async def update_profile(self, consumer: Consumer, values: dict) -> Consumer:
        for key, value in values.items():
            setattr(consumer, key, value)
        await self.session.commit()
        await self.session.refresh(consumer)
        return consumer

    @staticmethod
    def _quality_label():
        return select(AIQualityPrediction.quality_label).where(AIQualityPrediction.listing_id == CropListing.id).order_by(AIQualityPrediction.created_at.desc()).limit(1).scalar_subquery()

    @staticmethod
    def _quality_score():
        return select(AIQualityPrediction.confidence).where(AIQualityPrediction.listing_id == CropListing.id).order_by(AIQualityPrediction.created_at.desc()).limit(1).scalar_subquery()

    @staticmethod
    def _recommended_price():
        return select(AIPricePrediction.predicted_price).where(AIPricePrediction.listing_id == CropListing.id).order_by(AIPricePrediction.created_at.desc()).limit(1).scalar_subquery()

    @staticmethod
    def _farmer_rating():
        return select(func.avg(Review.rating)).where(Review.listing_id == CropListing.id).scalar_subquery()

    async def list_active_listings(self, *, search=None, category=None, quality=None, min_price=None, max_price=None, min_distance_km=None, max_distance_km=None, min_rating=None, latitude=None, longitude=None, sort="newest", page=1, page_size=12) -> tuple[list[tuple], int]:
        distance = None
        if latitude is not None and longitude is not None:
            point = func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326).cast(Geography(geometry_type="POINT", srid=4326))
            distance = (func.ST_Distance(CropListing.location, point) / 1000).label("distance_km")
        quality_label = self._quality_label().label("quality")
        quality_score = self._quality_score().label("quality_score")
        recommended_price = self._recommended_price().label("ai_recommended_price")
        farmer_rating = self._farmer_rating().label("farmer_rating")
        columns = [CropListing, quality_label, quality_score, recommended_price, farmer_rating]
        if distance is not None:
            columns.append(distance)
        statement = select(*columns).join(CropListing.crop).join(CropListing.farmer).where(CropListing.availability_status == AvailabilityStatus.AVAILABLE).options(selectinload(CropListing.crop), selectinload(CropListing.farmer), selectinload(CropListing.images))
        if search:
            term = f"%{search.strip()}%"
            statement = statement.where(Crop.name.ilike(term) | Farmer.name.ilike(term))
        if category:
            statement = statement.where(Crop.category.ilike(f"%{category.strip()}%"))
        if quality:
            statement = statement.where(quality_label.ilike(f"%{quality.strip()}%"))
        if min_price is not None:
            statement = statement.where(CropListing.asking_price >= min_price)
        if max_price is not None:
            statement = statement.where(CropListing.asking_price <= max_price)
        if distance is not None:
            if min_distance_km is not None:
                statement = statement.where(distance >= min_distance_km)
            if max_distance_km is not None:
                statement = statement.where(distance <= max_distance_km)
        elif min_distance_km is not None or max_distance_km is not None or sort == "nearest":
            raise ValueError("latitude and longitude are required for distance operations")
        if min_rating is not None:
            statement = statement.where(farmer_rating >= min_rating)
        if sort == "price_asc":
            statement = statement.order_by(CropListing.asking_price.asc())
        elif sort == "price_desc":
            statement = statement.order_by(CropListing.asking_price.desc())
        elif sort == "nearest":
            statement = statement.order_by(distance.asc())
        elif sort == "highest_rated":
            statement = statement.order_by(farmer_rating.desc().nullslast())
        else:
            statement = statement.order_by(CropListing.created_at.desc())
        count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
        total = int((await self.session.execute(count_statement)).scalar_one())
        result = await self.session.execute(statement.offset((page - 1) * page_size).limit(page_size))
        return list(result.unique().all()), total

    async def get_active_listing(self, listing_id: UUID) -> tuple | None:
        result = await self.session.execute(
            select(CropListing, self._quality_label().label("quality"), self._quality_score().label("quality_score"), self._recommended_price().label("ai_recommended_price"), self._farmer_rating().label("farmer_rating"))
            .join(CropListing.crop).join(CropListing.farmer)
            .where(CropListing.id == listing_id, CropListing.availability_status == AvailabilityStatus.AVAILABLE)
            .options(selectinload(CropListing.crop), selectinload(CropListing.farmer), selectinload(CropListing.images))
        )
        return result.unique().one_or_none()

    async def get_farmer(self, farmer_id: UUID) -> Farmer | None:
        result = await self.session.execute(select(Farmer).where(Farmer.id == farmer_id).options(selectinload(Farmer.listings).selectinload(CropListing.crop), selectinload(Farmer.listings).selectinload(CropListing.images)))
        return result.scalar_one_or_none()

    async def nearby_farmers(self, latitude: float, longitude: float, radius_km: float, page: int, page_size: int) -> tuple[list[tuple], int]:
        search_point = func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326).cast(Geography(geometry_type="POINT", srid=4326))
        distance = (func.ST_Distance(Farmer.location, search_point) / 1000).label("distance_km")
        rating = func.avg(Review.rating).label("rating")
        active_count = func.count(func.distinct(CropListing.id)).label("active_listing_count")
        statement = (
            select(Farmer, distance, rating, active_count)
            .join(CropListing, CropListing.farmer_id == Farmer.id)
            .outerjoin(Review, Review.listing_id == CropListing.id)
            .where(
                Farmer.location.is_not(None),
                CropListing.availability_status == AvailabilityStatus.AVAILABLE,
                func.ST_DWithin(Farmer.location, search_point, radius_km * 1000),
            )
            .group_by(Farmer.id)
            .order_by(distance.asc())
            .options(selectinload(Farmer.listings).selectinload(CropListing.crop), selectinload(Farmer.listings).selectinload(CropListing.images))
        )
        count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
        total = int((await self.session.execute(count_statement)).scalar_one())
        result = await self.session.execute(statement.offset((page - 1) * page_size).limit(page_size))
        return list(result.all()), total
