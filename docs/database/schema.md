# Database Schema

The ORM defines these tables:

- `users`, `farmers`, `consumers`, `admins`
- `crops`, `crop_listings`, `crop_images`
- `carts`, `cart_items`
- `orders`, `order_items`, `payments`, `deliveries`
- `reviews`, `notifications`
- `ai_quality_predictions`, `ai_price_predictions`
- `hubs`, `hub_staff`, `hub_stock`, `hub_stock_deliveries`
- `riders`, `rider_locations`, `rider_offers`, `shipments`, `delivery_slots`, `stock_reservations`, `order_events`
- `admin_audit_events`

Users have optional one-to-one role profiles. Farmers own listings; listings connect to images, carts, orders, reviews, and AI records. Consumers own carts, orders, and reviews. Orders contain order items and can have one payment and one delivery. Delivery records can retain structured fulfillment/delivery snapshot fields. Foreign keys, unique constraints, check constraints, and indexes are defined in the SQLAlchemy models and migrations.

`admin_audit_events` records authenticated admin actions on users, riders, hubs, and hub-staff assignments. Order and shipment changes remain in the lifecycle `order_events` stream.
