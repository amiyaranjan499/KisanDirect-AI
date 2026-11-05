import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token
from backend.app.database.session import build_engine
from backend.app.main import create_app
from backend.app.models import (
    AdminAuditEvent,
    Order,
    OrderEvent,
    OrderStatus,
    Rider,
    RiderApprovalStatus,
    Shipment,
    ShipmentStatus,
    UserRole,
)
from backend.app.tests.test_order_lifecycle import cleanup, seed
from backend.app.tests.test_rider_module import prepare_ready_shipment

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def auth_header(user_id, role):
    token = create_access_token(str(user_id), role, Settings())
    return {"Authorization": f"Bearer {token}"}


def test_rider_approval_audit_and_suspension_gate_admin_hub_operations():
    data = seed()
    target_rider_id = data["rider_id"]
    data["extra_user_ids"] = []
    data["extra_hub_ids"] = []
    data["extra_order_ids"] = []
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def make_pending():
        async with factory() as session:
            await session.execute(
                update(Rider)
                .where(Rider.id == target_rider_id)
                .values(approval_status=RiderApprovalStatus.PENDING_APPROVAL)
            )
            await session.commit()

    asyncio.run(make_pending())
    asyncio.run(engine.dispose())

    try:
        with TestClient(create_app()) as client:
            admin_headers = auth_header(data["admin_user_id"], UserRole.ADMIN)
            non_admin_roles = (
                (data["farmer_user_id"], UserRole.FARMER),
                (data["consumer_user_id"], UserRole.CONSUMER),
                (data["hub_staff_user_id"], UserRole.HUB_STAFF),
                (data["rider_user_id"], UserRole.RIDER),
            )
            for user_id, role in non_admin_roles:
                assert client.get("/api/v1/admins/riders", headers=auth_header(user_id, role)).status_code == 403
                assert client.get("/api/v1/admins/hubs", headers=auth_header(user_id, role)).status_code == 403
                assert client.patch(
                    f"/api/v1/admins/riders/{target_rider_id}/approval",
                    headers=auth_header(user_id, role),
                    json={"approval_status": "APPROVED"},
                ).status_code == 403
                assert client.post(
                    "/api/v1/admins/hubs",
                    headers=auth_header(user_id, role),
                    json={
                        "name": "Forbidden hub",
                        "address": "1 Test Road",
                        "pincode": "751001",
                        "service_radius_km": "8.00",
                        "latitude": 20.3,
                        "longitude": 85.8,
                    },
                ).status_code == 403
                assert client.post(
                    "/api/v1/admins/hub-staff",
                    headers=auth_header(user_id, role),
                    json={
                        "email": "forbidden@example.com",
                        "initial_password": "Initial-passphrase-123",
                        "hub_id": str(data["hub_id"]),
                    },
                ).status_code == 403
                assert client.post(
                    "/api/v1/admins/hub-staff/assignments",
                    headers=auth_header(user_id, role),
                    json={
                        "user_id": str(data["hub_staff_user_id"]),
                        "hub_id": str(data["hub_id"]),
                    },
                ).status_code == 403
                assert client.delete(
                    f"/api/v1/admins/hub-staff/{data['hub_staff_user_id']}/assignments/{data['hub_id']}",
                    headers=auth_header(user_id, role),
                ).status_code == 403
                shipment_id = uuid4()
                assert client.post(
                    f"/api/v1/admins/shipments/{shipment_id}/reassign",
                    headers=auth_header(user_id, role),
                    json={"rider_user_id": str(data["other_rider_user_id"]), "reason": "Not allowed"},
                ).status_code == 403
                assert client.post(
                    f"/api/v1/admins/shipments/{shipment_id}/cancel",
                    headers=auth_header(user_id, role),
                    json={"reason": "Not allowed"},
                ).status_code == 403
                assert client.post(
                    f"/api/v1/admins/shipments/{shipment_id}/otp-reset",
                    headers=auth_header(user_id, role),
                    json={"reason": "Not allowed"},
                ).status_code == 403

            approved = client.patch(
                f"/api/v1/admins/riders/{target_rider_id}/approval",
                headers=admin_headers,
                json={"approval_status": "APPROVED", "reason": "Documents checked"},
            )
            assert approved.status_code == 200, approved.text
            assert approved.json()["approval_status"] == "APPROVED"

            suspended = client.patch(
                f"/api/v1/admins/riders/{target_rider_id}/approval",
                headers=admin_headers,
                json={"approval_status": "SUSPENDED", "reason": "Policy review"},
            )
            assert suspended.status_code == 200, suspended.text
            assert suspended.json()["availability"] == "OFFLINE"
            cannot_go_online = client.patch(
                "/api/v1/rider/availability",
                headers=auth_header(data["rider_user_id"], UserRole.RIDER),
                json={"online": True},
            )
            assert cannot_go_online.status_code in {403, 409}, cannot_go_online.text

            created_hub = client.post(
                "/api/v1/admins/hubs",
                headers=admin_headers,
                json={
                    "name": f"Admin Ops Hub {uuid4()}",
                    "address": "1 Test Hub Road",
                    "pincode": "751001",
                    "service_radius_km": "8.00",
                    "status": "ACTIVE",
                    "latitude": 20.3,
                    "longitude": 85.8,
                },
            )
            assert created_hub.status_code == 201, created_hub.text
            hub_id = created_hub.json()["id"]
            data["extra_hub_ids"].append(UUID(hub_id))

            created_staff = client.post(
                "/api/v1/admins/hub-staff",
                headers=admin_headers,
                json={
                    "email": f"admin-created-staff-{uuid4()}@example.com",
                    "initial_password": "Initial-passphrase-123",
                    "hub_id": hub_id,
                },
            )
            assert created_staff.status_code == 201, created_staff.text
            data["extra_user_ids"].append(UUID(created_staff.json()["user_id"]))

        async def verify_audit():
            async with factory() as session:
                actions = list(
                    (
                        await session.scalars(
                            select(AdminAuditEvent.action).where(
                                AdminAuditEvent.actor_user_id == data["admin_user_id"]
                            )
                        )
                    ).all()
                )
                assert "RIDER_APPROVED" in actions
                assert "RIDER_SUSPENDED" in actions
                assert "HUB_CREATED" in actions
                assert "HUB_STAFF_CREATED_AND_ASSIGNED" in actions

        asyncio.run(verify_audit())
    finally:
        cleanup(data)


def test_reassign_rejects_delivered_shipment():
    data = seed()
    data["extra_user_ids"] = []
    data["extra_hub_ids"] = []
    data["extra_order_ids"] = []
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def create_delivered_shipment():
        async with factory() as session:
            shipment = Shipment(
                order_id=data["order_id"],
                hub_id=data["hub_id"],
                rider_id=data["rider_id"],
                status=ShipmentStatus.DELIVERED,
                promised_window_start=datetime.now(timezone.utc),
                promised_window_end=datetime.now(timezone.utc) + timedelta(hours=1),
                pickup_address_snapshot="1 Hub Road",
                dropoff_address_snapshot="2 Consumer Road",
            )
            session.add(shipment)
            await session.commit()
            return shipment.id

    shipment_id = asyncio.run(create_delivered_shipment())
    asyncio.run(engine.dispose())
    try:
        with TestClient(create_app()) as client:
            response = client.post(
                f"/api/v1/admins/shipments/{shipment_id}/reassign",
                headers=auth_header(data["admin_user_id"], UserRole.ADMIN),
                json={
                    "rider_user_id": str(data["other_rider_user_id"]),
                    "reason": "Attempt terminal reassignment",
                },
            )
            assert response.status_code == 409, response.text
    finally:
        cleanup(data)


def test_admin_reassign_and_cancel_use_lifecycle_audit_events():
    data = seed()
    data["extra_user_ids"] = []
    data["extra_hub_ids"] = []
    data["extra_order_ids"] = []
    ready = prepare_ready_shipment(data)
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        with TestClient(create_app()) as client:
            admin_headers = auth_header(data["admin_user_id"], UserRole.ADMIN)
            reassigned = client.post(
                f"/api/v1/admins/shipments/{ready['shipment_id']}/reassign",
                headers=admin_headers,
                json={
                    "rider_user_id": str(ready["other_rider_user_id"]),
                    "reason": "Dispatch coverage adjustment",
                },
            )
            assert reassigned.status_code == 200, reassigned.text
            assert reassigned.json()["status"] == ShipmentStatus.RIDER_ASSIGNED.value
            assert reassigned.json()["rider_id"] == str(ready["other_rider_id"])

            cancelled = client.post(
                f"/api/v1/admins/shipments/{ready['shipment_id']}/cancel",
                headers=admin_headers,
                json={"reason": "Customer cancellation request"},
            )
            assert cancelled.status_code == 200, cancelled.text
            assert cancelled.json()["status"] == ShipmentStatus.CANCELLED.value

        async def verify_events():
            async with factory() as session:
                events = list(
                    (
                        await session.scalars(
                            select(OrderEvent).where(
                                OrderEvent.shipment_id == ready["shipment_id"],
                                OrderEvent.actor_user_id == data["admin_user_id"],
                            )
                        )
                    ).all()
                )
                assert any(event.to_status == ShipmentStatus.RIDER_ASSIGNED.value for event in events)
                assert any(event.to_status == ShipmentStatus.CANCELLED.value for event in events)

        asyncio.run(verify_events())
    finally:
        asyncio.run(engine.dispose())
        cleanup(data)


def test_delivery_analytics_metrics_are_filtered_by_selected_range():
    data = seed()
    data["extra_user_ids"] = []
    data["extra_hub_ids"] = []
    data["extra_order_ids"] = []
    now = datetime.now(timezone.utc)
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)
    with TestClient(create_app()) as client:
        baseline_short_response = client.get(
            "/api/v1/admins/analytics",
            params={"range": "7d"},
            headers=auth_header(data["admin_user_id"], UserRole.ADMIN),
        )
        baseline_long_response = client.get(
            "/api/v1/admins/analytics",
            params={"range": "90d"},
            headers=auth_header(data["admin_user_id"], UserRole.ADMIN),
        )
        assert baseline_short_response.status_code == 200, baseline_short_response.text
        assert baseline_long_response.status_code == 200, baseline_long_response.text
        baseline_short = baseline_short_response.json()
        baseline_long = baseline_long_response.json()

    async def add_delivery_events():
        async with factory() as session:
            orders = [
                Order(
                    consumer_id=data["consumer_id"],
                    status=OrderStatus.DELIVERED,
                    total_amount=Decimal("0.00"),
                    created_at=now - timedelta(days=20),
                ),
                Order(
                    consumer_id=data["consumer_id"],
                    status=OrderStatus.DELIVERED,
                    total_amount=Decimal("0.00"),
                    created_at=now - timedelta(days=2),
                ),
            ]
            session.add_all(orders)
            await session.flush()
            data["extra_order_ids"].extend(order.id for order in orders)
            old_placed = now - timedelta(days=20)
            recent_placed = now - timedelta(days=2)
            session.add_all(
                [
                    OrderEvent(order_id=orders[0].id, from_status=None, to_status="PENDING", created_at=old_placed),
                    OrderEvent(order_id=orders[0].id, from_status="OUT_FOR_DELIVERY", to_status="DELIVERED", created_at=old_placed + timedelta(minutes=120)),
                    OrderEvent(order_id=orders[0].id, from_status="OUT_FOR_DELIVERY", to_status="FAILED_DELIVERY", created_at=old_placed + timedelta(minutes=60)),
                    OrderEvent(order_id=orders[1].id, from_status=None, to_status="PENDING", created_at=recent_placed),
                    OrderEvent(order_id=orders[1].id, from_status="OUT_FOR_DELIVERY", to_status="DELIVERED", created_at=recent_placed + timedelta(minutes=60)),
                    OrderEvent(order_id=orders[1].id, from_status="OUT_FOR_DELIVERY", to_status="FAILED_DELIVERY", created_at=recent_placed + timedelta(minutes=30)),
                ]
            )
            await session.commit()

    asyncio.run(add_delivery_events())
    asyncio.run(engine.dispose())
    try:
        with TestClient(create_app()) as client:
            short = client.get(
                "/api/v1/admins/analytics",
                params={"range": "7d"},
                headers=auth_header(data["admin_user_id"], UserRole.ADMIN),
            )
            long = client.get(
                "/api/v1/admins/analytics",
                params={"range": "90d"},
                headers=auth_header(data["admin_user_id"], UserRole.ADMIN),
            )
            assert short.status_code == 200, short.text
            assert long.status_code == 200, long.text
            assert short.json()["failed_deliveries"] == baseline_short["failed_deliveries"] + 1
            assert long.json()["failed_deliveries"] == baseline_long["failed_deliveries"] + 2
            assert short.json()["average_placed_to_delivered_minutes"] is not None
            assert long.json()["average_placed_to_delivered_minutes"] is not None
            assert short.json()["average_placed_to_delivered_minutes"] != long.json()["average_placed_to_delivered_minutes"]
    finally:
        cleanup(data)


def test_admin_phase7_comprehensive_operations_and_edge_cases():
    data = seed(OrderStatus.CONFIRMED)
    data["extra_user_ids"] = []
    data["extra_hub_ids"] = []
    data["extra_order_ids"] = []
    engine = build_engine(Settings())
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def seed_deliveries_and_locked_shipment():
        from backend.app.models import HubStock, HubStockDelivery
        from backend.app.tests.test_order_lifecycle import (
            _create_out_for_delivery_shipment,
            _get_delivery_otp_notifications,
        )

        settings = Settings(otp_ttl_minutes=120, otp_max_attempts=2)
        async with factory() as session:
            session.add(
                HubStock(
                    hub_id=data["hub_id"],
                    listing_id=data["listing_id"],
                    available_quantity=Decimal("18.000"),
                )
            )
            # Add 6 farmer stock deliveries for hub to verify recent_deliveries caps at 5
            for idx in range(6):
                session.add(
                    HubStockDelivery(
                        hub_id=data["hub_id"],
                        listing_id=data["listing_id"],
                        farmer_user_id=data["farmer_user_id"],
                        quantity=Decimal("3.000"),
                        status="RECEIVED" if idx % 2 == 0 else "PENDING",
                    )
                )
            await session.flush()
            shipment = await _create_out_for_delivery_shipment(session, data, settings)
            notifications = await _get_delivery_otp_notifications(
                session, shipment.id, data["consumer_user_id"]
            )
            first_code = notifications[0].message.rsplit(" ", 1)[1].rstrip(".")
            await session.commit()
            return shipment.id, first_code

    shipment_id, first_code = asyncio.run(seed_deliveries_and_locked_shipment())
    asyncio.run(engine.dispose())

    try:
        with TestClient(create_app()) as client:
            admin_headers = auth_header(data["admin_user_id"], UserRole.ADMIN)

            # 1. Rider suspension blocked while rider has an active shipment, and invalid transition blocked
            suspend_active = client.patch(
                f"/api/v1/admins/riders/{data['rider_id']}/approval",
                headers=admin_headers,
                json={"approval_status": "SUSPENDED", "reason": "Try suspend active rider"},
            )
            assert suspend_active.status_code == 409
            assert "active shipments" in suspend_active.json()["detail"]

            repeat_approve = client.patch(
                f"/api/v1/admins/riders/{data['rider_id']}/approval",
                headers=admin_headers,
                json={"approval_status": "APPROVED"},
            )
            assert repeat_approve.status_code == 409

            missing_rider = client.patch(
                f"/api/v1/admins/riders/{uuid4()}/approval",
                headers=admin_headers,
                json={"approval_status": "APPROVED"},
            )
            assert missing_rider.status_code == 404

            # 2. Hub list shows stock and caps recent_deliveries at 5
            hubs_resp = client.get("/api/v1/admins/hubs", headers=admin_headers)
            assert hubs_resp.status_code == 200
            seeded_hub = next(h for h in hubs_resp.json() if h["id"] == str(data["hub_id"]))
            assert len(seeded_hub["stock"]) >= 1
            assert seeded_hub["stock"][0]["listing_id"] == str(data["listing_id"])
            assert len(seeded_hub["recent_deliveries"]) == 5

            # 3. Hub update, location validation, no-op conflict, and missing hub
            invalid_hub_create = client.post(
                "/api/v1/admins/hubs",
                headers=admin_headers,
                json={
                    "name": "Bad Hub",
                    "address": "1 Road",
                    "pincode": "12345",
                    "service_radius_km": "8.00",
                    "latitude": 95.0,
                    "longitude": 85.8,
                },
            )
            assert invalid_hub_create.status_code == 422

            partial_coords = client.patch(
                f"/api/v1/admins/hubs/{data['hub_id']}",
                headers=admin_headers,
                json={"latitude": 20.35},
            )
            assert partial_coords.status_code == 422
            assert "Latitude and longitude must be provided together" in partial_coords.json()["detail"]

            updated_hub = client.patch(
                f"/api/v1/admins/hubs/{data['hub_id']}",
                headers=admin_headers,
                json={
                    "name": "Updated Hub Name",
                    "service_radius_km": "9.50",
                    "latitude": 20.31,
                    "longitude": 85.81,
                },
            )
            assert updated_hub.status_code == 200, updated_hub.text
            assert updated_hub.json()["name"] == "Updated Hub Name"
            assert updated_hub.json()["service_radius_km"] == "9.50"
            assert round(updated_hub.json()["latitude"], 2) == 20.31
            assert round(updated_hub.json()["longitude"], 2) == 85.81

            noop_hub = client.patch(
                f"/api/v1/admins/hubs/{data['hub_id']}",
                headers=admin_headers,
                json={"name": "Updated Hub Name", "latitude": 20.31, "longitude": 85.81},
            )
            assert noop_hub.status_code == 409

            missing_hub = client.patch(
                f"/api/v1/admins/hubs/{uuid4()}",
                headers=admin_headers,
                json={"name": "Missing"},
            )
            assert missing_hub.status_code == 404

            # 4. Hub staff list, assign, duplicate conflict, unassign, missing 404, password privacy in audit
            second_hub = client.post(
                "/api/v1/admins/hubs",
                headers=admin_headers,
                json={
                    "name": f"Second Hub {uuid4()}",
                    "address": "2 Hub Road",
                    "pincode": "751002",
                    "service_radius_km": "8.00",
                    "status": "ACTIVE",
                    "latitude": 20.32,
                    "longitude": 85.82,
                },
            )
            assert second_hub.status_code == 201
            second_hub_id = second_hub.json()["id"]
            data["extra_hub_ids"].append(UUID(second_hub_id))

            secret_pw = "SuperSecret-Staff-Pass-987!"
            created_staff = client.post(
                "/api/v1/admins/hub-staff",
                headers=admin_headers,
                json={
                    "email": f"staff-audit-{uuid4()}@example.com",
                    "initial_password": secret_pw,
                    "hub_id": str(data["hub_id"]),
                },
            )
            assert created_staff.status_code == 201
            assert secret_pw not in created_staff.text
            staff_user_id = created_staff.json()["user_id"]
            data["extra_user_ids"].append(UUID(staff_user_id))

            dup_email = client.post(
                "/api/v1/admins/hub-staff",
                headers=admin_headers,
                json={
                    "email": created_staff.json()["email"],
                    "initial_password": secret_pw,
                    "hub_id": str(data["hub_id"]),
                },
            )
            assert dup_email.status_code == 409

            assign_second = client.post(
                "/api/v1/admins/hub-staff/assignments",
                headers=admin_headers,
                json={"user_id": staff_user_id, "hub_id": second_hub_id},
            )
            assert assign_second.status_code == 204

            dup_assign = client.post(
                "/api/v1/admins/hub-staff/assignments",
                headers=admin_headers,
                json={"user_id": staff_user_id, "hub_id": second_hub_id},
            )
            assert dup_assign.status_code == 409

            staff_list = client.get("/api/v1/admins/hub-staff", headers=admin_headers)
            assert staff_list.status_code == 200
            staff_hub_ids = [
                row["hub_id"] for row in staff_list.json() if row["user_id"] == staff_user_id
            ]
            assert set(staff_hub_ids) == {str(data["hub_id"]), second_hub_id}

            unassign_second = client.delete(
                f"/api/v1/admins/hub-staff/{staff_user_id}/assignments/{second_hub_id}",
                headers=admin_headers,
            )
            assert unassign_second.status_code == 204

            unassign_missing = client.delete(
                f"/api/v1/admins/hub-staff/{staff_user_id}/assignments/{second_hub_id}",
                headers=admin_headers,
            )
            assert unassign_missing.status_code == 404

            # 5. Shipment listing & HTTP OTP reset (unlocked -> 409, locked -> 204 + OrderEvent)
            unlocked_reset = client.post(
                f"/api/v1/admins/shipments/{shipment_id}/otp-reset",
                headers=admin_headers,
                json={"reason": "Should fail while unlocked"},
            )
            assert unlocked_reset.status_code == 409

            # Lock the OTP via max attempts (default Settings().otp_max_attempts == 5)
            wrong_code = "000000" if first_code != "000000" else "000001"
            rider_headers = auth_header(data["rider_user_id"], UserRole.RIDER)
            for _ in range(Settings().otp_max_attempts):
                resp = client.post(
                    f"/api/v1/rider/shipments/{shipment_id}/otp-verification",
                    headers=rider_headers,
                    json={"code": wrong_code},
                )
                assert resp.status_code == 400

            shipments_locked = client.get("/api/v1/admins/shipments", headers=admin_headers)
            assert shipments_locked.status_code == 200
            ship_row = next(s for s in shipments_locked.json() if s["id"] == str(shipment_id))
            assert ship_row["otp_locked"] is True
            assert ship_row["can_cancel"] is False

            reset_ok = client.post(
                f"/api/v1/admins/shipments/{shipment_id}/otp-reset",
                headers=admin_headers,
                json={"reason": "Customer confirmed identity on support call"},
            )
            assert reset_ok.status_code == 204

            shipments_after = client.get("/api/v1/admins/shipments", headers=admin_headers)
            ship_row_after = next(s for s in shipments_after.json() if s["id"] == str(shipment_id))
            assert ship_row_after["otp_locked"] is False

            # Invalid analytics range returns 422
            bad_range = client.get(
                "/api/v1/admins/analytics",
                params={"range": "invalid"},
                headers=admin_headers,
            )
            assert bad_range.status_code == 422

        async def verify_audits():
            eng = build_engine(Settings())
            fac = async_sessionmaker(eng, expire_on_commit=False)
            async with fac() as session:
                audits = list(
                    (
                        await session.scalars(
                            select(AdminAuditEvent).where(
                                AdminAuditEvent.actor_user_id == data["admin_user_id"]
                            )
                        )
                    ).all()
                )
                actions = {a.action for a in audits}
                assert {"HUB_UPDATED", "HUB_STAFF_ASSIGNED", "HUB_STAFF_UNASSIGNED"}.issubset(actions)
                for a in audits:
                    assert secret_pw not in (a.from_value or "")
                    assert secret_pw not in (a.to_value or "")

                otp_events = list(
                    (
                        await session.scalars(
                            select(OrderEvent).where(
                                OrderEvent.shipment_id == shipment_id,
                                OrderEvent.to_status == "OTP_RESET",
                            )
                        )
                    ).all()
                )
                assert len(otp_events) == 1
                assert otp_events[0].actor_user_id == data["admin_user_id"]
                assert otp_events[0].note == "Customer confirmed identity on support call"
            await eng.dispose()

        asyncio.run(verify_audits())
    finally:
        cleanup(data)

