"""Smoke tests for the gas store HTTP API."""

from fastapi.testclient import TestClient
from sqlalchemy import select

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


def test_products_list():
    """GET /api/products returns JSON list."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/products")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


def test_dashboard_bundle():
    """GET /api/dashboard returns orders + products keys."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/dashboard")
        assert r.status_code == 200
        data = r.json()
        assert "orders" in data and "products" in data


def test_gas_ledger():
    """GET /api/gas-ledger returns JSON array."""
    with TestClient(app) as client:
        _login_admin(client)
        r = client.get("/api/gas-ledger")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


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


def test_user_can_persist_cylinder_template():
    """Authenticated user can save and read server-side cylinder template."""
    _ensure_user_account()
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"username": "staff", "password": "staff123"})
        assert login.status_code == 200
        get_before = client.get("/api/me/cylinder-template")
        assert get_before.status_code == 200
        save = client.patch(
            "/api/me/cylinder-template",
            json={
                "owner_name": "PV GAS",
                "import_source": "Kho trung tam",
                "inspection_expiry": "2027-06-30",
                "import_date": "2026-04-18",
            },
        )
        assert save.status_code == 200
        get_after = client.get("/api/me/cylinder-template")
        assert get_after.status_code == 200
        assert get_after.json()["owner_name"] == "PV GAS"
        assert get_after.json()["inspection_expiry"] == "2027-06-30"


def test_admin_can_update_and_delete_order():
    """Admin can patch and delete orders (with stock rollback)."""
    with TestClient(app) as client:
        _login_admin(client)
        products = client.get("/api/products")
        assert products.status_code == 200
        pid = products.json()[0]["id"]
        created = client.post(
            "/api/orders",
            json={"customer_name": "Edit Me", "vat_rate": 10, "lines": [{"product_id": pid, "quantity": 1}]},
        )
        assert created.status_code == 200
        oid = created.json()["id"]
        patched = client.patch(
            f"/api/orders/{oid}",
            json={"customer_name": "Edited Name", "vat_rate": 8, "lines": [{"product_id": pid, "quantity": 1}]},
        )
        assert patched.status_code == 200
        assert patched.json()["customer_name"] == "Edited Name"
        deleted = client.delete(f"/api/orders/{oid}")
        assert deleted.status_code == 200
        assert client.get(f"/api/orders/{oid}").status_code == 404


def test_user_role_only_creates_orders():
    """Staff user can create order but cannot read admin-only dashboards."""
    _ensure_user_account()
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"username": "staff", "password": "staff123"})
        assert login.status_code == 200
        products = client.get("/api/products")
        assert products.status_code == 200
        pid = products.json()[0]["id"]
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "Khach le",
                "vat_rate": 10,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
        )
        assert created.status_code == 200
        assert client.get("/api/dashboard").status_code == 403
        assert client.patch(f"/api/orders/{created.json()['id']}", json={"customer_name": "x", "vat_rate": 10, "lines": [{"product_id": pid, "quantity": 1}]}).status_code == 403
        assert client.get("/api/users").status_code == 403
