import json
import os
import sys
from pathlib import Path
import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token
from backend.app.database.session import build_engine
from backend.app.models import User, UserRole
from sqlalchemy import select
import asyncio

BASE_URL = "http://127.0.0.1:8000"

def get_auth_token():
    async def get_farmer_id():
        engine = build_engine(Settings())
        async with engine.connect() as conn:
            stmt = select(User.id).where(User.role == UserRole.FARMER, User.is_active == True).limit(1)
            res = await conn.execute(stmt)
            row = res.first()
        await engine.dispose()
        return row[0] if row else None

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    farmer_id = asyncio.run(get_farmer_id())
    assert farmer_id is not None, "No active farmer found in database!"
    settings = Settings()
    token = create_access_token(str(farmer_id), UserRole.FARMER, settings)
    return {"Authorization": f"Bearer {token}"}

def test_supported_crop_pipeline():
    print("\n--- Testing Supported Crop (Potato) ---")
    headers = get_auth_token()
    img_path = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "potato.png"
    assert img_path.exists(), f"Image not found at {img_path}"

    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Step 1: Classify
        with open(img_path, "rb") as f:
            r = client.post("/api/v1/ai/crop/classify", headers=headers, files={"image": ("potato.png", f, "image/png")})
        assert r.status_code == 200, f"Classify failed: {r.text}"
        c_data = r.json()
        print("Classify response:", c_data)
        assert c_data["crop_name"] == "Potato"
        assert c_data["category"] == "Vegetables"
        assert c_data["source"] == "local"
        assert "confidence" not in c_data
        assert "variety" not in c_data
        assert "hybrid" not in json.dumps(c_data).lower()
        assert "desi" not in json.dumps(c_data).lower()

        # Step 2: Quality
        with open(img_path, "rb") as f:
            r_q = client.post("/api/v1/ai/quality/analyze", headers=headers, files={"image": ("potato.png", f, "image/png")})
        assert r_q.status_code == 200, f"Quality failed: {r_q.text}"
        q_data = r_q.json()
        print("Quality response:", q_data)
        quality_label = q_data["quality_label"]
        assert quality_label in ["Good", "Average", "Poor"]

        # Step 3: Market Price & Trend
        r_m = client.get(f"/api/v1/market-prices/latest?crop={c_data['crop_name']}&state=Maharashtra&district=Pune", headers=headers)
        assert r_m.status_code == 200, f"Market price failed: {r_m.text}"
        m_data = r_m.json()
        print("Market price response:", m_data)
        assert m_data["market_price"] is not None
        assert m_data["price_trend"] in ["Rising", "Stable", "Falling"]
        assert "variety" not in m_data

        # Step 4: AI Fair Price
        r_p = client.post("/api/v1/ai/price/estimate", headers=headers, json={
            "crop_name": c_data["crop_name"],
            "quality_grade": quality_label,
            "market_price": m_data["market_price"],
            "quantity": 100,
            "unit": "kg",
            "state": "Maharashtra",
            "district": "Pune"
        })
        assert r_p.status_code == 200, f"Fair price failed: {r_p.text}"
        p_data = r_p.json()
        print("Fair price response:", p_data)
        assert p_data["predicted_price"] is not None
        assert p_data["prediction_status"] == "COMPLETED"

    print("Supported crop pipeline VERIFIED successfully!")

def test_unknown_crop_pipeline():
    print("\n--- Testing Unknown Crop Auto-Gemini Fallback ---")
    headers = get_auth_token()
    img_path = PROJECT_ROOT / "ml" / "datasets" / "ten_crops" / "demo_test_images" / "dragon_fruit.jpg"
    assert img_path.exists(), f"Image not found at {img_path}"

    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        with open(img_path, "rb") as f:
            r = client.post("/api/v1/ai/crop/classify", headers=headers, files={"image": ("dragon_fruit.jpg", f, "image/jpeg")})
        assert r.status_code == 200, f"Classify failed: {r.text}"
        c_data = r.json()
        print("Unknown crop classify response:", c_data)
        assert c_data["source"] == "gemini"
        assert "confidence" not in c_data
        assert "variety" not in c_data

    print("Unknown crop auto-Gemini fallback VERIFIED successfully!")

if __name__ == "__main__":
    test_supported_crop_pipeline()
    test_unknown_crop_pipeline()
