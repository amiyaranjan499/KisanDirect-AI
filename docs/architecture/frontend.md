# Frontend Architecture

The frontend is a React/Vite application entered through `frontend/src/main.jsx`. The main application view is coordinated by `frontend/src/app/App.jsx`, with role-aware view state for authentication, marketplace, dashboards, profiles, nearby farmers, cart/orders, notifications, reviews, and admin views.

`frontend/src/lib/api/client.js` centralizes fetch calls, bearer headers, JSON handling, and multipart requests. `frontend/src/i18n` provides the shared language context, state recommendations, translations, persistence, and English fallback. Leaflet and React Leaflet support nearby-farmer maps. CSS is centralized in `frontend/src/styles.css`.
