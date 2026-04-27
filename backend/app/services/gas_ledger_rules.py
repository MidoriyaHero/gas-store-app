"""Eligibility rules for rows exported to ``sổ gas`` (gas ledger CSV / JSON)."""

from app.models import SalesOrder, SalesOrderItem


def _non_empty_text(value: str | None) -> bool:
    """Return True when ``value`` contains at least one non-whitespace character."""
    return bool(value and value.strip())


def sales_order_header_complete_for_gas_ledger(order: SalesOrder) -> bool:
    """
    Return True when order-level columns required by the gas ledger are present.

    These map to SĐT khách, địa chỉ (riêng), and ngày giao on the ledger sheet.
    """
    return (
        _non_empty_text(order.phone)
        and order.delivery_date is not None
        and _non_empty_text(order.address)
    )


def sales_order_item_complete_for_gas_ledger(item: SalesOrderItem) -> bool:
    """
    Return True when line-level cylinder fields required by the gas ledger are present.
    """
    return (
        _non_empty_text(item.owner_name)
        and _non_empty_text(item.cylinder_type)
        and _non_empty_text(item.cylinder_serial)
        and item.inspection_expiry is not None
        and _non_empty_text(item.import_source)
        and item.import_date is not None
    )


def order_line_eligible_for_gas_ledger(order: SalesOrder, item: SalesOrderItem) -> bool:
    """
    Return True when this order line may appear as one row in ``GET /api/gas-ledger``.

    Incomplete lines are omitted from the ledger and per-order gas CSV exports.
    """
    return sales_order_header_complete_for_gas_ledger(order) and sales_order_item_complete_for_gas_ledger(item)


def order_fully_ready_for_gas_ledger(order: SalesOrder) -> bool:
    """
    Return True when every line on the order is eligible (đơn đủ để đưa hết vào sổ gas).
    """
    if not order.lines:
        return False
    return all(order_line_eligible_for_gas_ledger(order, li) for li in order.lines)


def gas_ledger_gap_messages(order: SalesOrder) -> list[str]:
    """
    Return human-readable (Vietnamese) hints for the admin UI when ``gas_ledger_ready`` is false.

    Header checks are listed once; each line lists only its own missing cylinder fields.
    """
    out: list[str] = []
    if not order.lines:
        out.append("Đơn: chưa có dòng hàng.")
        return out

    if not _non_empty_text(order.phone):
        out.append("Đơn: thiếu số điện thoại khách.")
    if not _non_empty_text(order.address):
        out.append("Đơn: thiếu địa chỉ khách.")
    if order.delivery_date is None:
        out.append("Đơn: thiếu ngày giao hàng.")

    for idx, li in enumerate(order.lines, start=1):
        missing_parts: list[str] = []
        if not _non_empty_text(li.owner_name):
            missing_parts.append("chủ sở hữu")
        if not _non_empty_text(li.cylinder_type):
            missing_parts.append("loại chai")
        if not _non_empty_text(li.cylinder_serial):
            missing_parts.append("số sê ri")
        if li.inspection_expiry is None:
            missing_parts.append("hạn kiểm định")
        if not _non_empty_text(li.import_source):
            missing_parts.append("nơi nhập")
        if li.import_date is None:
            missing_parts.append("ngày nhập")
        if missing_parts:
            label = li.product_name.strip() or f"dòng {idx}"
            out.append(f"Mặt hàng {idx} ({label}): thiếu {', '.join(missing_parts)}.")

    return out
