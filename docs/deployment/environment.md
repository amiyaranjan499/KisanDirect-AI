# Environment

Backend configuration is defined by `backend/.env.example`. Local `backend/.env` should provide:

- `APP_ENV`
- `API_HOST`
- `API_PORT`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `CORS_ORIGINS`

The frontend template is `frontend/.env.example` and supports `VITE_API_BASE_URL`. Do not commit `.env` files or place credentials, tokens, or API keys in documentation or source code.
