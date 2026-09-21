# Cart and Orders API

## Cart

- `GET /api/v1/cart`
- `POST /api/v1/cart/items`
- `PATCH /api/v1/cart/items/{item_id}`
- `DELETE /api/v1/cart/items/{item_id}`
- `DELETE /api/v1/cart`

Cart operations derive ownership from the authenticated consumer. Listing availability, stock, minimum order quantity, and current price are read from PostgreSQL. Client totals are never trusted.

## Orders

- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/farmer/orders`
- `GET /api/v1/orders/{order_id}`
- `PATCH /api/v1/orders/{order_id}/status`

Checkout locks the cart and listing rows in an async SQLAlchemy transaction, validates stock again, stores the database price and item subtotal, decrements stock, marks sold-out listings, creates order items, and clears the cart atomically. A failed checkout rolls back all changes.

Consumers can view and cancel their own orders. Farmers can view orders containing their listings and confirm or complete those orders. Payment, delivery, reviews, and notifications are outside Step 11.
