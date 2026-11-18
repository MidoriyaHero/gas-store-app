"""Extract orders from a photo of a handwritten order sheet via an OpenAI-compatible VLM (OpenRouter).

Each line on the sheet (plus its continuation lines) is one order. One chat-completion call does both OCR and
field extraction; the JSON answer is validated with Pydantic and post-checked against the active product catalog.
"""

from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.request
from typing import Any

from pydantic import ValidationError

from app.config import Settings
from app.models import Product
from app.schemas import OrderDraftExtraction, OrderSheetExtraction
from app.timezone import business_date_now


class OcrNotConfiguredError(RuntimeError):
    """OCR cannot run because required settings (API key, models) are missing."""


class OcrExtractionError(RuntimeError):
    """The VLM call failed or returned unusable output; message is shown to admins."""


_JSON_SHAPE = """
Định dạng JSON bắt buộc (mọi field đều có thể null nếu không đọc được):
{
  "delivery_date": "YYYY-MM-DD" | null,
  "orders": [
    {
      "customer_name": string | null,
      "phone": string | null,
      "address": string | null,
      "note": string | null,
      "delivery_date": "YYYY-MM-DD" | null,
      "customer_segment": "wholesale" | "restaurant" | "retail" | null,
      "total_amount": number (VND) | null,
      "debt_amount": number (VND) | null,
      "paid_amount": number (VND) | null,
      "borrowed_shell_units": integer | null,
      "lines": [{"raw_text": string, "product_id": integer | null, "quantity": integer | null}],
      "transcript": string,
      "warnings": [string]
    }
  ]
}
"""


def _system_prompt() -> str:
    today = business_date_now()
    return (
        "Ảnh là một trang sổ ghi đơn gas viết tay bằng tiếng Việt của cửa hàng. "
        "Mỗi dòng (thường bắt đầu bằng dấu \"+\" hoặc tên khách) là MỘT đơn; ghi chú có thể kéo xuống "
        "dòng dưới và vẫn thuộc đơn phía trên. Tạo một phần tử trong `orders` cho mỗi đơn, đúng thứ tự từ "
        "trên xuống.\n"
        "Bỏ qua dòng bị gạch ngang (đơn đã huỷ). Không tạo đơn cho dòng kiểm kê/tổng kết như \"Vỏ: 49\", "
        "\"galon: 37\" ở đầu trang hay các phép tính \"Nợ: …\", \"Vỏ: …\", tổng tiền ở cuối trang.\n"
        "Ngày ở đầu trang (dd/mm) ghi vào `delivery_date` cấp ngoài (cả trang là đơn của ngày đó); "
        "`delivery_date` của từng đơn để null.\n"
        "Với mỗi đơn: `transcript` là chữ gốc của riêng đơn đó; `customer_name` là tên, biệt danh hoặc nơi "
        "giao (vd \"Út Trúc\", \"Mẹ Tuyết\", \"Tạp hoá Phú Quý\"). Không được bịa: chỗ nào không chắc thì để "
        "null và ghi lý do (bằng tiếng Việt) vào `warnings` của đơn đó.\n"
        "Ký hiệu: \"B\" = bình gas (vd \"1B\" = 1 bình); \"lon\" = lon gas mini; \"vỏ\" = vỏ bình; "
        "\"CK\" = khách chuyển khoản (đã trả, ghi \"CK\" vào `note`). Số nhỏ viết trên cao cạnh tên là số "
        "thứ tự đơn trong ngày, không phải số lượng.\n"
        "Mỗi món là MỘT phần tử riêng trong `lines`: `raw_text` là chữ gốc của món, `quantity` là số lượng. "
        "Ví dụ \"1B 500 5 lon 75\" là 2 món: {\"raw_text\": \"1B 500\", \"quantity\": 1} và "
        "{\"raw_text\": \"5 lon 75\", \"quantity\": 5}.\n"
        "`product_id` chọn từ danh mục sản phẩm; nếu giấy không ghi loại (vd chỉ ghi \"1B\"), chọn sản phẩm "
        "có giá lẻ gần nhất với đơn giá ghi trên giấy (tiền ÷ số lượng); danh mục không có loại hàng đó "
        "(vd không có \"lon\") thì để null.\n"
        "Tiền trong sổ viết theo nghìn đồng: \"500\" = 500000, \"2670\" = 2670000, \"200k\" = 200000, "
        "\"1tr2\" = 1200000. Số ở cột bên phải là tiền của đơn → `total_amount`.\n"
        "`debt_amount` là tiền ghi cạnh chữ \"nợ\", \"thiếu\", \"chưa trả\", \"chưa lấy tiền\" của đơn; "
        "`paid_amount` là tiền khách đã trả nếu có ghi (vd \"Trả 100\" = 100000).\n"
        "`borrowed_shell_units` là số \"vỏ nợ\", \"mượn vỏ\".\n"
        "`customer_segment`: \"quán\", \"nhà hàng\" → \"restaurant\"; \"đại lý\", \"sỉ\" → \"wholesale\"; "
        "\"tạp hoá\" hoặc không rõ thì null.\n"
        f"Hôm nay là {today.isoformat()}. Ngày ghi dạng dd/mm thì dùng năm {today.year}.\n"
        f"{_JSON_SHAPE}\n"
        "Chỉ trả về đúng một object JSON, không kèm giải thích."
    )


def _post_chat_completion(body: dict[str, Any], *, base_url: str, api_key: str, timeout_sec: float) -> tuple[str, str]:
    """POST ``{base_url}/chat/completions``; return ``(choices[0].message.content, response["model"])``."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Title": "Gas Store OCR",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise OcrExtractionError("Model OCR miễn phí đang hết lượt, thử lại sau") from e
        detail = e.read().decode("utf-8", errors="replace")
        raise OcrExtractionError(f"VLM HTTP {e.code}: {detail[:300]}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise OcrExtractionError(f"Không gọi được dịch vụ OCR: {e}") from e
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise OcrExtractionError(f"VLM trả về phản hồi không phải JSON: {raw[:300]}") from e
    err = data.get("error") if isinstance(data, dict) else None
    if err:
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise OcrExtractionError(f"VLM lỗi: {msg}")
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        content = None
    if not content or not str(content).strip():
        raise OcrExtractionError("VLM không trả nội dung")
    return str(content), str(data.get("model") or "")


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$")


def _parse_content(content: str) -> OrderSheetExtraction:
    text = _FENCE_RE.sub("", content.strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        text = text[start : end + 1]
    try:
        return OrderSheetExtraction.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as e:
        raise OcrExtractionError(f"VLM trả về JSON không hợp lệ: {str(e)[:300]}") from e


def _catalog_line(p: Product) -> str:
    price = f" | giá lẻ={p.sell_price:.0f}" if p.sell_price is not None else ""
    return f"id={p.id} | {p.name} | sku={p.sku or '-'}{price}"


def ocr_credentials(settings: Settings) -> tuple[str, list[str]]:
    """Return ``(api_key, models)`` or raise ``OcrNotConfiguredError`` (checked before queueing work)."""
    api_key = settings.openrouter_api_key.strip()
    if not api_key:
        raise OcrNotConfiguredError("OCR chưa cấu hình: thiếu OPENROUTER_API_KEY")
    models = [m.strip() for m in settings.ocr_llm_models.split(",") if m.strip()]
    if not models:
        raise OcrNotConfiguredError("OCR chưa cấu hình: OCR_LLM_MODELS rỗng")
    return api_key, models


def extract_orders_from_image(
    image_bytes: bytes, mime_type: str, products: list[Product], *, settings: Settings
) -> tuple[list[OrderDraftExtraction], str, str]:
    """Return ``(one validated extraction per order on the sheet, raw content string, model actually used)``."""
    api_key, models = ocr_credentials(settings)

    catalog = "\n".join(_catalog_line(p) for p in products) or "(trống)"
    b64 = base64.b64encode(image_bytes).decode("ascii")
    body: dict[str, Any] = {
        "model": models[0],
        "models": models,
        "temperature": 0,
        # A full page holds ~25 orders; reasoning models also spend tokens before answering.
        "max_tokens": 16000,
        "reasoning": {"exclude": True},
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Danh mục sản phẩm:\n{catalog}"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                ],
            },
        ],
    }
    content, model_used = _post_chat_completion(
        body, base_url=settings.ocr_llm_base_url, api_key=api_key, timeout_sec=settings.ocr_llm_timeout_sec
    )
    sheet = _parse_content(content)
    if not sheet.orders:
        raise OcrExtractionError("Không tìm thấy đơn nào trong ảnh")

    active_ids = {p.id for p in products}
    for order in sheet.orders:
        # A page is one day's orders; per-order dates are mostly misread superscript sequence numbers.
        if sheet.delivery_date is not None or order.delivery_date is None:
            order.delivery_date = sheet.delivery_date
        for line in order.lines:
            if line.product_id is not None and line.product_id not in active_ids:
                line.product_id = None
                order.warnings.append(f"Không khớp sản phẩm: {line.raw_text}")
        if order.phone is not None:
            order.phone = re.sub(r"[^\d+]", "", order.phone) or None
    return sheet.orders, content, model_used or models[0]
