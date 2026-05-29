"""Serial ACID sync push/pull for mobile offline queue."""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    DailyCylinderAudit,
    OrderNote,
    OrderNoteKind,
    OrderNoteParserStatus,
    OrderNoteStatus,
    Product,
    SalesOrder,
    SalesOrderItem,
    SyncAppliedMutation,
    User,
    UserRole,
)
from app.schemas import DailyCylinderAuditUpdate, OrderNoteCreate, OrderNoteUpdate, SalesOrderCreate, SyncChangeItem, SyncPullResponse, SyncPushIn, SyncPushResult
from app.services import sales
from app.services.order_change_log import order_snapshot, record_order_change
from app.timezone import utc_now

_push_lock = threading.Lock()


def _parse_cursor(cursor: str | None) -> datetime:
    """Decode pull cursor (ISO UTC) or epoch zero."""
    if not cursor or cursor == "0":
        return datetime.fromtimestamp(0, tz=UTC)
    try:
        dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except ValueError:
        return datetime.fromtimestamp(0, tz=UTC)


def _format_cursor(dt: datetime) -> str:
    """Encode cursor as ISO UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def _staff_order_filter(user: User):
    """Orders visible to delivery staff."""
    return or_(
        SalesOrder.assigned_to_user_id == user.id,
        and_(SalesOrder.assigned_to_user_id.is_(None), SalesOrder.created_by_user_id == user.id),
    )


def _order_to_pull_dict(order: SalesOrder) -> dict[str, Any]:
    """Serialize order for sync pull."""
    return sales.order_to_response(order).model_dump(mode="json")


def _product_to_pull_dict(p: Product) -> dict[str, Any]:
    """Serialize product for sync pull."""
    return {
        "id": p.id,
        "name": p.name,
        "sku": p.sku,
        "sell_price": str(p.sell_price),
        "stock_quantity": p.stock_quantity,
        "is_active": p.is_active,
        "updated_at": (p.created_at or utc_now()).isoformat(),
    }


def _note_to_pull_dict(n: OrderNote) -> dict[str, Any]:
    """Serialize order note for sync pull."""
    return {
        "id": n.id,
        "client_id": n.client_id,
        "created_by_user_id": n.created_by_user_id,
        "title": n.title,
        "note_type": n.note_type,
        "raw_text": n.raw_text,
        "status": n.status,
        "audio_duration_sec": n.audio_duration_sec,
        "mime_type": n.mime_type,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


def pull_changes(db: Session, user: User, *, cursor: str | None, entities: str | None) -> SyncPullResponse:
    """Return upserts since cursor for requested entities."""
    since = _parse_cursor(cursor)
    want = {e.strip() for e in (entities or "products,sales_orders,order_notes").split(",") if e.strip()}
    changes: list[SyncChangeItem] = []
    max_ts = since

    if "products" in want:
        rows = db.scalars(select(Product).where(Product.created_at > since).order_by(Product.created_at)).all()
        for p in rows:
            ts = p.created_at or utc_now()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            max_ts = max(max_ts, ts)
            changes.append(
                SyncChangeItem(
                    entity="product",
                    op="upsert",
                    server_id=p.id,
                    client_id=None,
                    updated_at=ts,
                    data=_product_to_pull_dict(p),
                )
            )

    if "sales_orders" in want:
        stmt = (
            select(SalesOrder)
            .options(joinedload(SalesOrder.lines), joinedload(SalesOrder.assigned_to))
            .where(SalesOrder.updated_at > since, SalesOrder.deleted_at.is_(None))
        )
        if user.role != UserRole.ADMIN.value:
            stmt = stmt.where(_staff_order_filter(user))
        for order in db.execute(stmt).unique().scalars().all():
            ts = order.updated_at or order.created_at or utc_now()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            max_ts = max(max_ts, ts)
            changes.append(
                SyncChangeItem(
                    entity="sales_order",
                    op="upsert",
                    server_id=order.id,
                    client_id=order.client_id,
                    updated_at=ts,
                    data=_order_to_pull_dict(order),
                )
            )
        deleted_stmt = select(SalesOrder).where(SalesOrder.deleted_at.isnot(None), SalesOrder.deleted_at > since)
        if user.role != UserRole.ADMIN.value:
            deleted_stmt = deleted_stmt.where(_staff_order_filter(user))
        for order in db.scalars(deleted_stmt.order_by(SalesOrder.deleted_at)).all():
            ts = order.deleted_at or utc_now()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            max_ts = max(max_ts, ts)
            changes.append(
                SyncChangeItem(
                    entity="sales_order",
                    op="delete",
                    server_id=order.id,
                    client_id=order.client_id,
                    updated_at=ts,
                    data=None,
                )
            )

    if "order_notes" in want:
        stmt = select(OrderNote).where(OrderNote.updated_at > since)
        if user.role != UserRole.ADMIN.value:
            stmt = stmt.where(OrderNote.created_by_user_id == user.id)
        for n in db.scalars(stmt.order_by(OrderNote.updated_at)).all():
            ts = n.updated_at or n.created_at or utc_now()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            max_ts = max(max_ts, ts)
            changes.append(
                SyncChangeItem(
                    entity="order_note",
                    op="upsert",
                    server_id=n.id,
                    client_id=n.client_id,
                    updated_at=ts,
                    data=_note_to_pull_dict(n),
                )
            )

    return SyncPullResponse(cursor=_format_cursor(max_ts if changes else since), changes=changes)


def list_active_sales_order_ids(db: Session, user: User) -> list[int]:
    """Return server ids for non-deleted orders visible to this user (mobile cache reconcile)."""
    stmt = select(SalesOrder.id).where(SalesOrder.deleted_at.is_(None))
    if user.role != UserRole.ADMIN.value:
        stmt = stmt.where(_staff_order_filter(user))
    return list(db.scalars(stmt.order_by(SalesOrder.id)).all())


def _already_applied(db: Session, mutation_id: str) -> SyncAppliedMutation | None:
    """Return prior application row if mutation was replayed."""
    return db.scalar(select(SyncAppliedMutation).where(SyncAppliedMutation.client_mutation_id == mutation_id))


def _mark_applied(db: Session, mutation: SyncPushIn, server_id: int | str | None) -> None:
    """Record idempotent mutation."""
    db.add(
        SyncAppliedMutation(
            client_mutation_id=mutation.client_mutation_id,
            entity=mutation.entity,
            server_id=str(server_id) if server_id is not None else None,
        )
    )


def _apply_order_note(db: Session, user: User, mutation: SyncPushIn) -> tuple[int, str | None, datetime]:
    """Create or update order note under row lock."""
    if mutation.operation == "create":
        if mutation.client_id:
            existing = db.scalar(select(OrderNote).where(OrderNote.client_id == mutation.client_id).with_for_update())
            if existing is not None:
                return existing.id, existing.client_id, existing.updated_at
        body = OrderNoteCreate.model_validate(mutation.payload)
        row = OrderNote(
            created_by_user_id=user.id,
            title=(body.title or "").strip() or None,
            note_type=OrderNoteKind.TEXT.value,
            raw_text=(body.raw_text or "").strip() or None,
            structured_payload={},
            status=OrderNoteStatus.DRAFT.value,
            parser_status=OrderNoteParserStatus.IDLE.value,
            client_id=mutation.client_id,
        )
        db.add(row)
        db.flush()
        return row.id, row.client_id, row.updated_at

    note_id = mutation.server_id
    if note_id is None and mutation.client_id:
        note_id = db.scalar(select(OrderNote.id).where(OrderNote.client_id == mutation.client_id))
    if note_id is None:
        raise ValueError("order_note update requires server_id or client_id")
    row = db.scalar(select(OrderNote).where(OrderNote.id == note_id).with_for_update())
    if row is None:
        raise ValueError("order_note not found")
    if user.role != UserRole.ADMIN.value and row.created_by_user_id != user.id:
        raise ValueError("Forbidden")
    body = OrderNoteUpdate.model_validate(mutation.payload)
    if body.title is not None:
        row.title = body.title.strip() or None
    if body.raw_text is not None:
        row.raw_text = body.raw_text.strip() or None
    row.updated_at = utc_now()
    db.flush()
    return row.id, row.client_id, row.updated_at


def _apply_sales_order(db: Session, user: User, mutation: SyncPushIn) -> tuple[int, str | None, datetime]:
    """Create/update order or mark completed (staff)."""
    if mutation.operation == "create":
        if user.role != UserRole.ADMIN.value:
            raise ValueError("Only admin can create orders")
        if mutation.client_id:
            existing = db.scalar(select(SalesOrder).where(SalesOrder.client_id == mutation.client_id).with_for_update())
            if existing is not None:
                return existing.id, existing.client_id, existing.updated_at
        payload = SalesOrderCreate.model_validate(mutation.payload)
        resp = sales.create_sales_order(db, payload, created_by_user_id=user.id, commit=False)
        order = db.get(SalesOrder, resp.id)
        if order and mutation.client_id:
            order.client_id = mutation.client_id
            db.flush()
        assert order is not None
        record_order_change(db, order=order, before=None, changed_by_user_id=user.id, source="sync", mutation_id=mutation.client_mutation_id, summary="create")
        return order.id, order.client_id, order.updated_at

    order_id = mutation.server_id
    if order_id is None and mutation.client_id:
        order_id = db.scalar(select(SalesOrder.id).where(SalesOrder.client_id == mutation.client_id))
    if order_id is None:
        raise ValueError("sales_order update requires server_id or client_id")

    order = db.scalar(select(SalesOrder).where(SalesOrder.id == order_id).with_for_update())
    if order is None:
        raise ValueError("Order not found")
    order.lines = list(db.scalars(select(SalesOrderItem).where(SalesOrderItem.order_id == order_id)).all())
    before_json = order_snapshot(order)

    if mutation.payload.get("delivery_status") == "completed" and set(mutation.payload.keys()) == {"delivery_status"}:
        if user.role != UserRole.ADMIN.value:
            allowed = order.assigned_to_user_id == user.id or (
                order.assigned_to_user_id is None and order.created_by_user_id == user.id
            )
            if not allowed:
                raise ValueError("Not your order")
        order.delivery_status = "completed"
        order.updated_at = utc_now()
        db.flush()
        record_order_change(
            db,
            order=order,
            before=before_json,
            changed_by_user_id=user.id,
            source="sync",
            mutation_id=mutation.client_mutation_id,
            summary="delivery_status",
        )
        return order.id, order.client_id, order.updated_at

    if user.role != UserRole.ADMIN.value:
        raise ValueError("Only admin can edit order fields")
    payload = SalesOrderCreate.model_validate(mutation.payload)
    sales.update_sales_order(db, order.id, payload, commit=False)
    order = db.scalars(
        select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)
    ).first()
    assert order is not None
    record_order_change(
        db,
        order=order,
        before=before_json,
        changed_by_user_id=user.id,
        source="sync",
        mutation_id=mutation.client_mutation_id,
    )
    return order.id, order.client_id, order.updated_at


def _apply_daily_audit(db: Session, user: User, mutation: SyncPushIn) -> tuple[int, str | None, datetime]:
    """Upsert daily cylinder audit for one business date."""
    if user.role != UserRole.ADMIN.value:
        raise ValueError("Only admin can update daily audit")
    business_date = mutation.payload.get("business_date")
    if not business_date:
        raise ValueError("business_date required")
    from datetime import date as date_cls

    d = date_cls.fromisoformat(str(business_date))
    row = db.scalar(select(DailyCylinderAudit).where(DailyCylinderAudit.business_date == d).with_for_update())
    if row is None:
        row = DailyCylinderAudit(business_date=d, created_by_user_id=user.id)
        db.add(row)
        db.flush()
    body = DailyCylinderAuditUpdate.model_validate(mutation.payload)
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        if val is not None and hasattr(row, key):
            setattr(row, key, val)
    row.updated_at = utc_now()
    db.flush()
    return row.id, None, row.updated_at


def apply_push(db: Session, user: User, mutation: SyncPushIn) -> SyncPushResult:
    """Apply one mutation inside a global push lock and DB transaction."""
    prior = _already_applied(db, mutation.client_mutation_id)
    if prior is not None:
        sid = int(prior.server_id) if prior.server_id and prior.server_id.isdigit() else None
        return SyncPushResult(
            status="applied",
            client_mutation_id=mutation.client_mutation_id,
            entity=mutation.entity,
            server_id=sid,
            client_id=mutation.client_id,
        )

    with _push_lock:
        try:
            if mutation.entity == "order_note":
                sid, cid, ts = _apply_order_note(db, user, mutation)
            elif mutation.entity == "sales_order":
                sid, cid, ts = _apply_sales_order(db, user, mutation)
            elif mutation.entity == "daily_cylinder_audit":
                sid, cid, ts = _apply_daily_audit(db, user, mutation)
            else:
                raise ValueError(f"Unsupported entity: {mutation.entity}")

            _mark_applied(db, mutation, sid)
            db.commit()
            return SyncPushResult(
                status="applied",
                client_mutation_id=mutation.client_mutation_id,
                entity=mutation.entity,
                server_id=sid,
                client_id=cid,
                server_updated_at=ts,
            )
        except Exception as exc:
            db.rollback()
            return SyncPushResult(
                status="rejected",
                client_mutation_id=mutation.client_mutation_id,
                entity=mutation.entity,
                error_code="apply_failed",
                error_message=str(exc),
            )
