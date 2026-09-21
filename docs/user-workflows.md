# User Workflows

## Farmer Workflow

1. Register with the FARMER role.
2. Log in and receive a JWT.
3. Open the farmer profile and update supported profile fields.
4. Create and manage crop listings.
5. Upload listing images and request AI quality or fair-price predictions.
6. Publish available listings to the consumer marketplace.
7. View orders containing the farmer's listings.
8. Confirm or complete order status where permitted.
9. Select and manage delivery or farmer-pickup fulfillment status.
10. Receive event notifications and review information.
11. View dashboard summaries, listing data, order analytics, reviews, and AI records.

All farmer-owned operations use the authenticated JWT user and service-level ownership checks.

## Consumer Workflow

1. Register with the CONSUMER role.
2. Log in and receive a JWT.
3. Browse marketplace listings and apply search, filters, sorting, and pagination.
4. Search nearby farmers with coordinates and radius.
5. Open crop and farmer details.
6. Add a real listing to the cart and adjust quantities.
7. Check out; the server revalidates stock and calculates totals.
8. Run the TEST_SANDBOX payment flow.
9. Choose DELIVERY or FARMER_PICKUP fulfillment.
10. Track order, payment, and fulfillment state.
11. Submit an eligible review after order completion/delivery.
12. Read and manage notifications.
13. View consumer dashboard summaries, purchases, reviews, cart summary, and notifications.

## Admin Workflow

1. Authenticate as an ADMIN user.
2. Open the admin dashboard.
3. Review users, farmers, consumers, listings, orders, payments, reviews, notifications, and categories.
4. Update user active status through the admin management endpoint.
5. Review live dashboard values sourced from the database.

Admin routes are protected by role-based dependencies.

## AI Workflow

A farmer selects an owned listing and submits an image or price query. The API validates ownership and input, calls the current inference boundary, persists the prediction record, and returns its status. When no trained model artifact is configured, the response honestly reports `MODEL_UNAVAILABLE` rather than fabricating a result.
