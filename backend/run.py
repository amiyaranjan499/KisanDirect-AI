import uvicorn

from backend.app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "backend.app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        loop="backend.uvicorn_loop:selector_loop_factory",
        reload=settings.app_env == "development",
    )