import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from backend.app.models import Hub


async def remove_lifecycle_hub() -> None:
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        async with session.begin_nested():
            result = await session.execute(
                select(Hub).where(Hub.name == "Lifecycle Hub", Hub.farmer_id.is_(None))
            )
            fake_hub = result.scalar_one_or_none()
            if fake_hub:
                print(f"Confirmed fake Lifecycle Hub found: ID={fake_hub.id}, Name={fake_hub.name}")
                await session.delete(fake_hub)
                await session.flush()
                print("Successfully removed fake Lifecycle Hub.")
            else:
                print("No fake Lifecycle Hub found in database.")
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(remove_lifecycle_hub())
