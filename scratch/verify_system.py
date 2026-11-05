import asyncio
import os
import sys
from pathlib import Path

# Set up project root
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from sqlalchemy import text
from ml.crop_classification.inference import CropClassifierInference
from ml.crop_classification.model_metadata import CLASSES as CLASSIFIER_CROPS
from ml.price_prediction.inference import FairPriceInference
from ml.crop_quality.inference import CropQualityInference
from backend.app.services.market_price_service import MarketPriceService

async def verify_all():
    results = {}

    # 1. Database
    try:
        settings = Settings()
        engine = build_engine(settings)
        async with engine.connect() as conn:
            val = await conn.execute(text("SELECT 1"))
            assert val.scalar() == 1
        await engine.dispose()
        results["database"] = "CONNECTED"
    except Exception as e:
        results["database"] = f"FAILED: {e}"

    # 2. Local 10-crop classifier
    try:
        classifier = CropClassifierInference()
        assert classifier.model is not None
        assert len(CLASSIFIER_CROPS) == 10
        results["local_ai_model"] = "LOADED"
        results["crops_count"] = len(CLASSIFIER_CROPS)
    except Exception as e:
        results["local_ai_model"] = f"FAILED: {e}"

    # 3. Gemini configuration (DO NOT PRINT KEY)
    try:
        settings = Settings()
        has_key = bool(settings.gemini_api_key and len(settings.gemini_api_key.strip()) > 0)
        results["gemini"] = "CONNECTED" if has_key else "NOT_CONFIGURED"
    except Exception as e:
        results["gemini"] = f"FAILED: {e}"

    # 4. Market price service
    try:
        market_service = MarketPriceService()
        rate = market_service.get_market_price("Potato", "Maharashtra", "Pune")
        assert rate.market_price is not None
        results["market_price_service"] = "READY"
    except Exception as e:
        results["market_price_service"] = f"FAILED: {e}"

    # 5. Fair price model
    try:
        fair_price_model = FairPriceInference()
        pred = fair_price_model.predict({
            "crop_name": "Potato",
            "quality_grade": "Grade A",
            "quantity": 100,
            "market_price": 28.0,
        })
        assert pred.predicted_price is not None
        results["fair_price_model"] = "READY"
    except Exception as e:
        results["fair_price_model"] = f"FAILED: {e}"

    # 6. Quality model
    try:
        quality_model = CropQualityInference()
        assert quality_model.session is not None
        results["quality_model"] = "READY"
    except Exception as e:
        results["quality_model"] = f"FAILED: {e}"

    for k, v in results.items():
        print(f"{k}: {v}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_all())
