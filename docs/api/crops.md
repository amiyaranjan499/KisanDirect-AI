# Crop and Listing API

Crop listings are farmer-owned resources managed through:

- `GET/POST /api/v1/farmers/me/listings`
- `PATCH/DELETE /api/v1/farmers/me/listings/{listing_id}`
- `POST /api/v1/farmers/me/listings/{listing_id}/images`

Listing validation requires positive quantity and non-negative asking price. Image uploads accept validated JPEG, PNG, and WebP content. Availability is represented by the existing database status values.
