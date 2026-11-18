"""Integration tests for the customer directory, order upsert, and per-order debt."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _login_admin(client: TestClient) -> None:
    """Login default seeded admin and persist cookie in client session."""
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    token = r.cookies.get("access_token")
    if token:
        client.cookies.set("access_token", token)


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


def test_create_customer_normalizes_phone_and_rejects_duplicate():
    """POST /api/customers stores digits-only phone and returns 409 on the same number."""
    with TestClient(app) as client:
        _login_admin(client)
        created = client.post("/api/customers", json={"name": "A", "phone": "0909111222"})
        assert created.status_code == 200
        assert created.json()["phone"] == "0909111222"
        dup = client.post("/api/customers", json={"name": "B", "phone": "0909111222"})
        assert dup.status_code == 409
        assert "Số điện thoại đã thuộc khách khác" in str(dup.json())


def test_order_upserts_customer_and_updates_name():
    """Debt orders attach customer_id and later orders on the same phone overwrite the name."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Customer Upsert")
        first = client.post(
            "/api/orders",
            json={
                "customer_name": "Lan",
                "phone": "0912000001",
                "vat_rate": 0,
                "customer_segment": "retail",
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert first.status_code == 200
        cid = first.json()["customer_id"]
        assert isinstance(cid, int)
        by_phone = client.get("/api/customers/by-phone", params={"phone": "0912000001"})
        assert by_phone.status_code == 200
        assert by_phone.json()["id"] == cid
        assert by_phone.json()["name"] == "Lan"

        second = client.post(
            "/api/orders",
            json={
                "customer_name": "Lan 2",
                "phone": "0912000001",
                "vat_rate": 0,
                "customer_segment": "retail",
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert second.status_code == 200
        assert second.json()["customer_id"] == cid
        again = client.get("/api/customers/by-phone", params={"phone": "0912000001"})
        assert again.status_code == 200
        assert again.json()["name"] == "Lan 2"


def test_debt_payment_is_per_order_not_fifo():
    """Paying one debt order must not reduce outstanding on another order of the same phone."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Customer Debt Isolation")
        phone = "0912000099"
        first = client.post(
            "/api/orders",
            json={
                "customer_name": "No Fifo",
                "phone": phone,
                "vat_rate": 0,
                "customer_segment": "retail",
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 2}],
            },
        )
        second = client.post(
            "/api/orders",
            json={
                "customer_name": "No Fifo",
                "phone": phone,
                "vat_rate": 0,
                "customer_segment": "retail",
                "payment_mode": "debt",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert first.status_code == 200
        assert second.status_code == 200
        oid1 = first.json()["id"]
        oid2 = second.json()["id"]
        out1 = float(first.json()["outstanding_amount"])
        out2 = float(second.json()["outstanding_amount"])
        pay_amount = min(10000, out1 / 2)
        assert pay_amount > 0
        payment = client.post(
            "/api/debt-payments",
            json={"sales_order_id": oid1, "amount": pay_amount, "payment_method": "cash"},
        )
        assert payment.status_code == 200
        d1 = client.get(f"/api/debt-orders/{oid1}")
        d2 = client.get(f"/api/debt-orders/{oid2}")
        assert d1.status_code == 200
        assert d2.status_code == 200
        assert float(d2.json()["order"]["outstanding_amount"]) == out2
        assert float(d1.json()["order"]["outstanding_amount"]) == out1 - pay_amount


def test_customer_without_orders_is_at_risk_on_dashboard():
    """A directory customer with no orders counts toward dashboard at-risk KPIs."""
    with TestClient(app) as client:
        _login_admin(client)
        created = client.post(
            "/api/customers",
            json={"name": "At Risk Solo", "phone": f"0912{int(uuid4().hex[:7], 16) % 10_000_000:07d}"},
        )
        assert created.status_code == 200
        cid = created.json()["id"]
        summary = client.get("/api/dashboard/summary", params={"range": "7d"})
        assert summary.status_code == 200
        data = summary.json()
        assert data["at_risk_count"] >= 1
        ids = {row["id"] for row in data["at_risk_customers"]}
        assert cid in ids


def test_patch_customer_phone_conflict_is_409():
    """PATCH cannot steal a phone that already belongs to another customer."""
    with TestClient(app) as client:
        _login_admin(client)
        client.post("/api/customers", json={"name": "Exist", "phone": "0912000001"})
        created = client.post("/api/customers", json={"name": "Other", "phone": "0912000002"})
        assert created.status_code == 200
        patched = client.patch(
            f"/api/customers/{created.json()['id']}",
            json={"phone": "0912000001"},
        )
        assert patched.status_code == 409
        assert "Số điện thoại đã thuộc khách khác" in str(patched.json())
