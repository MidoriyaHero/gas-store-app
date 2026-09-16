"""Persist inbound stock receipts and optional opening snapshots."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DailyCylinderAudit, Product, StockReceipt
from app.timezone import utc_now


def record_opening_receipt(
    db: Session,
    *,
    product_id: int,
    receipt_date: date,
    quantity: int,
    note: str,
    created_by_user_id: int | None = None,
) -> StockReceipt | None:
    """Insert ``opening`` row without changing ``Product.stock_quantity`` (baseline only)."""
    if quantity < 1:
        return None
    row = StockReceipt(
        product_id=product_id,
        receipt_date=receipt_date,
        quantity=quantity,
        receipt_kind="opening",
        note=note,
        created_by_user_id=created_by_user_id,
    )
    db.add(row)
    return row


def inbound_units_on_date(db: Session, receipt_date: date) -> int:
    """Sum inbound cylinder qty recorded on ``receipt_date`` (opening rows excluded)."""
    total = db.scalar(
        select(func.coalesce(func.sum(StockReceipt.quantity), 0)).where(
            StockReceipt.receipt_kind == "inbound",
            StockReceipt.receipt_date == receipt_date,
        )
    )
    return int(total or 0)


def sync_audit_import_full(
    db: Session,
    receipt_date: date,
    *,
    created_by_user_id: int | None = None,
) -> DailyCylinderAudit:
    """Set ``DailyCylinderAudit.import_full`` to the inbound receipt total for that day."""
    qty = inbound_units_on_date(db, receipt_date)
    row = db.scalar(select(DailyCylinderAudit).where(DailyCylinderAudit.business_date == receipt_date))
    if row is None:
        row = DailyCylinderAudit(business_date=receipt_date, created_by_user_id=created_by_user_id, import_full=qty)
        db.add(row)
        db.flush()
        return row
    row.import_full = qty
    row.updated_at = utc_now()
    return row


def apply_inbound_receipt(
    db: Session,
    *,
    product_id: int,
    receipt_date: date,
    quantity: int,
    note: str | None,
    created_by_user_id: int | None,
) -> StockReceipt:
    """Append ``inbound`` receipt, increment SKU stock, and sync daily ``import_full``."""
    if quantity < 1:
        raise ValueError("quantity must be at least 1")
    p = db.get(Product, product_id)
    if p is None:
        raise ValueError("Product not found")
    row = StockReceipt(
        product_id=product_id,
        receipt_date=receipt_date,
        quantity=quantity,
        receipt_kind="inbound",
        note=note,
        created_by_user_id=created_by_user_id,
    )
    db.add(row)
    p.stock_quantity += quantity
    db.flush()
    sync_audit_import_full(db, receipt_date, created_by_user_id=created_by_user_id)
    return row
