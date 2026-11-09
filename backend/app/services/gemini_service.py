"""Google Gemini Vision fallback service for unidentified or exotic crops."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Callable

from backend.app.core.config import get_settings

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """Service utilizing Gemini Vision for agricultural produce identification."""

    _test_override: Callable[[bytes], dict[str, str]] | None = None

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or getattr(get_settings(), "gemini_api_key", "") or os.environ.get("GEMINI_API_KEY", "")

    @classmethod
    def set_test_override(cls, handler: Callable[[bytes], dict[str, str]] | None) -> None:
        """Allow test suites to inject deterministic fallback responses."""
        cls._test_override = handler

    def is_available(self) -> bool:
        key = self.api_key or getattr(get_settings(), "gemini_api_key", "") or os.environ.get("GEMINI_API_KEY", "")
        return bool(key) or (self._test_override is not None)

    def identify_crop(self, image_bytes: bytes) -> dict[str, Any]:
        """Identify crop name and category from image bytes using Gemini Vision."""
        # 1. Check if test override is active
        if GeminiVisionService._test_override is not None:
            override_res = GeminiVisionService._test_override(image_bytes)
            return {
                "crop_name": override_res.get("crop_name", "Dragon Fruit"),
                "category": override_res.get("category", "Fruits"),
                "source": "gemini",
                "prediction_status": "COMPLETED",
                "metadata": {"model": "gemini-vision", "mode": "test_override"},
            }

        # 2. Check if API key is configured
        api_key = self.api_key or getattr(get_settings(), "gemini_api_key", "") or os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            logger.warning("GEMINI_API_KEY is not configured in backend environment.")
            return {
                "crop_name": None,
                "category": None,
                "source": "gemini",
                "prediction_status": "GEMINI_UNAVAILABLE",
                "metadata": {"reason": "GEMINI_API_KEY is not configured in environment."},
            }

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)

            prompt = (
                "You are an expert agricultural botanist. Identify the agricultural produce, fruit, "
                "or vegetable shown in this photo. Return a JSON object with exactly two keys: "
                '{"crop_name": "<Common English name, e.g. Dragon Fruit, Pineapple, Papaya, Chilli, Watermelon, Kiwi>", '
                '"category": "<Fruits or Vegetables>"}.'
            )

            # Determine mime type (default image/jpeg)
            mime_type = "image/jpeg"
            if image_bytes.startswith(b"\x89PNG"):
                mime_type = "image/png"

            # Resilient model tiering across models to handle free-tier quotas and availability
            models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-pro"]
            response = None
            last_err = None
            used_model = "gemini-2.5-flash"

            for m_name in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=m_name,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                            prompt,
                        ],
                        config=types.GenerateContentConfig(response_mime_type="application/json"),
                    )
                    if response and response.text:
                        used_model = m_name
                        break
                except Exception as m_err:
                    last_err = m_err
                    logger.warning("Gemini model %s encountered error (%s), trying fallback model", m_name, m_err)
                    import time
                    time.sleep(1.0)

            if response is None or not response.text:
                raise last_err or RuntimeError("Gemini failed to return text.")

            response_text = response.text.strip() if response.text else ""
            clean_text = re.sub(r"^```(?:json)?\s*", "", response_text)
            clean_text = re.sub(r"\s*```$", "", clean_text).strip()

            parsed = json.loads(clean_text)
            raw_crop = str(parsed.get("crop_name") or "").strip()
            raw_cat = str(parsed.get("category") or "").strip()

            crop_name = raw_crop.title()
            if not crop_name:
                raise ValueError("Empty crop_name returned from Gemini Vision.")

            # Standardize category
            cat_lower = raw_cat.lower()
            if "fruit" in cat_lower:
                category = "Fruits"
            elif "veg" in cat_lower:
                category = "Vegetables"
            elif "spice" in cat_lower:
                category = "Spices"
            elif "grain" in cat_lower or "cereal" in cat_lower:
                category = "Grains"
            elif "pulse" in cat_lower or "legume" in cat_lower:
                category = "Pulses"
            else:
                category = raw_cat.title() or "Produce"

            return {
                "crop_name": crop_name,
                "category": category,
                "source": "gemini",
                "prediction_status": "COMPLETED",
                "metadata": {"model": used_model, "raw_response": response_text},
            }

        except Exception as exc:
            logger.error("Gemini Vision inference failure: %s", exc)
            return {
                "crop_name": None,
                "category": None,
                "source": "gemini",
                "prediction_status": "GEMINI_FAILED",
                "metadata": {"reason": str(exc)},
            }

