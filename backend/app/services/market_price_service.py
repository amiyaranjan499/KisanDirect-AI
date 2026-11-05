from __future__ import annotations

import json
import logging
import os
from decimal import Decimal
from pathlib import Path
from typing import Any

from backend.app.schemas.market_price import MarketPriceResponse

logger = logging.getLogger(__name__)

DEFAULT_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "apmc_mandi_rates.json"


class MarketPriceService:
    """Service providing verified APMC mandi market pricing for crops."""

    def __init__(self, data_path: Path | None = None) -> None:
        self.data_path = data_path or DEFAULT_DATA_PATH
        self._records: list[dict[str, Any]] = []
        self._source_name: str = "Agmarknet APMC Mandi Network"
        self._load_records()

    def _load_records(self) -> None:
        if not self.data_path.exists():
            logger.warning("APMC mandi dataset not found at %s", self.data_path)
            return

        try:
            with open(self.data_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self._source_name = data.get("source", self._source_name)
                self._records = data.get("records", [])
        except Exception as exc:
            logger.error("Failed loading APMC mandi dataset: %s", exc)
            self._records = []

    @staticmethod
    def _calculate_trend(modal: float, min_p: float, max_p: float, explicit_trend: str | None = None) -> str:
        if explicit_trend in {"Rising", "Stable", "Falling"}:
            return explicit_trend
        spread = max_p - min_p
        if spread > 0:
            ratio = (modal - min_p) / spread
            if ratio >= 0.60:
                return "Rising"
            if ratio <= 0.40:
                return "Falling"
        return "Stable"

    def get_market_price(
        self,
        crop_name: str,
        state: str | None = None,
        district: str | None = None,
    ) -> MarketPriceResponse:
        norm_crop = crop_name.strip().lower()

        # Handle variations/common aliases
        alias_map = {
            "potatoes": "potato",
            "potao": "potato",
            "tomatoes": "tomato",
            "onions": "onion",
            "apples": "apple",
            "mangoes": "mango",
            "papayas": "papaya",
            "bananas": "banana",
            "carrots": "carrot",
            "eggplant": "brinjal",
            "eggplants": "brinjal",
            "brinjals": "brinjal",
            "cabbages": "cabbage",
            "oranges": "orange",
            "dragonfruit": "dragon fruit",
        }
        lookup_commodity = alias_map.get(norm_crop, norm_crop)

        # Filter by commodity
        matching = [
            r for r in self._records
            if r.get("commodity", "").lower() == lookup_commodity
        ]

        if not matching:
            # Check if any record's commodity is a substring or vice versa
            matching = [
                r for r in self._records
                if lookup_commodity in r.get("commodity", "").lower() or r.get("commodity", "").lower() in lookup_commodity
            ]

        if not matching:
            return MarketPriceResponse(
                commodity=lookup_commodity,
                commodity_display=crop_name.capitalize(),
                market_source=self._source_name,
                status="UNSUPPORTED_CROP",
                price_trend="Stable",
                message=f"No verified APMC mandi records found for crop '{crop_name}'.",
            )

        # Match location hierarchy:
        # 1. District + State match
        # 2. District match
        # 3. State match
        # 4. Regional APMC benchmark
        selected = None
        norm_district = district.strip().lower() if district else None
        norm_state = state.strip().lower() if state else None

        if norm_district and norm_state:
            for r in matching:
                if norm_district in r.get("district", "").lower() and norm_state in r.get("state", "").lower():
                    selected = r
                    break

        if selected is None and norm_district:
            for r in matching:
                if norm_district in r.get("district", "").lower():
                    selected = r
                    break

        if selected is None and norm_state:
            for r in matching:
                if norm_state in r.get("state", "").lower():
                    selected = r
                    break

        if selected is None:
            selected = matching[0]

        market_name = selected.get("market") or f"{selected.get('district', 'Regional')} Mandi"
        m_source = f"Agmarknet APMC ({market_name})"

        modal_val = float(selected.get("modal_price", 0))
        min_val = float(selected.get("min_price", 0))
        max_val = float(selected.get("max_price", 0))

        trend = self._calculate_trend(modal_val, min_val, max_val, selected.get("price_trend"))

        return MarketPriceResponse(
            commodity=selected.get("commodity", lookup_commodity),
            commodity_display=selected.get("commodity_display", lookup_commodity.capitalize()),
            state=selected.get("state"),
            district=selected.get("district"),
            market_name=market_name,
            market_price=Decimal(str(modal_val)),
            min_price=Decimal(str(min_val)),
            max_price=Decimal(str(max_val)),
            price_trend=trend,
            market_source=m_source,
            market_timestamp=selected.get("timestamp"),
            currency="INR",
            unit="kg",
            status="COMPLETED",
            message=None,
        )
