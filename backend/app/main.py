import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from backend.app.core.auth_rate_limit import AuthRateLimiter
from backend.app.core.config import get_settings
from backend.app.database.session import dispose_engine
from backend.app.routers import (
    admin,
    auth,
    consumers,
    crop_classifier,
    farmers,
    fulfillment,
    health,
    hub_operations,
    market_prices,
    marketplace,
    notifications,
    orders,
    price,
    quality,
    reviews,
    riders,
)


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Pre-warm AI inference engines & APMC data feeds once at startup
        try:
            crop_classifier.get_crop_inference()
        except Exception:
            pass
        try:
            quality.get_quality_inference()
        except Exception:
            pass
        try:
            market_prices.get_market_price_service()
        except Exception:
            pass
        try:
            from ml.price_prediction.inference import FairPriceInference
            FairPriceInference()
        except Exception:
            pass

        yield
        await dispose_engine(settings)

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.state.auth_rate_limiter = AuthRateLimiter(
        settings.auth_rate_limit_requests,
        settings.auth_rate_limit_window_seconds,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(admin.router, prefix=settings.api_v1_prefix)
    app.include_router(auth.router, prefix=settings.api_v1_prefix)
    app.include_router(farmers.router, prefix=settings.api_v1_prefix)
    app.include_router(consumers.router, prefix=settings.api_v1_prefix)
    app.include_router(marketplace.router, prefix=settings.api_v1_prefix)
    app.include_router(quality.router, prefix=settings.api_v1_prefix)
    app.include_router(crop_classifier.router, prefix=settings.api_v1_prefix)
    app.include_router(market_prices.router, prefix=settings.api_v1_prefix)
    app.include_router(price.router, prefix=settings.api_v1_prefix)
    app.include_router(orders.router, prefix=settings.api_v1_prefix)
    app.include_router(fulfillment.router, prefix=settings.api_v1_prefix)
    app.include_router(hub_operations.router, prefix=settings.api_v1_prefix)
    app.include_router(notifications.router, prefix=settings.api_v1_prefix)
    app.include_router(reviews.router, prefix=settings.api_v1_prefix)
    app.include_router(riders.router, prefix=settings.api_v1_prefix)
    media_root = Path(__file__).resolve().parents[1] / "storage"
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media_root), name="media")
    return app


app = create_app()
