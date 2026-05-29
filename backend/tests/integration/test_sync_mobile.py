"""Integration tests for mobile auth and ACID sync API."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _mobile_login(client: TestClient, username: str = "admin", password: str = "admin123") -> str:
    """Login via mobile endpoint and return access token."""
    r = client.post("/api/auth/mobile/login", json={"username": username, "password": password})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["user"]["username"] == username
    return body["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    """Build Bearer header for sync calls."""
    return {"Authorization": f"Bearer {token}"}


def test_mobile_login_and_bearer_me():
    """Mobile login returns tokens usable with Bearer on /auth/me."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        me = client.get("/api/auth/me", headers=_auth_headers(token))
        assert me.status_code == 200
        assert me.json()["user"]["role"] == "admin"


def test_sync_push_order_note_idempotent():
    """Duplicate client_mutation_id is applied once only."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        headers = _auth_headers(token)
        mid = str(uuid4())
        cid = str(uuid4())
        body = {
            "client_mutation_id": mid,
            "entity": "order_note",
            "operation": "create",
            "client_id": cid,
            "payload": {"title": "Offline note", "raw_text": "Giao 2 bình"},
        }
        first = client.post("/api/sync/push", json=body, headers=headers)
        second = client.post("/api/sync/push", json=body, headers=headers)
        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["status"] == "applied"
        assert second.json()["status"] == "applied"
        assert first.json()["server_id"] == second.json()["server_id"]


def test_sync_sequential_order_updates_and_change_log():
    """Two admin updates queue sequentially; change log records both."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        headers = _auth_headers(token)
        pid = client.post(
            "/api/products",
            json={
                "name": f"Sync SKU {uuid4().hex[:6]}",
                "sku": f"SYNC-{uuid4().hex[:8]}",
                "cost_price": 100000,
                "sell_price": 120000,
                "stock_quantity": 50,
                "low_stock_threshold": 5,
            },
            headers=headers,
        ).json()["id"]
        create = client.post(
            "/api/sync/push",
            json={
                "client_mutation_id": str(uuid4()),
                "entity": "sales_order",
                "operation": "create",
                "client_id": str(uuid4()),
                "payload": {
                    "customer_name": "Sync Customer",
                    "phone": "0900111222",
                    "vat_rate": 0,
                    "lines": [{"product_id": pid, "quantity": 1}],
                },
            },
            headers=headers,
        )
        assert create.status_code == 200
        assert create.json()["status"] == "applied"
        order_id = create.json()["server_id"]

        base_payload = {
            "customer_name": "Sync Customer",
            "phone": "0900111222",
            "vat_rate": 0,
            "lines": [{"product_id": pid, "quantity": 1}],
        }
        u1 = client.post(
            "/api/sync/push",
            json={
                "client_mutation_id": str(uuid4()),
                "entity": "sales_order",
                "operation": "update",
                "server_id": order_id,
                "payload": {**base_payload, "borrowed_shell_units": 1},
            },
            headers=headers,
        )
        u2 = client.post(
            "/api/sync/push",
            json={
                "client_mutation_id": str(uuid4()),
                "entity": "sales_order",
                "operation": "update",
                "server_id": order_id,
                "payload": {**base_payload, "borrowed_shell_units": 3},
            },
            headers=headers,
        )
        assert u1.json()["status"] == "applied"
        assert u2.json()["status"] == "applied"

        log = client.get(f"/api/orders/{order_id}/change-log", headers=headers)
        assert log.status_code == 200
        entries = log.json()
        assert len(entries) >= 2
        assert any(e["source"] == "sync" for e in entries)


def test_sync_push_admin_complete_delivery_status_only():
    """Admin may mark completed via minimal sync payload (same as staff)."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        headers = _auth_headers(token)
        pid = client.post(
            "/api/products",
            json={
                "name": f"Complete SKU {uuid4().hex[:6]}",
                "sku": f"COMP-{uuid4().hex[:8]}",
                "cost_price": 100000,
                "sell_price": 120000,
                "stock_quantity": 50,
                "low_stock_threshold": 5,
            },
            headers=headers,
        ).json()["id"]
        create = client.post(
            "/api/sync/push",
            json={
                "client_mutation_id": str(uuid4()),
                "entity": "sales_order",
                "operation": "create",
                "client_id": str(uuid4()),
                "payload": {
                    "customer_name": "Complete Customer",
                    "phone": "0900333444",
                    "vat_rate": 0,
                    "lines": [{"product_id": pid, "quantity": 1}],
                },
            },
            headers=headers,
        )
        assert create.status_code == 200
        order_id = create.json()["server_id"]
        done = client.post(
            "/api/sync/push",
            json={
                "client_mutation_id": str(uuid4()),
                "entity": "sales_order",
                "operation": "update",
                "server_id": order_id,
                "payload": {"delivery_status": "completed"},
            },
            headers=headers,
        )
        assert done.status_code == 200
        assert done.json()["status"] == "applied"
        order = client.get(f"/api/orders/{order_id}", headers=headers)
        assert order.json()["delivery_status"] == "completed"


def test_sync_push_rejects_sales_order_response_shape():
    """Cached pull JSON (id/order_code/order_items) must not pass as update payload."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        headers = _auth_headers(token)
        bad = client.post(
            "/api/sync/push",
            json={
                "client_mutation_id": str(uuid4()),
                "entity": "sales_order",
                "operation": "update",
                "server_id": 1,
                "payload": {"id": 1, "order_code": "ORD-001", "delivery_status": "completed"},
            },
            headers=headers,
        )
        assert bad.status_code == 200
        assert bad.json()["status"] == "rejected"
        assert "lines" in (bad.json().get("error_message") or "")


def test_sync_pull_emits_delete_on_soft_delete():
    """Soft-deleted orders appear in pull as ``op=delete`` for mobile cache purge."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        headers = _auth_headers(token)
        pid = client.post(
            "/api/products",
            json={
                "name": f"Del SKU {uuid4().hex[:6]}",
                "sku": f"DEL-{uuid4().hex[:8]}",
                "cost_price": 100000,
                "sell_price": 120000,
                "stock_quantity": 50,
                "low_stock_threshold": 5,
            },
            headers=headers,
        ).json()["id"]
        created = client.post(
            "/api/orders",
            json={
                "customer_name": "To Delete",
                "phone": "0900555666",
                "vat_rate": 0,
                "lines": [{"product_id": pid, "quantity": 1}],
            },
            headers=headers,
        )
        assert created.status_code == 200
        oid = created.json()["id"]
        cursor_before = client.get("/api/sync/pull", params={"cursor": "0", "entities": "sales_orders"}, headers=headers).json()["cursor"]
        assert client.delete(f"/api/orders/{oid}", headers=headers).status_code == 200
        pull = client.get(
            "/api/sync/pull",
            params={"cursor": cursor_before, "entities": "sales_orders"},
            headers=headers,
        )
        assert pull.status_code == 200
        deletes = [c for c in pull.json()["changes"] if c.get("entity") == "sales_order" and c.get("op") == "delete"]
        assert any(c.get("server_id") == oid for c in deletes)
        ids = client.get("/api/sync/sales-order-ids", headers=headers).json()["ids"]
        assert oid not in ids


def test_sync_pull_returns_products():
    """Pull endpoint returns cursor and change list for admin."""
    with TestClient(app) as client:
        token = _mobile_login(client)
        headers = _auth_headers(token)
        r = client.get("/api/sync/pull", params={"cursor": "0", "entities": "products"}, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert "cursor" in body
        assert isinstance(body["changes"], list)
