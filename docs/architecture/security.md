# Security Architecture

JWT bearer authentication is decoded by shared FastAPI dependencies. Role dependencies separate FARMER, CONSUMER, and ADMIN operations. Services and repositories derive ownership from the authenticated user ID for profiles, carts, orders, payments, notifications, reviews, listings, and AI records.

Passwords are hashed with Argon2 through `pwdlib`. Request schemas and database constraints validate inputs. CORS is restricted to configured local development origins. Secrets remain in environment files and are not embedded in source or documentation.
