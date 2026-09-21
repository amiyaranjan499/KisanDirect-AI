# Limitations

The following limitations describe the current implementation honestly:

- Payments use the deterministic `TEST_SANDBOX` flow only. There is no real payment gateway, banking, card, CVV, UPI, or wallet integration.
- Crop quality and fair-price inference return `MODEL_UNAVAILABLE` when no trained model artifact is configured.
- No model accuracy, training metrics, or production dataset performance is available.
- The application is configured for local development and has no documented production deployment infrastructure.
- The frontend does not include a separate automated browser test suite.
- The API uses local environment configuration for PostgreSQL/PostGIS and JWT secrets.
- Delivery tracking is represented by fulfillment states and optional scheduled data; it is not a live carrier tracking system.
- The current UI uses role-aware application view state rather than a dedicated routing library.
- Production operational controls such as rate limiting, centralized logging, monitoring, and external identity management are outside the current scope.
