"""Per-order debt ledger helpers (isolated outstanding, no phone-level FIFO)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import DebtAccount, DebtLedgerEntry, DebtPayment, SalesOrder
from app.services import sales


def delivery_month_date_bounds(month: str) -> tuple[date, date]:
    """Inclusive calendar bounds for ``YYYY-MM`` delivery-date filters."""
    year_s, mon_s = month.split("-", 1)
    year, mon = int(year_s), int(mon_s)
    start = date(year, mon, 1)
    if mon == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, mon + 1, 1) - timedelta(days=1)
    return start, end


def ledger_net_for_order(db: Session, order_id: int) -> Decimal:
    """Net signed ledger balance for one sales order."""
    net = db.scalar(
        select(func.coalesce(func.sum(DebtLedgerEntry.amount_signed), 0)).where(
            or_(
                DebtLedgerEntry.sales_order_id == order_id,
                (
                    DebtLedgerEntry.sales_order_id.is_(None)
                    & (DebtLedgerEntry.reference_type == "sales_order")
                    & (DebtLedgerEntry.reference_id == str(order_id))
                ),
            )
        )
    )
    return Decimal(str(net or 0))


def recompute_single_order_outstanding(db: Session, order_id: int) -> None:
    """Set ``outstanding_amount`` from ledger rows scoped to one order."""
    order = db.get(SalesOrder, order_id)
    if order is None or order.deleted_at is not None:
        return
    net = ledger_net_for_order(db, order_id)
    order.outstanding_amount = max(Decimal("0"), net)


def recompute_account_balance_from_orders(db: Session, account: DebtAccount) -> None:
    """Derive account cache from sum of active order outstanding on the same phone."""
    balance = db.scalar(
        select(func.coalesce(func.sum(SalesOrder.outstanding_amount), 0)).where(
            sales.active_order_clause(SalesOrder.phone == account.customer_key)
        )
    )
    account.current_balance = Decimal(str(balance or 0))
    account.status = "closed" if account.current_balance <= 0 else "active"


def recompute_all_order_outstanding(db: Session) -> None:
    """Rebuild every active order outstanding and account balances from per-order ledger."""
    order_ids = db.scalars(
        select(SalesOrder.id).where(
            sales.active_order_clause(
                or_(
                    SalesOrder.outstanding_amount > 0,
                    SalesOrder.payment_mode.in_(("debt", "partial")),
                )
            )
        )
    ).all()
    linked_ids = db.scalars(
        select(DebtLedgerEntry.sales_order_id).where(DebtLedgerEntry.sales_order_id.is_not(None)).distinct()
    ).all()
    for oid in set(order_ids) | {x for x in linked_ids if x is not None}:
        recompute_single_order_outstanding(db, int(oid))
    for account in db.scalars(select(DebtAccount)).all():
        recompute_account_balance_from_orders(db, account)


def backfill_order_debt_links(db: Session) -> None:
    """One-time link of legacy ledger/payment rows to ``sales_order_id`` and recompute balances."""
    for entry in db.scalars(select(DebtLedgerEntry).where(DebtLedgerEntry.sales_order_id.is_(None))).all():
        if entry.reference_type == "sales_order" and entry.reference_id and str(entry.reference_id).isdigit():
            entry.sales_order_id = int(str(entry.reference_id))
        elif entry.reference_type == "sales_order_delete" and entry.reference_id and str(entry.reference_id).isdigit():
            entry.sales_order_id = int(str(entry.reference_id))

    payments = db.scalars(
        select(DebtPayment)
        .where(DebtPayment.sales_order_id.is_(None))
        .order_by(DebtPayment.paid_at.asc(), DebtPayment.id.asc())
    ).all()
    for payment in payments:
        account = db.get(DebtAccount, payment.debt_account_id)
        if account is None:
            continue
        ledger = db.scalar(
            select(DebtLedgerEntry).where(
                DebtLedgerEntry.reference_type == "debt_payment",
                DebtLedgerEntry.reference_id == str(payment.id),
            )
        )
        orders = db.scalars(
            select(SalesOrder)
            .where(sales.active_order_clause(SalesOrder.phone == account.customer_key))
            .order_by(SalesOrder.created_at.asc(), SalesOrder.id.asc())
        ).all()
        remaining = Decimal(str(payment.amount))
        for order in orders:
            if remaining <= 0:
                break
            cap = ledger_net_for_order(db, order.id)
            if cap <= 0:
                continue
            if remaining >= cap:
                payment.sales_order_id = order.id
                if ledger is not None:
                    ledger.sales_order_id = order.id
                remaining -= cap
                break
            payment.sales_order_id = order.id
            if ledger is not None:
                ledger.sales_order_id = order.id
            remaining = Decimal("0")
            break
        if payment.sales_order_id is None and orders:
            payment.sales_order_id = orders[0].id
            if ledger is not None:
                ledger.sales_order_id = orders[0].id

    write_offs = db.scalars(
        select(DebtLedgerEntry).where(
            DebtLedgerEntry.entry_type == "write_off",
            DebtLedgerEntry.sales_order_id.is_(None),
        )
    ).all()
    for entry in write_offs:
        account = db.get(DebtAccount, entry.debt_account_id)
        if account is None:
            continue
        order = db.scalar(
            select(SalesOrder)
            .where(sales.active_order_clause(SalesOrder.phone == account.customer_key))
            .order_by(SalesOrder.created_at.asc(), SalesOrder.id.asc())
            .limit(1)
        )
        if order is not None:
            entry.sales_order_id = order.id

    recompute_all_order_outstanding(db)
    db.commit()
