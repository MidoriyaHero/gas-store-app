"""Persist inbound stock receipts and optional opening snapshots."""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Product, StockReceipt


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


def apply_inbound_receipt(
    db: Session,
    *,
    product_id: int,
    receipt_date: date,
    quantity: int,
    note: str | None,
    created_by_user_id: int | None,
) -> StockReceipt:
    """Append ``inbound`` receipt and increment ``Product.stock_quantity``."""
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
    return row
