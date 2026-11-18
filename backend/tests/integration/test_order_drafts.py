"""Integration tests for OCR order drafts (VLM HTTP call is faked)."""

import json
import time
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal
from app.main import app
from app.models import OrderDraft
from app.services import order_ocr

# 1×1 transparent PNG.
_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)
_MODEL = "nvidia/nemotron-3.5-super-vl:free"


def _login_admin(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200


def _create_product(client: TestClient) -> int:
    r = client.post(
        "/api/products",
        json={
            "name": "OCR Gas 12kg",
            "sku": f"SKU-{uuid4().hex[:10]}",
            "cost_price": 100000,
            "sell_price": 120000,
            "stock_quantity": 999,
            "low_stock_threshold": 5,
        },
    )
    assert r.status_code == 200
    return r.json()["id"]


def _fake_returning(content: str, delay_sec: float = 0.0):
    def fake(body, *, base_url, api_key, timeout_sec):
        time.sleep(delay_sec)
        return content, _MODEL

    return fake


def _sheet(*orders: dict, delivery_date: str | None = None) -> str:
    return json.dumps({"delivery_date": delivery_date, "orders": list(orders)})


def _upload(client: TestClient, name: str = "sheet.png", data: bytes = _PNG, mime: str = "image/png"):
    return client.post("/api/order-drafts", files={"file": (name, data, mime)})


def _drafts_of(client: TestClient, placeholder: dict) -> list[dict]:
    """Drafts read from the placeholder's photo (TestClient runs the background OCR before returning)."""
    rows = client.get("/api/order-drafts", params={"include_converted": True}).json()
    return [d for d in rows if d["image_url"] == placeholder["image_url"]]


def _image_path(draft: dict) -> Path:
    return Path(get_settings().media_root).resolve() / draft["image_url"].removeprefix("/media/")


@pytest.fixture
def ocr_key(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    return monkeypatch


def test_sheet_becomes_one_draft_per_order(ocr_key: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_product(client)
        content = _sheet(
            {
                "customer_name": "Chị Lan",
                "phone": "09 0123-4567",
                "debt_amount": 100000,
                "lines": [{"raw_text": "2 bình 12kg", "product_id": pid, "quantity": 2}],
                "transcript": "Chị Lan 09 0123-4567 2B nợ 100",
            },
            {
                "customer_name": "Út Trúc",
                "delivery_date": "2026-11-12",
                "total_amount": 500000,
                "lines": [{"raw_text": "1B", "product_id": 999999, "quantity": 1}],
            },
            delivery_date="2026-11-11",
        )
        # Slow enough that rows inserted by the background task get a later timestamp than the placeholder.
        ocr_key.setattr(order_ocr, "_post_chat_completion", _fake_returning(f"```json\n{content}\n```", delay_sec=1.1))
        r = _upload(client)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "processing"
        first, second = _drafts_of(client, r.json())
        assert first["status"] == second["status"] == "parsed"
        assert first["model_name"] == _MODEL
        assert first["image_url"] == second["image_url"]
        assert _image_path(first).is_file()

        a, b = first["extraction"], second["extraction"]
        assert a["customer_name"] == "Chị Lan"
        assert a["phone"] == "0901234567"
        assert a["lines"][0]["product_id"] == pid
        assert float(a["debt_amount"]) == 100000
        # The page date applies to every order, overriding per-order dates (misread superscripts).
        assert a["delivery_date"] == "2026-11-11"
        assert b["delivery_date"] == "2026-11-11"
        assert float(b["total_amount"]) == 500000
        # Unknown product ids are cleared with a warning.
        assert b["lines"][0]["product_id"] is None
        assert any("Không khớp sản phẩm" in w for w in b["warnings"])

        # Sheet order must hold even though the background task inserts the later orders after the placeholder.
        listed = [d["id"] for d in client.get("/api/order-drafts").json()]
        assert listed.index(first["id"]) < listed.index(second["id"])

        # Deleting one draft keeps the shared photo for the other; deleting the last removes it.
        assert client.delete(f"/api/order-drafts/{first['id']}").status_code == 200
        assert _image_path(second).is_file()
        assert client.delete(f"/api/order-drafts/{second['id']}").status_code == 200
        assert not _image_path(second).exists()


def test_reparse_replaces_all_drafts_of_the_photo(ocr_key: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        _login_admin(client)
        ocr_key.setattr(order_ocr, "_post_chat_completion", _fake_returning(_sheet({"customer_name": "A"}, {"customer_name": "B"})))
        old = _drafts_of(client, _upload(client).json())
        assert len(old) == 2
        ocr_key.setattr(order_ocr, "_post_chat_completion", _fake_returning(_sheet({"customer_name": "A2"})))
        r = client.post(f"/api/order-drafts/{old[1]['id']}/reparse", json={})
        assert r.status_code == 200
        assert r.json()["status"] == "processing"
        assert [d["extraction"]["customer_name"] for d in _drafts_of(client, r.json())] == ["A2"]
        assert client.get(f"/api/order-drafts/{old[1]['id']}").status_code == 404


def test_invalid_json_is_stored_as_error(ocr_key: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        _login_admin(client)
        ocr_key.setattr(order_ocr, "_post_chat_completion", _fake_returning("không phải json"))
        r = _upload(client)
        assert r.status_code == 200
        [draft] = _drafts_of(client, r.json())
        assert draft["status"] == "error"
        assert draft["error_message"].startswith("VLM trả về JSON không hợp lệ")


def test_sheet_without_orders_is_stored_as_error(ocr_key: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        _login_admin(client)
        ocr_key.setattr(order_ocr, "_post_chat_completion", _fake_returning(_sheet()))
        [draft] = _drafts_of(client, _upload(client).json())
        assert draft["status"] == "error"
        assert draft["error_message"] == "Không tìm thấy đơn nào trong ảnh"


def test_rate_limit_error_is_stored_verbatim(ocr_key: pytest.MonkeyPatch) -> None:
    msg = "Model OCR miễn phí đang hết lượt, thử lại sau"

    def fake(body, *, base_url, api_key, timeout_sec):
        raise order_ocr.OcrExtractionError(msg)

    with TestClient(app) as client:
        _login_admin(client)
        ocr_key.setattr(order_ocr, "_post_chat_completion", fake)
        [draft] = _drafts_of(client, _upload(client).json())
        assert draft["status"] == "error"
        assert draft["error_message"] == msg


def test_missing_key_returns_503_without_row(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(order_ocr, "_post_chat_completion", _fake_returning(_sheet({"customer_name": "A"})))
    with TestClient(app) as client:
        _login_admin(client)
        with SessionLocal() as db:
            before = db.scalar(select(func.count(OrderDraft.id)))
        r = _upload(client)
        assert r.status_code == 503
        with SessionLocal() as db:
            assert db.scalar(select(func.count(OrderDraft.id))) == before


def test_convert_creates_debt_order_once(ocr_key: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        _login_admin(client)
        pid = _create_product(client)
        content = _sheet(
            {"lines": [{"raw_text": "1 bình", "product_id": pid, "quantity": 1}]},
            {"customer_name": "Đơn khác cùng ảnh"},
        )
        ocr_key.setattr(order_ocr, "_post_chat_completion", _fake_returning(content))
        draft_id, sibling_id = (d["id"] for d in _drafts_of(client, _upload(client).json()))
        order_body = {
            "customer_name": "Khách OCR",
            "phone": f"09{uuid4().int % 10**8:08d}",
            "vat_rate": 0,
            "customer_segment": "retail",
            "payment_mode": "debt",
            "lines": [{"product_id": pid, "quantity": 1}],
        }
        conv = client.post(f"/api/order-drafts/{draft_id}/convert", json=order_body)
        assert conv.status_code == 200, conv.text
        oid = conv.json()["id"]

        debts = client.get("/api/debt-orders", params={"status": "all"})
        assert debts.status_code == 200
        row = next(d for d in debts.json() if d["id"] == oid)
        assert float(row["outstanding_amount"]) > 0

        got = client.get(f"/api/order-drafts/{draft_id}").json()
        assert got["status"] == "converted"
        assert got["sales_order_id"] == oid
        listed = [d["id"] for d in client.get("/api/order-drafts").json()]
        assert draft_id not in listed
        assert sibling_id in listed

        assert client.post(f"/api/order-drafts/{draft_id}/convert", json=order_body).status_code == 409
        assert client.delete(f"/api/order-drafts/{draft_id}").status_code == 409
        # Re-reading the photo would duplicate the saved order.
        assert client.post(f"/api/order-drafts/{sibling_id}/reparse", json={}).status_code == 409


def test_rejects_non_image_upload(ocr_key: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        _login_admin(client)
        r = _upload(client, name="note.txt", data=b"hello", mime="text/plain")
        assert r.status_code == 400


def test_startup_turns_interrupted_processing_into_error() -> None:
    with SessionLocal() as db:
        admin_id = db.scalar(select(OrderDraft.created_by_user_id).limit(1)) or 1
        row = OrderDraft(created_by_user_id=admin_id, image_path="order-drafts/x/gone.jpg", status="processing", extraction={})
        db.add(row)
        db.commit()
        row_id = row.id
    with TestClient(app) as client:
        _login_admin(client)
        got = client.get(f"/api/order-drafts/{row_id}").json()
        assert got["status"] == "error"
        assert "Đọc lại" in got["error_message"]
        client.delete(f"/api/order-drafts/{row_id}")
