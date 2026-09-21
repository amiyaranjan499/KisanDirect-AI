# Fair-Price Recommendation

The price service records crop/listing feature metadata such as crop name, category, quantity, unit, optional quality grade, and harvest date where available. The inference boundary identifies a future `RandomForestRegressor` architecture.

Current behavior:

- `prediction_status`: `MODEL_UNAVAILABLE`
- `predicted_price`: `null`
- `confidence`: `null`
- currency metadata: `INR`

No historical market dataset, trained artifact, accuracy, or performance metric is claimed. API routes are documented in [../api/api-reference.md](../api/api-reference.md).
