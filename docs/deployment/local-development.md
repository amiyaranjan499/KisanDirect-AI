# Local Development

Backend:

```powershell
.\venv\Scripts\python.exe -m backend.run
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

The default local API is `http://127.0.0.1:8000`; the Vite frontend normally runs at `http://localhost:5173`. Apply database migrations before starting the API. See [environment](environment.md) for configuration.
