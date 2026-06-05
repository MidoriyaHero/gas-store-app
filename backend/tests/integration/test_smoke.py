"""Smoke tests for the gas store HTTP API."""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from uuid import uuid4

from app.database import SessionLocal
from app.main import app
from app.models import User, UserRole
from app.services.auth import hash_password


def _login_admin(client: TestClient) -> None:
    """Login default seeded admin and persist cookie in client session."""
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200


def _ensure_user_account() -> None:
    """Create a staff user for role-access tests when missing."""
    with SessionLocal() as db:
        exists = db.scalar(select(User.id).where(User.username == "staff"))
        if exists:
            return
        db.add(
            User(
                username="staff",
                password_hash=hash_password("staff123"),
                role=UserRole.USER.value,
                is_active=True,
            )
        )
        db.commit()


def _create_test_product(client: TestClient, name: str) -> int:
    """Create a high-stock product for deterministic order tests."""
    created = client.post(
        "/api/products",
        json={
            "name": name,
            "sku": f"SKU-{uuid4().hex[:10]}",
            "cost_price": 100000,
            "sell_price": 120000,
            "stock_quantity": 999,
            "low_stock_threshold": 5,
        },
    )
    assert created.status_code == 200
    return created.json()["id"]


def test_products_list():
    """GET /api/products returns JSON list."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/products")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


def test_product_archive_flow_and_filters():
    """Archived products are hidden by default and visible when include_inactive=true."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Archive Flow")
        archived = client.patch(f"/api/products/{pid}", json={"is_active": False})
        assert archived.status_code == 200
        assert archived.json()["is_active"] is False

        active_list = client.get("/api/products")
        assert active_list.status_code == 200
        assert not any(p["id"] == pid for p in active_list.json())

        full_list = client.get("/api/products", params={"include_inactive": True})
        assert full_list.status_code == 200
        row = next((p for p in full_list.json() if p["id"] == pid), None)
        assert row is not None
        assert row["is_active"] is False

        restored = client.patch(f"/api/products/{pid}", json={"is_active": True})
        assert restored.status_code == 200
        assert restored.json()["is_active"] is True


def test_order_requires_phone_and_debt_flow():
    """Order creation requires phone and debt APIs update balances correctly."""
    with TestClient(app) as client:
        _login_admin(client)
        with SessionLocal() as db:
            admin_id = db.scalar(select(User.id).where(User.username == "admin")) or 1
        pid = _create_test_product(client, "Debt Flow")
        missing_phone = client.post(
            "/api/orders",
            json={"customer_name": "No Phone", "vat_rate": 0, "lines": [{"product_id": pid, "quantity": 1}]},
        )
        assert missing_phone.status_code == 422

        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Debt Customer",
                "phone": "0909777000",
                "vat_rate": 0,
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert created.status_code == 200
        assert float(created.json()["outstanding_amount"]) > 0
        accounts = client.get("/api/debt-accounts", params={"status": "all"})
        assert accounts.status_code == 200
        account = next((a for a in accounts.json() if a["phone"] == "0909777000"), None)
        assert account is not None
        aid = account["id"]

        payment = client.post("/api/debt-payments", json={"debt_account_id": aid, "amount": 10000, "payment_method": "cash"})
        assert payment.status_code == 200
        write_off = client.post(
            "/api/debt-write-offs",
            json={"debt_account_id": aid, "amount": 5000, "reason": "Khách hỗ trợ", "approved_by_user_id": admin_id},
        )
        assert write_off.status_code == 200
        detail = client.get(f"/api/debt-accounts/{aid}")
        assert detail.status_code == 200
        assert len(detail.json().get("ledger", [])) >= 3
        aging = client.get("/api/debt-aging")
        assert aging.status_code == 200
        assert isinstance(aging.json(), list)


def test_dashboard_bundle():
    """GET /api/dashboard returns orders + products keys."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/dashboard")
        assert r.status_code == 200
        data = r.json()
        assert "orders" in data and "products" in data


def test_dashboard_summary_endpoint():
    """GET /api/dashboard/summary returns KPI totals and daily series."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/dashboard/summary", params={"range": "7d"})
        assert r.status_code == 200
        data = r.json()
        assert data["range"] == "7d"
        assert "revenue" in data and "outstanding" in data and "profit" in data
        assert isinstance(data["series"], list)
        if data["series"]:
            row = data["series"][0]
            assert {"date", "revenue", "outstanding", "profit", "order_count"} <= set(row.keys())


def test_partial_payment_keeps_outstanding_and_ledger():
    """Partial payment orders retain correct outstanding and debt account balance."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Partial Debt")
        phone = f"090{int(uuid4().hex[:7], 16) % 10_000_000:07d}"
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Partial Customer",
                "phone": phone,
                "vat_rate": 0,
                "payment_mode": "partial",
                "paid_amount": 40000,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert created.status_code == 200
        body = created.json()
        total = float(body["total"])
        outstanding = float(body["outstanding_amount"])
        assert outstanding == total - 40000
        assert outstanding > 0

        accounts = client.get("/api/debt-accounts", params={"status": "all"})
        assert accounts.status_code == 200
        account = next((a for a in accounts.json() if a["phone"] == phone), None)
        assert account is not None
        assert float(account["current_balance"]) == outstanding


def test_delete_older_debt_order_preserves_newer_outstanding():
    """Removing an older debt order must not reduce outstanding on a newer order with same phone."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Delete Debt Isolation")
        phone = f"090{int(uuid4().hex[:7], 16) % 10_000_000:07d}"
        first = client.post(
            "/api/orders",
            json={
                "customer_name": "Debt Same Phone Old",
                "phone": phone,
                "vat_rate": 0,
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert first.status_code == 200
        first_id = first.json()["id"]
        first_outstanding = float(first.json()["outstanding_amount"])

        second = client.post(
            "/api/orders",
            json={
                "customer_name": "Debt Same Phone New",
                "phone": phone,
                "vat_rate": 0,
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert second.status_code == 200
        second_id = second.json()["id"]
        second_outstanding_before = float(second.json()["outstanding_amount"])
        assert second_outstanding_before == first_outstanding

        deleted = client.delete(f"/api/orders/{first_id}")
        assert deleted.status_code == 200

        second_after = client.get(f"/api/orders/{second_id}")
        assert second_after.status_code == 200
        assert float(second_after.json()["outstanding_amount"]) == second_outstanding_before


def test_cash_order_patch_to_debt_syncs_debt_ledger():
    """PATCH cash order to debt must create ledger entry and matching account balance."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Cash To Debt")
        phone = f"090{int(uuid4().hex[:7], 16) % 10_000_000:07d}"
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Cash Then Debt",
                "phone": phone,
                "vat_rate": 0,
                "payment_mode": "cash",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert created.status_code == 200
        oid = created.json()["id"]
        total = float(created.json()["total"])
        assert float(created.json()["outstanding_amount"]) == 0

        patched = client.patch(
            f"/api/orders/{oid}",
            json={
                "customer_name": "Cash Then Debt",
                "phone": phone,
                "vat_rate": 0,
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert patched.status_code == 200
        assert float(patched.json()["outstanding_amount"]) == total

        accounts = client.get("/api/debt-accounts", params={"status": "all"})
        assert accounts.status_code == 200
        account = next((a for a in accounts.json() if a["phone"] == phone), None)
        assert account is not None
        assert float(account["current_balance"]) == total


def test_gas_ledger():
    """GET /api/gas-ledger returns JSON array."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/gas-ledger")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


def test_list_orders_pagination_envelope():
    """GET /api/orders returns paginated JSON; ``limit`` must be 10, 20, 50, or 100."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/orders", params={"limit": 10, "offset": 0})
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body
        assert isinstance(body["items"], list)
        assert isinstance(body["total"], int)
        assert client.get("/api/orders", params={"limit": 15, "offset": 0}).status_code == 400


def test_gas_ledger_skips_incomplete_rows_and_flags_orders():
    """Sổ gas lists only lines with full cylinder + customer fields; orders expose ``gas_ledger_ready``."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Gas Ledger Eligibility")
        inc = client.post(
            "/api/orders",
            json={
                "customer_name": "Khach Thieu",
                "phone": "0909000001",
                "vat_rate": 0,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert inc.status_code == 200
        assert inc.json().get("gas_ledger_ready") is False
        inc_gaps = inc.json().get("gas_ledger_gaps") or []
        assert isinstance(inc_gaps, list) and len(inc_gaps) >= 1
        ledger_after_inc = client.get("/api/gas-ledger").json()
        assert not any("Khach Thieu" in (r.get("customer_name_and_address") or "") for r in ledger_after_inc)

        full = client.post(
            "/api/orders",
            json={
                "customer_name": "Khach Du",
                "phone": "0909123456",
                "address": "12 Duong Test",
                "delivery_date": "2026-04-20",
                "vat_rate": 0,
                "lines": [
                    {
                        "product_id": pid,
                        "quantity": 1,
                        "owner_name": "CT Gas",
                        "cylinder_type": "12kg",
                        "cylinder_serial": "SR-OK-1",
                        "inspection_expiry": "2027-06-01",
                        "import_source": "Kho trung tam",
                        "import_date": "2026-03-01",
                    }
                ],
            },
        )
        assert full.status_code == 200
        assert full.json().get("gas_ledger_ready") is True
        assert full.json().get("gas_ledger_gaps") == []
        ledger_after_full = client.get("/api/gas-ledger").json()
        assert any("Khach Du" in (r.get("customer_name_and_address") or "") for r in ledger_after_full)

        no_serial = client.post(
            "/api/orders",
            json={
                "customer_name": "Khach Khong Serial",
                "phone": "0909888777",
                "address": "88 Duong Test",
                "delivery_date": "2026-04-21",
                "vat_rate": 0,
                "lines": [
                    {
                        "product_id": pid,
                        "quantity": 1,
                        "owner_name": "CT Gas",
                        "cylinder_type": "12kg",
                        "inspection_expiry": "2027-06-01",
                        "import_source": "Kho trung tam",
                        "import_date": "2026-03-01",
                    }
                ],
            },
        )
        assert no_serial.status_code == 200
        assert no_serial.json().get("gas_ledger_ready") is True

        client.delete(f"/api/orders/{inc.json()['id']}")
        client.delete(f"/api/orders/{full.json()['id']}")
        client.delete(f"/api/orders/{no_serial.json()['id']}")


def test_list_orders_search_q():
    """GET /api/orders?q= filters by order code, customer name, or phone."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/orders", params={"limit": 10, "offset": 0, "q": "__no_match_xyz__"})
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body
        assert body["total"] == 0
        assert body["items"] == []


def test_export_endpoints():
    """CSV/HTML export routes respond (empty DB is ok)."""
    with TestClient(app) as client:
        _login_admin(client)
        assert client.get("/api/products-export.csv").status_code == 200
        assert client.get("/api/gas-ledger.csv").status_code == 200
        assert client.get("/api/sales-gas-export.csv").status_code == 200
        r = client.get("/api/tax-export.csv")
        assert r.status_code == 200
        assert "delivery_date" in r.text.splitlines()[0]


def test_admin_can_crud_users():
    """Admin can create/update/delete users via management endpoints."""
    with TestClient(app) as client:
        _login_admin(client)
        created = client.post(
            "/api/users",
            json={"username": "ops-user", "password": "ops12345", "role": "user", "is_active": True},
        )
        assert created.status_code == 200
        user_id = created.json()["id"]
        listed = client.get("/api/users")
        assert listed.status_code == 200
        assert any(u["id"] == user_id for u in listed.json())
        updated = client.patch(f"/api/users/{user_id}", json={"role": "admin", "is_active": False})
        assert updated.status_code == 200
        assert updated.json()["role"] == "admin"
        removed = client.delete(f"/api/users/{user_id}")
        assert removed.status_code == 200


def test_admin_crud_cylinder_templates_and_staff_lists_active():
    """Admin manages cylinder templates; staff lists active presets only."""
    _ensure_user_account()
    with TestClient(app) as client:
        assert client.post("/api/auth/login", json={"username": "staff", "password": "staff123"}).status_code == 200
        staff_list = client.get("/api/cylinder-templates")
        assert staff_list.status_code == 200
        assert client.get("/api/cylinder-templates", params={"include_inactive": True}).status_code == 403

    with TestClient(app) as client:
        _login_admin(client)
        created = client.post(
            "/api/cylinder-templates",
            json={
                "name": "Kho chính",
                "owner_name": "PV GAS",
                "import_source": "Kho trung tâm",
                "inspection_expiry": "2027-06-30",
                "import_date": "2026-04-18",
                "is_active": True,
            },
        )
        assert created.status_code == 200
        tid = created.json()["id"]
        listed = client.get("/api/cylinder-templates", params={"include_inactive": True})
        assert listed.status_code == 200
        assert any(t["id"] == tid for t in listed.json())

    with TestClient(app) as client:
        assert client.post("/api/auth/login", json={"username": "staff", "password": "staff123"}).status_code == 200
        staff_sees = client.get("/api/cylinder-templates")
        assert staff_sees.status_code == 200
        assert any(t["id"] == tid for t in staff_sees.json())

    with TestClient(app) as client:
        _login_admin(client)
        patched = client.patch(f"/api/cylinder-templates/{tid}", json={"name": "Kho phụ", "is_active": False})
        assert patched.status_code == 200
        assert patched.json()["name"] == "Kho phụ"

    with TestClient(app) as client:
        assert client.post("/api/auth/login", json={"username": "staff", "password": "staff123"}).status_code == 200
        staff_after = client.get("/api/cylinder-templates")
        assert staff_after.status_code == 200
        assert not any(t["id"] == tid for t in staff_after.json())


def test_order_notes_text_crud_voice_create_delete():
    """Staff can CRUD text notes; voice notes are create-only then delete; patch voice is rejected."""
    _ensure_user_account()
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"username": "staff", "password": "staff123"})
        assert login.status_code == 200
        created = client.post("/api/order-notes", json={"raw_text": "Khach A - giao truoc 10h"})
        assert created.status_code == 200
        assert created.json()["note_type"] == "text"
        note_id = created.json()["id"]
        listed = client.get("/api/order-notes")
        assert listed.status_code == 200
        assert any(n["id"] == note_id for n in listed.json())
        patched = client.patch(f"/api/order-notes/{note_id}", json={"raw_text": "Khach A - da sua"})
        assert patched.status_code == 200
        assert patched.json()["raw_text"] == "Khach A - da sua"

        voice = client.post(
            "/api/order-notes/voice",
            files={"file": ("test.webm", b"\x00\x01dummy-audio", "audio/webm")},
            data={"duration_sec": "5"},
        )
        assert voice.status_code == 200
        vid = voice.json()["id"]
        assert voice.json()["note_type"] == "voice"
        assert voice.json().get("audio_url")

        bad_patch = client.patch(f"/api/order-notes/{vid}", json={"raw_text": "cannot"})
        assert bad_patch.status_code == 400

        assert client.delete(f"/api/order-notes/{vid}").status_code == 200
        assert client.delete(f"/api/order-notes/{note_id}").status_code == 200


def test_admin_can_list_all_order_notes():
    """Admin can query all notes using mine=false filter."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/order-notes", params={"mine": False})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


def test_admin_can_update_and_delete_order():
    """Admin can patch and delete orders (with stock rollback)."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Gas CRUD Test")
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Edit Me",
                "phone": "0909000003",
                "vat_rate": 10,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert created.status_code == 200
        oid = created.json()["id"]
        patched = client.patch(
            f"/api/orders/{oid}",
            json={
                "customer_name": "Edited Name",
                "phone": "0909000003",
                "vat_rate": 8,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert patched.status_code == 200
        assert patched.json()["customer_name"] == "Edited Name"
        deleted = client.delete(f"/api/orders/{oid}")
        assert deleted.status_code == 200
        assert client.get(f"/api/orders/{oid}").status_code == 404


def test_soft_deleted_order_excluded_from_dashboard_and_gas_ledger():
    """Soft-deleted orders must not appear in Tổng quan bundle or sổ gas exports."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Soft Delete Report")
        customer_marker = f"Khach Xoa Dashboard {uuid4().hex[:8]}"
        dash_count_before = len(client.get("/api/dashboard").json()["orders"])

        created = client.post(
            "/api/orders",
            json={
                "customer_name": customer_marker,
                "phone": f"090{int(uuid4().hex[:7], 16) % 10_000_000:07d}",
                "address": "99 Duong Test",
                "delivery_date": "2026-05-01",
                "vat_rate": 0,
                "lines": [
                    {
                        "product_id": pid,
                        "quantity": 1,
                        "owner_name": "CT Gas",
                        "cylinder_type": "12kg",
                        "cylinder_serial": "SR-DEL-1",
                        "inspection_expiry": "2027-06-01",
                        "import_source": "Kho trung tam",
                        "import_date": "2026-03-01",
                    }
                ],
            },
        )
        assert created.status_code == 200
        oid = created.json()["id"]

        dash_count_created = len(client.get("/api/dashboard").json()["orders"])
        assert dash_count_created == dash_count_before + 1
        ledger_before = client.get("/api/gas-ledger").json()
        assert any(customer_marker in (r.get("customer_name_and_address") or "") for r in ledger_before)

        assert client.delete(f"/api/orders/{oid}").status_code == 200

        dash_count_after = len(client.get("/api/dashboard").json()["orders"])
        assert dash_count_after == dash_count_before
        ledger_after = client.get("/api/gas-ledger").json()
        assert not any(customer_marker in (r.get("customer_name_and_address") or "") for r in ledger_after)


def test_staff_cannot_create_orders_sees_assigned():
    """Staff cannot POST /api/orders; admin-assigned orders appear on GET /api/me/orders."""
    _ensure_user_account()
    with TestClient(app) as admin_client:
        _login_admin(admin_client)
        pid = _create_test_product(admin_client, "Gas Staff Assigned Test")

    with TestClient(app) as staff_client:
        login = staff_client.post("/api/auth/login", json={"username": "staff", "password": "staff123"})
        assert login.status_code == 200
        staff_id = login.json()["user"]["id"]

        products = staff_client.get("/api/products")
        assert products.status_code == 200
        assert any(p["id"] == pid for p in products.json())

        denied = staff_client.post(
            "/api/orders",
            json={
                "customer_name": "Khach le",
                "phone": "0909000004",
                "vat_rate": 10,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert denied.status_code == 403

        with TestClient(app) as admin_client:
            _login_admin(admin_client)
            assigned = admin_client.post(
                "/api/orders",
                json={
                    "customer_name": "Khach gan NV",
                    "phone": "0909000005",
                    "vat_rate": 10,
                    "assigned_to_user_id": staff_id,
                    "lines": [{"product_id": pid, "quantity": 1}],
                },
            )
        assert assigned.status_code == 200
        oid = assigned.json()["id"]
        assert assigned.json().get("delivery_status") == "in_transit"

        mine = staff_client.get("/api/me/orders")
        assert mine.status_code == 200
        assert any(o["id"] == oid for o in mine.json())

        mine_active = staff_client.get("/api/me/orders", params={"delivery_status": "in_transit"})
        assert mine_active.status_code == 200
        assert any(o["id"] == oid for o in mine_active.json())

        done = staff_client.patch(f"/api/me/orders/{oid}", json={"delivery_status": "completed"})
        assert done.status_code == 200
        assert done.json()["delivery_status"] == "completed"

        mine_hist = staff_client.get("/api/me/orders", params={"delivery_status": "completed"})
        assert mine_hist.status_code == 200
        assert any(o["id"] == oid for o in mine_hist.json())

        assert staff_client.get("/api/dashboard").status_code == 403
        assert (
            staff_client.patch(
                f"/api/orders/{oid}",
                json={"customer_name": "x", "phone": "0909000005", "vat_rate": 10, "lines": [{"product_id": pid, "quantity": 1}]},
            ).status_code
            == 403
        )
        assert staff_client.get("/api/users").status_code == 403


def test_backend_governance_endpoints_smoke():
    """Core/finance/CX/safety governance APIs should accept basic CRUD flow."""
    with TestClient(app) as client:
        _login_admin(client)
        shift = client.post(
            "/api/shift-settlements",
            json={"shift_date": "2026-04-27", "shift_label": "ca-sang", "expected_cash": 1000000, "actual_cash": 980000},
        )
        assert shift.status_code == 200
        assert client.get("/api/shift-settlements").status_code == 200
        assert client.get("/api/shift-settlements/anomalies").status_code == 200

        kpi = client.post(
            "/api/finance-kpis",
            json={
                "kpi_key": "cash_reconcile_delta",
                "label": "Sai lệch doanh thu-ngân quỹ",
                "target_value": "<=0.5%",
                "data_source": "Đối soát ca giao",
                "period_start": "2026-04-01",
                "period_end": "2026-04-30",
                "measured_value": 0.4,
            },
        )
        assert kpi.status_code == 200
        assert client.get("/api/finance-kpis").status_code == 200

        event = client.post(
            "/api/customer-journey-events",
            json={
                "customer_name": "Khach A",
                "step_key": "remind",
                "step_label": "Nhắc định kỳ",
                "status": "done",
                "channel": "zalo",
            },
        )
        assert event.status_code == 200
        ticket = client.post(
            "/api/complaint-tickets",
            json={
                "customer_name": "Khach B",
                "issue_text": "Giao trễ",
                "owner_name": "CSKH 1",
                "status": "open",
            },
        )
        assert ticket.status_code == 200
        tid = ticket.json()["id"]
        upd = client.patch(f"/api/complaint-tickets/{tid}", json={"status": "in_progress"})
        assert upd.status_code == 200
        assert client.get("/api/customer-journey-events").status_code == 200
        assert client.get("/api/complaint-tickets").status_code == 200

        checklist = client.post(
            "/api/safety-checklist-runs",
            json={
                "run_date": "2026-04-27",
                "shift_label": "ca-sang",
                "valve_ok": True,
                "seal_ok": True,
                "leak_ok": True,
                "inspection_ok": True,
                "inspection_expiry": "2026-12-31",
            },
        )
        assert checklist.status_code == 200
        capa = client.post(
            "/api/capa-items",
            json={"title": "Khắc phục quy trình niêm chì", "owner_name": "An toàn", "status": "open"},
        )
        assert capa.status_code == 200
        cid = capa.json()["id"]
        assert client.patch(f"/api/capa-items/{cid}", json={"status": "closed"}).status_code == 200
        assert client.get("/api/safety-checklist-runs").status_code == 200
        assert client.get("/api/capa-items").status_code == 200
        assert client.get("/api/audit-logs").status_code == 200


def test_staff_cannot_read_debt_accounts_but_can_patch_map_location():
    """Staff must not list debt accounts; map self-service remains allowed."""
    with TestClient(app) as client:
        assert client.post("/api/auth/login", json={"username": "staff", "password": "staff123"}).status_code == 200
        listed = client.get("/api/debt-accounts", params={"status": "all"})
        assert listed.status_code == 403
        pay = client.post("/api/debt-payments", json={"debt_account_id": 1, "amount": 1, "payment_method": "cash"})
        assert pay.status_code == 403

        patch = client.patch("/api/auth/me/map-location", json={"lat": 10.762622, "lng": 106.660172})
        assert patch.status_code == 200
        loc = patch.json().get("user", {}).get("map_location")
        assert loc and abs(float(loc["lat"]) - 10.762622) < 1e-6
        me = client.get("/api/auth/me")
        assert me.json()["user"].get("map_location") == loc

        patch2 = client.patch(
            "/api/auth/me/map-location",
            json={"lat": 10.8, "lng": 106.7, "label": "Kho test Q1"},
        )
        assert patch2.status_code == 200
        assert patch2.json()["user"]["map_location"]["label"] == "Kho test Q1"


def test_geocode_requires_login():
    """Unauthenticated clients cannot call the geocode proxy."""
    with TestClient(app) as client:
        r = client.get("/api/geocode", params={"q": "Ho Chi Minh"})
        assert r.status_code == 401
        r2 = client.get("/api/geocode/reverse", params={"lat": 10.77, "lng": 106.69})
        assert r2.status_code == 401
        r3 = client.post("/api/geocode/from-paste", json={"raw": "10.77, 106.69"})
        assert r3.status_code == 401


def test_geocode_reverse_returns_place():
    """Authenticated reverse geocode returns a GeocodeHit-shaped body."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/geocode/reverse", params={"lat": 10.772461, "lng": 106.698055})
        assert r.status_code == 200
        body = r.json()
        assert "lat" in body and "lng" in body and "display_name" in body
        assert isinstance(body["display_name"], str) and len(body["display_name"]) > 5


def test_daily_cylinder_audit_math_and_debt_shell_return():
    """Daily audit aggregates completed deliveries, borrowed shells on orders, and shells from debt payments."""
    with TestClient(app) as client:
        _login_admin(client)
        audit_d = date(2120, 1, 1) + timedelta(days=int(uuid4().int % (365 * 40)))
        audit_day = audit_d.isoformat()
        paid_at = datetime(audit_d.year, audit_d.month, audit_d.day, 12, 0, 0, tzinfo=UTC).isoformat()
        pid = _create_test_product(client, "Cylinder Audit SKU")
        addr = "123 Audit Street, District 1"
        o = client.post(
            "/api/orders",
            json={
                "customer_name": "Audit Shell Customer",
                "phone": "0912333444",
                "address": addr,
                "vat_rate": 0,
                "payment_mode": "cash",
                "delivery_date": audit_day,
                "delivery_status": "completed",
                "borrowed_shell_units": 1,
                "lines": [{"product_id": pid, "quantity": 2}],
            },
        )
        assert o.status_code == 200

        put = client.put(
            f"/api/operations/daily-cylinder-audit/{audit_day}",
            json={
                "morning_full": 10,
                "morning_shell": 5,
                "import_full": 1,
                "supplier_shell_units": 1,
                "evening_full": 9,
                "evening_shell": 7,
            },
        )
        assert put.status_code == 200
        c = put.json()["computed"]
        assert c["delivered_full"] == 2
        assert c["borrowed_shell_total"] == 1
        assert c["returned_shells_debt"] == 0
        assert c["expected_evening_full"] == 9
        assert c["variance_full"] == 0
        assert c["expected_evening_shell"] == 5
        assert c["variance_shell"] == 2

        pid2 = _create_test_product(client, "Cylinder Audit Debt SKU")
        dord = client.post(
            "/api/orders",
            json={
                "customer_name": "Shell Return Debt",
                "phone": "0912555666",
                "address": addr,
                "vat_rate": 0,
                "payment_mode": "debt",
                "lines": [{"product_id": pid2, "quantity": 1}],
            },
        )
        assert dord.status_code == 200
        accounts = client.get("/api/debt-accounts", params={"status": "all"})
        assert accounts.status_code == 200
        acc = next((a for a in accounts.json() if a.get("phone") == "0912555666"), None)
        assert acc is not None
        pay = client.post(
            "/api/debt-payments",
            json={
                "debt_account_id": acc["id"],
                "amount": 50000,
                "payment_method": "cash",
                "paid_at": paid_at,
                "returned_shell_units": 2,
            },
        )
        assert pay.status_code == 200

        g = client.get(f"/api/operations/daily-cylinder-audit?audit_date={audit_day}")
        assert g.status_code == 200
        c2 = g.json()["computed"]
        assert c2["returned_shells_debt"] == 2
        assert c2["expected_evening_shell"] == 5 + 2 - 1 - 1 + c2["returned_shells_debt"]
        assert c2["variance_shell"] == 7 - c2["expected_evening_shell"]


def test_shell_debt_ledger_list_and_csv():
    """GET /api/shell-debt-ledger lists orders with borrowed_shell_units and exports CSV."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Shell Ledger SKU")
        r = client.post(
            "/api/orders",
            json={
                "customer_name": "Shell Debt Customer",
                "phone": "0900111222",
                "address": "99 Shell Street",
                "vat_rate": 0,
                "payment_mode": "cash",
                "borrowed_shell_units": 2,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert r.status_code == 200
        ledger = client.get("/api/shell-debt-ledger")
        assert ledger.status_code == 200
        body = ledger.json()
        assert body["total"] >= 1
        assert body["total_shell_units"] >= 2
        assert any(row["borrowed_shell_units"] == 2 for row in body["items"])
        csv_r = client.get("/api/shell-debt-ledger.csv")
        assert csv_r.status_code == 200
        assert "Số vỏ mượn" in csv_r.text
        assert "Shell Debt Customer" in csv_r.text
