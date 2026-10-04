from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.app.core.config import Settings


@lru_cache(maxsize=1)
def _cached_engine(database_url: str, app_env: str):

    kwargs = {"pool_pre_ping": True}
    if app_env.lower() == "test":
        kwargs["poolclass"] = NullPool
    return create_async_engine(database_url, **kwargs)


def build_engine(settings: Settings):
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required for database-backed operations")
    return _cached_engine(settings.database_url, settings.app_env)


@lru_cache(maxsize=1)
def _cached_session_factory(database_url: str, app_env: str) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(_cached_engine(database_url, app_env), expire_on_commit=False)


def build_session_factory(settings: Settings) -> async_sessionmaker[AsyncSession]:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required for database-backed operations")
    return _cached_session_factory(settings.database_url, settings.app_env)


async def dispose_engine(settings: Settings) -> None:
    if settings.database_url:
        await _cached_engine(settings.database_url, settings.app_env).dispose()


async def get_db_session() -> AsyncIterator[AsyncSession]:
    from backend.app.core.config import get_settings

    session_factory = build_session_factory(get_settings())
    async with session_factory() as session:
        try:
            yield session
        except BaseException:
            await session.rollback()
            raise
        else:
            await session.commit()
