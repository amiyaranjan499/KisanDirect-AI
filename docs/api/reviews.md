# Reviews API

- `POST /api/v1/reviews`: eligible consumer creates a review.
- `GET /api/v1/listings/{listing_id}/reviews`: list listing reviews.
- `GET /api/v1/farmers/{farmer_id}/reviews`: list farmer reviews.
- `GET /api/v1/reviews/{review_id}`: read an authorized review.
- `PATCH/DELETE /api/v1/reviews/{review_id}`: update or delete an owned review.
- `GET /api/v1/farmers/{farmer_id}/rating-summary`: read rating aggregates.

Ratings are constrained to 1-5 and review ownership/purchase eligibility are enforced by the backend.
