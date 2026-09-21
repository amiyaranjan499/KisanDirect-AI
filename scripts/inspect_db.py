import asyncio
from backend.app.core.config import Settings
from backend.app.database.session import build_engine
from sqlalchemy import text

async def main():
    engine = build_engine(Settings())
    async with engine.connect() as conn:
        for table in ['users','consumers','farmers','crops','crop_listings','orders','order_items','reviews','payments','deliveries']:
            res = await conn.execute(text(f'SELECT COUNT(*) FROM {table}'))
            print(table, res.scalar_one())
        query = text("SELECT email FROM users WHERE email LIKE '%reviews-%' OR email LIKE '%consumer-%' OR email LIKE '%farmer-consumer-test-%' OR email LIKE '%orders-%' OR email LIKE '%fulfillment-%'")
        res = await conn.execute(query)
        rows = res.fetchall()
        print('matching users', rows)
    await engine.dispose()

asyncio.run(main())
