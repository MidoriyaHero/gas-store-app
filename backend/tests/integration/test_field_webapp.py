"""Field webapp: staff can read customers and create self-assigned orders."""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import User, UserRole
from app.services.auth import hash_password


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


def _login_admin(client: TestClient) -> None:
    """Login default seeded admin and persist cookie in client session."""
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    token = r.cookies.get("access_token")
    if token:
        client.cookies.set("access_token", token)


def _login_staff(client: TestClient) -> None:
    """Login staff after _ensure_user_account and persist cookie in client session."""
    r = client.post("/api/auth/login", json={"username": "staff", "password": "staff123"})
    assert r.status_code == 200
    token = r.cookies.get("access_token")
    if token:
        client.cookies.set("access_token", token)


def _unique_phone(prefix: str = "09") -> str:
    """Build a digits-only VN-style phone unique enough for parallel-ish local runs."""
    return f"{prefix}{uuid4().int % 10**8:08d}"


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


def test_staff_can_get_customers_but_cannot_write():
    """Staff GET directory/detail/by-phone; POST and PATCH stay admin-only."""
    _ensure_user_account()
    phone = _unique_phone()
    with TestClient(app) as client:
        _login_admin(client)
        created = client.post("/api/customers", json={"name": "Field Staff Read", "phone": phone})
        assert created.status_code == 200
        customer_id = created.json()["id"]

        _login_staff(client)
        listed = client.get("/api/customers")
        assert listed.status_code == 200
        by_phone = client.get("/api/customers/by-phone", params={"phone": phone})
        assert by_phone.status_code == 200
        assert by_phone.json()["id"] == customer_id
        detail = client.get(f"/api/customers/{customer_id}")
        assert detail.status_code == 200
        assert detail.json()["customer"]["id"] == customer_id

        post = client.post(
            "/api/customers",
            json={"name": "Staff Forbidden", "phone": _unique_phone("08")},
        )
        assert post.status_code == 403
        patch = client.patch(f"/api/customers/{customer_id}", json={"name": "Hacked"})
        assert patch.status_code == 403


def test_staff_order_forces_self_assignment():
    """Staff POST /api/orders overwrites assigned_to_user_id to the acting staff id."""
    _ensure_user_account()
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Field Staff Order")
        admin_me = client.get("/api/auth/me")
        assert admin_me.status_code == 200
        admin_id = admin_me.json()["user"]["id"]

        _login_staff(client)
        staff_me = client.get("/api/auth/me")
        assert staff_me.status_code == 200
        staff_id = staff_me.json()["user"]["id"]
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Field Staff",
                "phone": _unique_phone("07"),
                "vat_rate": 0,
                "customer_segment": "retail",
                "payment_mode": "cash",
                "lines": [{"product_id": pid, "quantity": 1}],
                "assigned_to_user_id": admin_id,
            },
        )
        assert created.status_code == 200
        assert created.json()["assigned_to_user_id"] == staff_id


def test_admin_order_keeps_unassigned():
    """Admin POST /api/orders without assigned_to_user_id stays unassigned."""
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_test_product(client, "Field Admin Order")
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Field Admin",
                "phone": _unique_phone("06"),
                "vat_rate": 0,
                "customer_segment": "retail",
                "payment_mode": "cash",
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert created.status_code == 200
        assert created.json()["assigned_to_user_id"] is None


def test_unauthenticated_customers_list_is_401():
    """GET /api/customers stays private after dropping the router-wide dependency."""
    with TestClient(app) as client:
        listed = client.get("/api/customers")
        assert listed.status_code == 401
