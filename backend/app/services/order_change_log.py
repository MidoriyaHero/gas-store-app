"""Append-only order edit audit written inside the same DB transaction as updates."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import OrderChangeLog, SalesOrder


def order_snapshot(order: SalesOrder) -> dict[str, Any]:
    """Compact JSON-safe snapshot for change log."""
    return {
        "order_code": order.order_code,
        "customer_name": order.customer_name,
        "phone": order.phone,
        "delivery_status": order.delivery_status,
        "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
        "total": str(order.total),
        "borrowed_shell_units": order.borrowed_shell_units,
        "assigned_to_user_id": order.assigned_to_user_id,
        "line_count": len(order.lines) if order.lines else 0,
    }


def record_order_change(
    db: Session,
    *,
    order: SalesOrder,
    before: SalesOrder | dict[str, Any] | None,
    changed_by_user_id: int | None,
    source: str,
    mutation_id: str | None = None,
    summary: str | None = None,
) -> None:
    """Insert ``order_change_log`` row; caller must commit."""
    if before is None:
        before_json = None
    elif isinstance(before, dict):
        before_json = before
    else:
        before_json = order_snapshot(before)
    after_json = order_snapshot(order)
    if summary is None and before_json is not None:
        keys = [k for k in after_json if before_json.get(k) != after_json.get(k)]
        summary = ", ".join(keys) if keys else "update"
    db.add(
        OrderChangeLog(
            order_id=order.id,
            changed_by_user_id=changed_by_user_id,
            source=source[:16],
            mutation_id=mutation_id,
            summary=summary,
            before_json=before_json,
            after_json=after_json,
        )
    )
