from datetime import datetime

from ml.price_prediction.preprocessing import PriceFeatures


def build_price_features(listing, quality_grade: str | None = None) -> PriceFeatures:
    location = getattr(listing, "location", None)
    return PriceFeatures(
        crop_name=listing.crop.name,
        category=listing.crop.category,
        quantity=listing.quantity,
        unit=listing.unit,
        latitude=None,
        longitude=None,
        quality_grade=quality_grade,
        harvest_date=listing.harvest_date.isoformat() if isinstance(listing.harvest_date, datetime) else None,
    )
