"""Customer directory: upsert from orders, CRUD, and computed purchase groups."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Customer, CustomerSegment, DebtAccount, SalesOrder
from app.services.phone import normalize_phone
from app.timezone import utc_now

AT_RISK_DAYS = 45
LOYAL_MIN_ORDERS = 3
LOYAL_WINDOW_DAYS = 90
PHONE_TAKEN_MSG = "Số điện thoại đã thuộc khách khác"

_SEGMENT_VALUES = frozenset(item.value for item in CustomerSegment)
ComputedGroup = Literal["loyal", "at_risk", "active"]


class PhoneTakenError(ValueError):
    """Raised when a phone already belongs to another customer row."""

    def __init__(self) -> None:
        super().__init__(PHONE_TAKEN_MSG)


@dataclass(frozen=True)
class CustomerStats:
    """Purchase aggregates used to fill ``CustomerResponse``."""

    last_order_at: datetime | None
    order_count: int
    order_count_90d: int
    outstanding: Decimal


def _strip_opt(val: str | None) -> str | None:
    """Empty string becomes ``None``."""
    if val is None:
        return None
    text = val.strip()
    return text or None


def _aware(dt: datetime | None) -> datetime | None:
    """Treat naive timestamps as UTC so comparisons with ``utc_now()`` are valid."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def computed_group(last_order_at: datetime | None, order_count_90d: int) -> ComputedGroup:
    """loyal / at_risk / active from last purchase and 90-day volume."""
    last = _aware(last_order_at)
    if last is None or utc_now() - last > timedelta(days=AT_RISK_DAYS):
        return "at_risk"
    if order_count_90d >= LOYAL_MIN_ORDERS:
        return "loyal"
    return "active"


def typical_product_name(db: Session, customer_id: int) -> str | None:
    """Most frequent product name on the 10 newest active orders; ties pick the newer order."""
    from app.services.sales import active_order_clause

    orders = (
        db.execute(
            select(SalesOrder)
            .options(joinedload(SalesOrder.lines))
            .where(active_order_clause(SalesOrder.customer_id == customer_id))
            .order_by(SalesOrder.created_at.desc(), SalesOrder.id.desc())
            .limit(10)
        )
        .unique()
        .scalars()
        .all()
    )
    stats: dict[str, tuple[int, datetime]] = {}
    for order in orders:
        for line in order.lines:
            name = line.product_name
            prev = stats.get(name)
            if prev is None:
                stats[name] = (1, order.created_at)
            else:
                newer = order.created_at if order.created_at > prev[1] else prev[1]
                stats[name] = (prev[0] + 1, newer)
    if not stats:
        return None
    return max(stats.items(), key=lambda kv: (kv[1][0], kv[1][1]))[0]


def upsert_customer_from_order(
    db: Session,
    *,
    name: str,
    phone: str,
    address: str | None,
    customer_segment: str | None,
) -> Customer:
    """Create or refresh a customer from an order snapshot; leaves hamlet/notes/assignee untouched."""
    key = normalize_phone(phone)
    row = db.scalar(select(Customer).where(Customer.phone == key))
    segment = customer_segment if customer_segment in _SEGMENT_VALUES else None
    if row is None:
        row = Customer(
            name=name.strip(),
            phone=key,
            address=address,
            customer_segment=segment,
        )
        db.add(row)
        db.flush()
        return row
    row.name = name.strip()
    if address:
        row.address = address
    if segment is not None:
        row.customer_segment = segment
    db.flush()
    return row


def create_customer(
    db: Session,
    *,
    name: str,
    phone: str,
    address: str | None = None,
    hamlet: str | None = None,
    notes: str | None = None,
    customer_segment: str | None = None,
    assigned_to_user_id: int | None = None,
) -> Customer:
    """Insert a directory customer; raises ``PhoneTakenError`` on duplicate phone."""
    from app.services.sales import _resolve_assigned_to_user_id

    key = normalize_phone(phone)
    exists = db.scalar(select(Customer.id).where(Customer.phone == key))
    if exists is not None:
        raise PhoneTakenError()
    if customer_segment is not None and customer_segment not in _SEGMENT_VALUES:
        raise ValueError("Cần chọn tệp khách hàng: đại lý sỉ, quán ăn hoặc khách lẻ")
    row = Customer(
        name=name.strip(),
        phone=key,
        address=_strip_opt(address),
        hamlet=_strip_opt(hamlet),
        notes=_strip_opt(notes),
        customer_segment=customer_segment,
        assigned_to_user_id=_resolve_assigned_to_user_id(db, assigned_to_user_id),
    )
    db.add(row)
    db.flush()
    return row


def update_customer(db: Session, customer_id: int, data: dict) -> Customer:
    """Patch set fields; phone change updates the linked debt account key, not order snapshots."""
    from app.services.sales import _resolve_assigned_to_user_id

    row = db.get(Customer, customer_id)
    if row is None:
        raise LookupError("Không tìm thấy khách")
    if "name" in data and data["name"] is not None:
        stripped = str(data["name"]).strip()
        if not stripped:
            raise ValueError("Tên khách không được trống")
        row.name = stripped
    if "phone" in data and data["phone"] is not None:
        key = normalize_phone(str(data["phone"]))
        other = db.scalar(select(Customer.id).where(Customer.phone == key, Customer.id != customer_id))
        if other is not None:
            raise PhoneTakenError()
        if key != row.phone:
            row.phone = key
            account = db.scalar(select(DebtAccount).where(DebtAccount.customer_id == row.id))
            if account is not None:
                account.customer_key = key
                account.phone = key
    if "address" in data:
        raw = data["address"]
        row.address = _strip_opt(raw) if isinstance(raw, str) else None
    if "hamlet" in data:
        raw = data["hamlet"]
        row.hamlet = _strip_opt(raw) if isinstance(raw, str) else None
    if "notes" in data:
        raw = data["notes"]
        row.notes = _strip_opt(raw) if isinstance(raw, str) else None
    if "customer_segment" in data:
        segment = data["customer_segment"]
        if segment is not None and segment not in _SEGMENT_VALUES:
            raise ValueError("Cần chọn tệp khách hàng: đại lý sỉ, quán ăn hoặc khách lẻ")
        row.customer_segment = segment
    if "assigned_to_user_id" in data:
        row.assigned_to_user_id = _resolve_assigned_to_user_id(db, data["assigned_to_user_id"])
    row.updated_at = utc_now()
    db.flush()
    return row


def load_stats_map(db: Session, customer_ids: list[int]) -> dict[int, CustomerStats]:
    """Batch last-order / counts / outstanding for the given customer ids."""
    from app.services.sales import active_order_clause

    empty = CustomerStats(last_order_at=None, order_count=0, order_count_90d=0, outstanding=Decimal("0"))
    if not customer_ids:
        return {}
    out: dict[int, CustomerStats] = {cid: empty for cid in customer_ids}
    order_rows = db.execute(
        select(
            SalesOrder.customer_id,
            func.max(SalesOrder.created_at),
            func.count(),
        ).where(active_order_clause(SalesOrder.customer_id.in_(customer_ids)))
        .group_by(SalesOrder.customer_id)
    ).all()
    cutoff_90 = utc_now() - timedelta(days=LOYAL_WINDOW_DAYS)
    count_90_rows = db.execute(
        select(SalesOrder.customer_id, func.count())
        .where(
            active_order_clause(
                SalesOrder.customer_id.in_(customer_ids),
                SalesOrder.created_at >= cutoff_90,
            )
        )
        .group_by(SalesOrder.customer_id)
    ).all()
    count_90 = {int(cid): int(n) for cid, n in count_90_rows if cid is not None}
    debt_rows = db.execute(
        select(DebtAccount.customer_id, DebtAccount.current_balance).where(
            DebtAccount.customer_id.in_(customer_ids)
        )
    ).all()
    outstanding = {int(cid): Decimal(str(bal or 0)) for cid, bal in debt_rows if cid is not None}
    for cid, last_at, n in order_rows:
        if cid is None:
            continue
        out[int(cid)] = CustomerStats(
            last_order_at=_aware(last_at),
            order_count=int(n or 0),
            order_count_90d=count_90.get(int(cid), 0),
            outstanding=outstanding.get(int(cid), Decimal("0")),
        )
    for cid, bal in outstanding.items():
        if out[cid].order_count == 0 and out[cid].last_order_at is None:
            out[cid] = CustomerStats(
                last_order_at=None,
                order_count=0,
                order_count_90d=0,
                outstanding=bal,
            )
        elif out[cid].outstanding != bal:
            prev = out[cid]
            out[cid] = CustomerStats(
                last_order_at=prev.last_order_at,
                order_count=prev.order_count,
                order_count_90d=prev.order_count_90d,
                outstanding=bal,
            )
    return out
