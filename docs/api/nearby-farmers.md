# Nearby Farmer Search API

## Endpoint

`GET /api/v1/marketplace/farmers/nearby`

This consumer-authenticated endpoint accepts `latitude`, `longitude`, `radius_km`, `page`, and `page_size`. It returns farmers with at least one active listing and a non-null PostGIS geography location.

Distances are calculated in kilometers with PostGIS `ST_Distance` and radius filtering uses `ST_DWithin`. Results are ordered nearest-first. Farmers without valid locations are excluded, and ratings remain null when no review data exists.

Each result includes the farmer ID/name, public location, actual distance, optional rating, active listing count, and active listing summaries. No private phone, address, credentials, or fabricated distance/rating values are returned.
