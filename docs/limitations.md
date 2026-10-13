# Limitations

The following limitations describe the current implementation honestly:

- Payments use the deterministic `TEST_SANDBOX` flow only. There is no real payment gateway, banking, card, CVV, UPI, or wallet integration.
- Crop quality and fair-price inference return `MODEL_UNAVAILABLE` when no trained model artifact is configured.
- No model accuracy, training metrics, or production dataset performance is available.
- The application is configured for local development and has no documented production deployment infrastructure.
- The frontend does not include a separate automated browser test suite.
- The API uses local environment configuration for PostgreSQL/PostGIS and JWT secrets.
- Delivery tracking uses browser Geolocation API updates from online/active riders polled at 7s intervals with 30s staleness thresholds; it is not an external third-party telematics or carrier integration.
- In-app delivery OTP is rendered for the authenticated consumer in-app and in notifications; no cellular SMS gateway is configured.
- Production operational controls such as multi-instance distributed rate limiting, centralized logging, APM monitoring, and external identity management are outside the current scope.
