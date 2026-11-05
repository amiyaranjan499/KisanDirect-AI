import asyncio

from sqlalchemy import text

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from backend.app.models.domain import Base


async def clean():
    settings = Settings()
    test_db_url = settings.test_database_url
    print(f"Cleaning test database: {test_db_url}")
    engine = build_engine(Settings(database_url=test_db_url))
    async with engine.begin() as conn:
        table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
        for t in table_names:
            try:
                await conn.execute(text(f"TRUNCATE TABLE {t} CASCADE;"))
            except Exception as e:
                print(f"Skip {t}: {e}")
    await engine.dispose()
    print("Test database cleaned successfully.")

if __name__ == "__main__":
    asyncio.run(clean())
