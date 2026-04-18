"""Generate downloadable HTML for ``PHIẾU GIAO HÀNG`` (one section per order line)."""

import html
from datetime import date, datetime

from app.models import SalesOrder, SalesOrderItem
from app.services.invoice_filename import invoice_filename_stem


def _fmt_date(d: date | None) -> str:
    """Format date for display (ISO)."""
    return d.isoformat() if d else "—"


def _fmt_dt(dt: datetime | None) -> str:
    """Format datetime for display."""
    if dt is None:
        return "—"
    if dt.tzinfo is not None:
        return dt.astimezone().strftime("%d/%m/%Y %H:%M")
    return dt.strftime("%d/%m/%Y %H:%M")


def render_delivery_slip_html(order: SalesOrder) -> str:
    """
    Build a self-contained UTF-8 HTML document for saving or printing.

    Each ``SalesOrderItem`` becomes one slip block (page break between blocks).
    """
    customer_lines: list[str] = [order.customer_name]
    if order.address and order.address.strip():
        customer_lines.append(order.address.strip())
    if order.phone:
        customer_lines.append(f"Điện thoại: {order.phone}")
    customer_block = html.escape("\n".join(customer_lines))

    del_day = order.delivery_date if order.delivery_date is not None else order.created_at.date()
    delivery_label = html.escape(del_day.isoformat())
    store_raw = (order.store_contact or "").strip() or "—"
    store_esc = html.escape(store_raw)

    sections: list[str] = []
    lines: list[SalesOrderItem] = list(order.lines)
    for idx, li in enumerate(lines):
        owner = html.escape((li.owner_name or "").strip() or "—")
        ctype = html.escape((li.cylinder_type or "").strip() or "—")
        serial = html.escape((li.cylinder_serial or "").strip() or "—")
        insp = html.escape(_fmt_date(li.inspection_expiry))
        imp_src = html.escape((li.import_source or "").strip() or "—")
        imp_dt = html.escape(_fmt_date(li.import_date))
        pname = html.escape(li.product_name)
        code = html.escape(order.order_code)
        br = "page-break-after: always;" if idx < len(lines) - 1 else ""

        sections.append(
            f"""
<section style="margin-bottom: 48px; {br}">
  <h1 style="text-align:center;font-size:1.25rem;margin-bottom:1.5rem;">PHIẾU GIAO HÀNG</h1>
  <dl style="font-size:0.9rem;line-height:1.5;">
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Chủ sở hữu:</dt><dd>{owner}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Loại chai:</dt><dd>{ctype}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Số sê ri chai:</dt><dd style="font-family:monospace;">{serial}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Hạn kiểm định trên chai:</dt><dd>{insp}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Nơi nhập chai chứa cho cửa hàng:</dt><dd style="white-space:pre-wrap;">{imp_src}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Ngày nhập (chai vào cửa hàng):</dt><dd>{imp_dt}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Tên và địa chỉ khách hàng sử dụng:</dt><dd style="white-space:pre-wrap;">{customer_block}</dd></div>
    <div style="display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #ccc;padding:8px 0;">
      <dt>Ngày giao chai cho khách hàng:</dt><dd>{delivery_label}</dd></div>
  </dl>
  <p style="font-size:0.8rem;color:#444;border:1px dashed #999;padding:10px;margin-top:12px;">
    <strong>Hàng hoá:</strong> {pname} × {li.quantity}
    (Mã đơn: <span style="font-family:monospace;">{code}</span>, tạo lúc {_fmt_dt(order.created_at)})
  </p>
  <div style="margin-top:32px;font-size:0.9rem;">
    <p style="font-weight:600;margin-bottom:8px;">Tên, địa chỉ và điện thoại liên hệ của cửa hàng:</p>
    <p style="min-height:3rem;border-bottom:1px solid #333;white-space:pre-wrap;">{store_esc}</p>
  </div>
</section>"""
        )

    body = "\n".join(sections)
    title_stem = invoice_filename_stem(order.customer_name, order.phone, order.order_code)
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{html.escape(title_stem)}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 12px; }}
    @media print {{ body {{ margin: 0; max-width: none; }} }}
  </style>
</head>
<body>
{body}
</body>
</html>"""
