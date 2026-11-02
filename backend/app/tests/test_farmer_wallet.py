import asyncio
import sys
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    AvailabilityStatus,
    Consumer,
    Crop,
    CropListing,
    Farmer,
    FarmerWithdrawal,
    Notification,
    Order,
    OrderItem,
    OrderStatus,
    User,
    UserRole,
)
from backend.app.models.base import Base

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role, Settings())
    return {"Authorization": f"Bearer {token}"}


async def seed_wallet_test_data():
    engine = build_engine(Settings())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        farmer_user = User(
            email=f"wallet-farmer-{uuid4()}@example.com",
            hashed_password=hash_password("Password123!"),
            role=UserRole.FARMER,
        )
        consumer_user = User(
            email=f"wallet-consumer-{uuid4()}@example.com",
            hashed_password=hash_password("Password123!"),
            role=UserRole.CONSUMER,
        )
        session.add_all([farmer_user, consumer_user])
        await session.flush()

        farmer_profile = Farmer(user_id=farmer_user.id, name="Wallet Test Farmer", phone="+919876543210")
        consumer_profile = Consumer(user_id=consumer_user.id, name="Wallet Consumer")
        session.add_all([farmer_profile, consumer_profile])
        await session.flush()

        crop = Crop(name=f"Wallet Crop {uuid4()}", category="Vegetables")
        session.add(crop)
        await session.flush()

        listing = CropListing(
            crop_id=crop.id,
            farmer_id=farmer_profile.id,
            quantity=Decimal("100"),
            unit="kg",
            asking_price=Decimal("50.00"),
            minimum_order_quantity=Decimal("1"),
            availability_status=AvailabilityStatus.AVAILABLE,
        )
        session.add(listing)
        await session.flush()

        order_one = Order(
            consumer_id=consumer_profile.id,
            total_amount=Decimal("500.00"),
            status=OrderStatus.DELIVERED,
        )
        order_two = Order(
            consumer_id=consumer_profile.id,
            total_amount=Decimal("300.00"),
            status=OrderStatus.CONFIRMED,
        )
        session.add_all([order_one, order_two])
        await session.flush()

        item_one = OrderItem(
            order_id=order_one.id,
            listing_id=listing.id,
            quantity=Decimal("10"),
            unit_price=Decimal("50.00"),
            subtotal=Decimal("500.00"),
        )
        item_two = OrderItem(
            order_id=order_two.id,
            listing_id=listing.id,
            quantity=Decimal("6"),
            unit_price=Decimal("50.00"),
            subtotal=Decimal("300.00"),
        )
        session.add_all([item_one, item_two])
        await session.commit()

        return farmer_user, consumer_user, farmer_profile, consumer_profile, crop, listing, order_one, order_two


async def cleanup_wallet_test_data(data):
    farmer_user, consumer_user, farmer_profile, consumer_profile, crop, listing, order_one, order_two = data
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await session.execute(delete(FarmerWithdrawal).where(FarmerWithdrawal.farmer_id == farmer_profile.id))
        await session.execute(delete(Notification).where(Notification.user_id.in_([farmer_user.id, consumer_user.id])))
        await session.execute(delete(OrderItem).where(OrderItem.order_id.in_([order_one.id, order_two.id])))
        await session.execute(delete(Order).where(Order.id.in_([order_one.id, order_two.id])))
        await session.execute(delete(CropListing).where(CropListing.id == listing.id))
        await session.execute(delete(Crop).where(Crop.id == crop.id))
        await session.execute(delete(Farmer).where(Farmer.id == farmer_profile.id))
        await session.execute(delete(Consumer).where(Consumer.id == consumer_profile.id))
        await session.execute(delete(User).where(User.id.in_([farmer_user.id, consumer_user.id])))
        await session.commit()
    await engine.dispose()


def test_farmer_wallet_and_withdrawals():
    data = asyncio.run(seed_wallet_test_data())
    farmer_user = data[0]
    app = create_app()
    client = TestClient(app)
    headers = auth_header(farmer_user)

    try:
        # 1. Get initial wallet balance (total earned = 500 + 300 = 800)
        res = client.get("/api/v1/farmers/wallet", headers=headers)
        assert res.status_code == 200, res.text
        wallet_info = res.json()
        assert Decimal(wallet_info["total_earned"]) == Decimal("800.00")
        assert Decimal(wallet_info["available_balance"]) == Decimal("800.00")
        assert Decimal(wallet_info["withdrawn_total"]) == Decimal("0.00")
        assert len(wallet_info["withdrawals"]) == 0

        # 2. Reject withdrawal exceeding balance
        fail_res = client.post(
            "/api/v1/farmers/wallet/withdraw",
            headers=headers,
            json={
                "amount": "1500.00",
                "payout_method": "BANK_TRANSFER",
                "account_holder_name": "Wallet Test Farmer",
                "account_number": "1234567890",
                "ifsc_code": "SBIN0001234",
            },
        )
        assert fail_res.status_code == 400
        assert "Insufficient available balance" in fail_res.json()["detail"]

        # 3. Reject invalid bank transfer without account number
        invalid_res = client.post(
            "/api/v1/farmers/wallet/withdraw",
            headers=headers,
            json={
                "amount": "200.00",
                "payout_method": "BANK_TRANSFER",
                "account_holder_name": "Wallet Test Farmer",
                "account_number": "",
                "ifsc_code": "SBIN0001234",
            },
        )
        assert invalid_res.status_code == 400

        # 4. Successful Bank Transfer withdrawal of ₹300
        payout_res = client.post(
            "/api/v1/farmers/wallet/withdraw",
            headers=headers,
            json={
                "amount": "300.00",
                "payout_method": "BANK_TRANSFER",
                "account_holder_name": "Wallet Test Farmer",
                "account_number": "987654321098",
                "ifsc_code": "HDFC0001234",
                "bank_name": "HDFC Bank",
                "note": "First payout",
            },
        )
        assert payout_res.status_code == 201, payout_res.text
        payout_data = payout_res.json()
        assert Decimal(payout_data["amount"]) == Decimal("300.00")
        assert payout_data["payout_method"] == "BANK_TRANSFER"
        assert payout_data["status"] == "COMPLETED"
        assert payout_data["reference_id"].startswith("PAY-")

        # 5. Successful UPI withdrawal of ₹200
        upi_res = client.post(
            "/api/v1/farmers/wallet/withdraw",
            headers=headers,
            json={
                "amount": "200.00",
                "payout_method": "UPI",
                "account_holder_name": "Wallet Test Farmer",
                "upi_id": "farmer@okhdfcbank",
            },
        )
        assert upi_res.status_code == 201, upi_res.text
        upi_data = upi_res.json()
        assert Decimal(upi_data["amount"]) == Decimal("200.00")
        assert upi_data["payout_method"] == "UPI"
        assert upi_data["status"] == "COMPLETED"

        # 6. Verify updated wallet balance (800 - 300 - 200 = 300 available)
        updated_res = client.get("/api/v1/farmers/wallet", headers=headers)
        assert updated_res.status_code == 200
        updated_data = updated_res.json()
        assert Decimal(updated_data["total_earned"]) == Decimal("800.00")
        assert Decimal(updated_data["withdrawn_total"]) == Decimal("500.00")
        assert Decimal(updated_data["available_balance"]) == Decimal("300.00")
        assert len(updated_data["withdrawals"]) == 2
    finally:
        asyncio.run(cleanup_wallet_test_data(data))
