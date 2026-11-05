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
        settings = get_settings()
        self.api_key = api_key or getattr(settings, "gemini_api_key", "") or os.environ.get("GEMINI_API_KEY", "")

    @classmethod
    def set_test_override(cls, handler: Callable[[bytes], dict[str, str]] | None) -> None:
        """Allow test suites to inject deterministic fallback responses."""
        cls._test_override = handler

    def is_available(self) -> bool:
        return bool(self.api_key) or (self._test_override is not None)

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
        if not self.api_key:
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

            client = genai.Client(api_key=self.api_key)

            prompt = (
                "You are an expert agricultural botanist. Identify the agricultural produce, fruit, "
                "or vegetable shown in this photo. Return a JSON object with exactly two keys: "
                '{"crop_name": "<Common English name, e.g. Dragon Fruit, Pineapple, Kiwi, Fig>", '
                '"category": "<Fruits or Vegetables>"}. '
                "Return ONLY valid JSON without markdown fences."
            )

            # Determine mime type (default image/jpeg)
            mime_type = "image/jpeg"
            if image_bytes.startswith(b"\x89PNG"):
                mime_type = "image/png"

            # Try primary model with fallback to secondary if high demand (503/429) occurs
            models_to_try = ["gemini-3.5-flash", "gemini-2.5-flash"]
            response = None
            last_err = None

            for m_name in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=m_name,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                            prompt,
                        ],
                    )
                    if response and response.text:
                        break
                except Exception as m_err:
                    last_err = m_err
                    logger.warning("Gemini model %s encountered error (%s), trying fallback model", m_name, m_err)
                    import time
                    time.sleep(1.0)

            if response is None or not response.text:
                raise last_err or RuntimeError("Gemini failed to return text.")

            response_text = response.text.strip() if response.text else ""
            # Strip markdown code blocks if present
            clean_text = re.sub(r"^```(?:json)?\s*", "", response_text)
            clean_text = re.sub(r"\s*```$", "", clean_text).strip()

            parsed = json.loads(clean_text)
            crop_name = parsed.get("crop_name", "").strip().title()
            category = parsed.get("category", "Fruits").strip().title()

            if not crop_name:
                raise ValueError("Empty crop_name returned from Gemini Vision.")

            return {
                "crop_name": crop_name,
                "category": category,
                "source": "gemini",
                "prediction_status": "COMPLETED",
                "metadata": {"model": "gemini-2.5-flash", "raw_response": response_text},
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

