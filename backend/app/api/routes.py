"""REST API routes for the gas store application."""

import csv
import io
import urllib.error
from datetime import date, datetime, timedelta, UTC
from decimal import Decimal
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.types import Date as CastDate

from app.api.auth import get_current_user, require_admin_user, require_any_role
from app.config import get_settings
from app.database import get_db
from app.models import (
    AuditLogEntry,
    CapaItem,
    ComplaintTicket,
    CylinderTemplate,
    DailyCylinderAudit,
    DebtAccount,
    DebtLedgerEntry,
    DebtPayment,
    DebtWriteOff,
    CustomerJourneyEvent,
    FinanceKpiBaseline,
    OrderNote,
    OrderNoteKind,
    OrderNoteParserStatus,
    OrderNoteStatus,
    OrderChangeLog,
    Product,
    SafetyChecklistRun,
    SalesOrder,
    SalesOrderItem,
    ShiftSettlement,
    StockReceipt,
    User,
    UserRole,
)
from app.schemas import (
    AuditLogEntryIn,
    AuditLogEntryResponse,
    CapaItemIn,
    CapaItemResponse,
    CapaItemUpdate,
    ComplaintTicketIn,
    ComplaintTicketResponse,
    ComplaintTicketUpdate,
    CylinderTemplateCreate,
    CylinderTemplateResponse,
    CylinderTemplateUpdate,
    CustomerJourneyEventIn,
    CustomerJourneyEventResponse,
    DailyCylinderAuditComputed,
    DailyCylinderAuditPayload,
    DailyCylinderAuditRecord,
    DailyCylinderAuditUpdate,
    DebtAccountDetailResponse,
    DebtAccountResponse,
    DebtAgingBucket,
    DebtLedgerEntryResponse,
    DebtPaymentIn,
    DebtPaymentUpdateIn,
    DebtWriteOffIn,
    DashboardPayload,
    DeliveryDaySummaryResponse,
    FinanceKpiBaselineIn,
    FinanceKpiBaselineResponse,
    GeocodeHit,
    GeocodeListResponse,
    MapPasteIn,
    MeOrderDeliveryPatch,
    GasLedgerRow,
    ShellDebtLedgerResponse,
    ShellDebtLedgerRow,
    OrderNoteCreate,
    OrderNoteResponse,
    OrderNoteStructuredPayload,
    OrderNoteUpdate,
    OrderChangeLogEntry,
    ProductCreate,
    ProductQtyRollup,
    ProductResponse,
    ProductUpdate,
    SafetyChecklistRunIn,
    SafetyChecklistRunResponse,
    SalesOrderCreate,
    SalesOrderListResponse,
    SalesOrderResponse,
    ShiftSettlementIn,
    ShiftSettlementResponse,
    StockReceiptCreate,
    StockReceiptResponse,
    TaxReportRow,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services.auth import hash_password, normalize_role
from app.services import sales
from app.services.order_change_log import order_snapshot, record_order_change
from app.timezone import to_business_date
from app.services.stock_receipts import apply_inbound_receipt, record_opening_receipt
from app.services.delivery_export import render_delivery_slip_html
from app.services.gas_ledger_rules import order_line_eligible_for_gas_ledger
from app.services.invoice_filename import content_disposition_filename, invoice_filename_stem
from app.services.order_note_media import delete_voice_blob_if_any, public_audio_url
from app.services.phone import normalize_phone
from app.services.geocode import nominatim_reverse, nominatim_row_to_geocode_hit, nominatim_search
from app.services.map_paste_resolve import (
    place_query_variants,
    resolve_paste_to_lat_lng,
    resolve_place_query_from_paste,
)


router = APIRouter(dependencies=[Depends(get_current_user)])


def _product_to_response(p: Product) -> ProductResponse:
    """Map ORM product to response model."""
    return ProductResponse.model_validate(p)


def _strip_opt_text(value: str | None) -> str | None:
    """Normalize optional text by trimming and converting empty to ``None``."""
    if value is None:
        return None
    out = value.strip()
    return out or None


@router.get("/geocode", response_model=GeocodeListResponse)
def geocode_search(
    q: str = Query(..., min_length=2, max_length=400),
    limit: int = Query(default=5, ge=1, le=10),
) -> GeocodeListResponse:
    """Resolve a free-text address to coordinate candidates using OSM Nominatim."""
    settings = get_settings()
    try:
        raw = nominatim_search(q.strip(), limit=limit, user_agent=settings.nominatim_user_agent)
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=503, detail="Geocoding service unreachable") from exc
    items: list[GeocodeHit] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        hit = nominatim_row_to_geocode_hit(row, place_id_mode="search")
        if hit:
            items.append(hit)
    return GeocodeListResponse(items=items)


@router.get("/geocode/reverse", response_model=GeocodeHit)
def geocode_reverse(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> GeocodeHit:
    """Resolve coordinates to a place label using OSM Nominatim reverse lookup."""
    settings = get_settings()
    try:
        row = nominatim_reverse(lat, lng, user_agent=settings.nominatim_user_agent)
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=503, detail="Geocoding service unreachable") from exc
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="No reverse result")
    hit = nominatim_row_to_geocode_hit(row, place_id_mode="reverse")
    if not hit:
        raise HTTPException(status_code=404, detail="No reverse result")
    return hit


@router.post("/geocode/from-paste", response_model=GeocodeHit)
def geocode_from_paste(body: MapPasteIn) -> GeocodeHit:
    """Parse pasted Maps text (link, Plus Code, DMS, decimals) then return one OSM-labelled point."""
    settings = get_settings()
    raw = body.raw.strip()
    ua = settings.nominatim_user_agent
    try:
        ll = resolve_paste_to_lat_lng(raw, user_agent=ua)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if ll:
        la, lo = ll
        try:
            row = nominatim_reverse(la, lo, user_agent=ua)
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=503, detail="Geocoding service unreachable") from exc
        if isinstance(row, dict):
            hit = nominatim_row_to_geocode_hit(row, place_id_mode="reverse")
            if hit:
                return hit
        la_r = round(la, 6)
        lo_r = round(lo, 6)
        return GeocodeHit(lat=la_r, lng=lo_r, display_name=f"{la_r}, {lo_r}", place_id="paste-coords")
    place_q = resolve_place_query_from_paste(raw, user_agent=ua)
    if place_q:
        for q in place_query_variants(place_q):
            try:
                raw_rows = nominatim_search(q[:400], limit=1, user_agent=ua)
            except urllib.error.URLError as exc:
                raise HTTPException(status_code=503, detail="Geocoding service unreachable") from exc
            if not raw_rows:
                continue
            first = raw_rows[0]
            if not isinstance(first, dict):
                continue
            hit = nominatim_row_to_geocode_hit(first, place_id_mode="search")
            if hit:
                return hit
    try:
        raw_rows = nominatim_search(raw[:400], limit=1, user_agent=ua)
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=503, detail="Geocoding service unreachable") from exc
    if not raw_rows:
        raise HTTPException(
            status_code=422,
            detail="Không đọc được vị trí — thử link Google Maps, Plus Code, tọa độ số, hoặc dòng địa chỉ rõ hơn",
        )
    first = raw_rows[0]
    if not isinstance(first, dict):
        raise HTTPException(status_code=422, detail="Không đọc được vị trí từ nội dung dán")
    hit = nominatim_row_to_geocode_hit(first, place_id_mode="search")
    if not hit:
        raise HTTPException(status_code=422, detail="Không đọc được vị trí từ nội dung dán")
    return hit


def _cylinder_template_to_response(row: CylinderTemplate) -> CylinderTemplateResponse:
    """Map ORM cylinder template to API model."""
    return CylinderTemplateResponse.model_validate(row)


def _order_note_to_response(row: OrderNote) -> OrderNoteResponse:
    """Normalize order note row into response model."""
    payload = row.structured_payload if isinstance(row.structured_payload, dict) else {}
    note_type = getattr(row, "note_type", None) or OrderNoteKind.TEXT.value
    return OrderNoteResponse(
        id=row.id,
        created_by_user_id=row.created_by_user_id,
        title=row.title,
        note_type=note_type,
        raw_text=row.raw_text,
        structured_payload=OrderNoteStructuredPayload.model_validate(payload),
        status=row.status,
        voice_enabled_stub=row.voice_enabled_stub,
        parser_status=row.parser_status,
        audio_url=public_audio_url(getattr(row, "audio_path", None)),
        audio_duration_sec=getattr(row, "audio_duration_sec", None),
        mime_type=getattr(row, "mime_type", None),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _debt_account_to_response(row: DebtAccount) -> DebtAccountResponse:
    """Map debt account ORM row to response schema."""
    return DebtAccountResponse.model_validate(row)


def _debt_ledger_to_response(db: Session, row: DebtLedgerEntry) -> DebtLedgerEntryResponse:
    """Map debt ledger ORM row; attach ``returned_shell_units`` for payment-linked rows."""
    shells = 0
    if row.reference_type == "debt_payment" and row.reference_id:
        try:
            pid = int(row.reference_id)
        except ValueError:
            pid = 0
        if pid:
            pay = db.get(DebtPayment, pid)
            if pay is not None:
                shells = int(pay.returned_shell_units or 0)
    return DebtLedgerEntryResponse(
        id=row.id,
        debt_account_id=row.debt_account_id,
        entry_type=row.entry_type,
        amount_signed=row.amount_signed,
        note=row.note,
        reference_type=row.reference_type,
        reference_id=row.reference_id,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        returned_shell_units=shells,
    )


def _recompute_debt_balance(db: Session, account: DebtAccount) -> None:
    """Recompute account balance from immutable ledger rows."""
    balance = db.scalar(
        select(func.coalesce(func.sum(DebtLedgerEntry.amount_signed), 0)).where(
            DebtLedgerEntry.debt_account_id == account.id
        )
    )
    account.current_balance = balance
    account.status = "closed" if balance <= 0 else "active"


def _get_or_create_debt_account(db: Session, customer_name: str, phone: str) -> DebtAccount:
    """Resolve or create debt account by normalized phone key."""
    key = normalize_phone(phone)
    account = db.scalar(select(DebtAccount).where(DebtAccount.customer_key == key))
    if account is not None:
        account.customer_name = customer_name.strip()
        account.phone = key
        return account
    account = DebtAccount(customer_key=key, customer_name=customer_name.strip(), phone=key)
    db.add(account)
    db.flush()
    return account


def _append_debt_entry(
    db: Session,
    *,
    account_id: int,
    entry_type: str,
    amount_signed: Decimal,
    created_by_user_id: int | None,
    note: str | None = None,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> DebtLedgerEntry:
    """Insert one debt ledger row."""
    row = DebtLedgerEntry(
        debt_account_id=account_id,
        entry_type=entry_type,
        amount_signed=amount_signed,
        note=_strip_opt_text(note),
        reference_type=_strip_opt_text(reference_type),
        reference_id=_strip_opt_text(reference_id),
        created_by_user_id=created_by_user_id,
    )
    db.add(row)
    db.flush()
    return row


def _allocate_credit_to_orders(db: Session, *, phone: str, credit_amount: Decimal) -> None:
    """Reduce outstanding amount from oldest debt orders for one customer key."""
    remaining = Decimal(str(credit_amount))
    if remaining <= 0:
        return
    rows = db.scalars(
        select(SalesOrder)
        .where(sales.active_order_clause(SalesOrder.phone == phone, SalesOrder.outstanding_amount > 0))
        .order_by(SalesOrder.created_at.asc())
    ).all()
    for order in rows:
        if remaining <= 0:
            break
        outstanding = Decimal(str(order.outstanding_amount))
        if outstanding <= 0:
            continue
        used = min(outstanding, remaining)
        order.outstanding_amount = outstanding - used
        order.paid_amount = Decimal(str(order.total)) - Decimal(str(order.outstanding_amount))
        remaining -= used


def _recompute_order_outstanding_from_ledger(db: Session, *, account: DebtAccount) -> None:
    """Rebuild order outstanding values using debt ledger invoices and total credits."""
    entries = db.scalars(
        select(DebtLedgerEntry)
        .where(DebtLedgerEntry.debt_account_id == account.id)
        .order_by(DebtLedgerEntry.created_at.asc(), DebtLedgerEntry.id.asc())
    ).all()
    invoice_by_order: dict[int, Decimal] = {}
    total_credit = Decimal("0")
    for e in entries:
        amount = Decimal(str(e.amount_signed))
        if (
            e.entry_type == "invoice"
            and e.reference_type == "sales_order"
            and e.reference_id
            and str(e.reference_id).isdigit()
            and amount > 0
        ):
            oid = int(str(e.reference_id))
            invoice_by_order[oid] = invoice_by_order.get(oid, Decimal("0")) + amount
        elif amount < 0:
            total_credit += -amount
    orders = db.scalars(
        select(SalesOrder)
        .where(sales.active_order_clause(SalesOrder.phone == account.customer_key))
        .order_by(SalesOrder.created_at.asc(), SalesOrder.id.asc())
    ).all()
    for order in orders:
        base_outstanding = max(Decimal("0"), invoice_by_order.get(order.id, Decimal("0")))
        if base_outstanding <= 0:
            order.outstanding_amount = Decimal("0")
            order.paid_amount = Decimal(str(order.total))
            continue
        used = min(base_outstanding, total_credit)
        left = base_outstanding - used
        total_credit -= used
        order.outstanding_amount = left
        order.paid_amount = Decimal(str(order.total)) - left


def _ensure_note_access(note: OrderNote, actor: User) -> None:
    """Allow admin to access any note and staff only their own notes."""
    if actor.role == UserRole.ADMIN.value:
        return
    if note.created_by_user_id != actor.id:
        raise HTTPException(status_code=403, detail="Forbidden")


def _write_audit(
    db: Session, *, actor_user_id: int | None, action: str, target_type: str, target_id: str | None = None, detail: str | None = None
) -> AuditLogEntry:
    """Persist a normalized audit row for sensitive operations."""
    row = AuditLogEntry(
        actor_user_id=actor_user_id,
        action=action.strip(),
        target_type=target_type.strip(),
        target_id=target_id.strip() if target_id else None,
        detail=detail.strip() if detail else None,
    )
    db.add(row)
    db.flush()
    return row


@router.get("/cylinder-templates", response_model=list[CylinderTemplateResponse])
def list_cylinder_templates(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CylinderTemplateResponse]:
    """List cylinder presets; staff sees active only unless admin passes ``include_inactive``."""
    if include_inactive and user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    stmt = select(CylinderTemplate).order_by(CylinderTemplate.name.asc())
    if not include_inactive:
        stmt = stmt.where(CylinderTemplate.is_active.is_(True))
    rows = db.scalars(stmt).all()
    return [_cylinder_template_to_response(r) for r in rows]


@router.post(
    "/cylinder-templates",
    response_model=CylinderTemplateResponse,
    dependencies=[Depends(require_admin_user)],
)
def create_cylinder_template(payload: CylinderTemplateCreate, db: Session = Depends(get_db)) -> CylinderTemplateResponse:
    """Create a reusable cylinder field preset (admin only)."""
    row = CylinderTemplate(
        name=payload.name.strip(),
        owner_name=_strip_opt_text(payload.owner_name),
        import_source=_strip_opt_text(payload.import_source),
        inspection_expiry=payload.inspection_expiry,
        import_date=payload.import_date,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _cylinder_template_to_response(row)


@router.patch(
    "/cylinder-templates/{template_id}",
    response_model=CylinderTemplateResponse,
    dependencies=[Depends(require_admin_user)],
)
def update_cylinder_template(
    template_id: int, payload: CylinderTemplateUpdate, db: Session = Depends(get_db)
) -> CylinderTemplateResponse:
    """Update a cylinder template (admin only)."""
    row = db.get(CylinderTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = str(data["name"]).strip()
    if "owner_name" in data:
        row.owner_name = _strip_opt_text(data["owner_name"])
    if "import_source" in data:
        row.import_source = _strip_opt_text(data["import_source"])
    if "inspection_expiry" in data:
        row.inspection_expiry = data["inspection_expiry"]
    if "import_date" in data:
        row.import_date = data["import_date"]
    if "is_active" in data and data["is_active"] is not None:
        row.is_active = bool(data["is_active"])
    db.commit()
    db.refresh(row)
    return _cylinder_template_to_response(row)


@router.delete("/cylinder-templates/{template_id}", dependencies=[Depends(require_admin_user)])
def delete_cylinder_template(template_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    """Remove a cylinder template (admin only)."""
    row = db.get(CylinderTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.get("/me/orders", response_model=list[SalesOrderResponse])
def list_my_orders(
    limit: int = Query(default=100, ge=1, le=500),
    delivery_status: Literal["in_transit", "completed"] | None = Query(
        default=None,
        description="Lọc theo trạng thái giao: đang giao / hoàn thành (bỏ qua để lấy tất cả).",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SalesOrderResponse]:
    """List orders assigned to the current user, or legacy rows they created before assignment existed."""
    mine = or_(
        SalesOrder.assigned_to_user_id == user.id,
        and_(SalesOrder.assigned_to_user_id.is_(None), SalesOrder.created_by_user_id == user.id),
    )
    stmt = (
        select(SalesOrder)
        .where(mine, SalesOrder.deleted_at.is_(None))
        .options(joinedload(SalesOrder.lines), joinedload(SalesOrder.assigned_to))
    )
    if delivery_status is not None:
        stmt = stmt.where(SalesOrder.delivery_status == delivery_status)
    stmt = stmt.order_by(SalesOrder.created_at.desc()).limit(limit)
    orders = db.execute(stmt).unique().scalars().all()
    return [sales.order_to_response(o) for o in orders]


@router.patch("/me/orders/{order_id}", response_model=SalesOrderResponse)
def patch_my_order_delivery_status(
    order_id: int,
    body: MeOrderDeliveryPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SalesOrderResponse:
    """Staff marks delivery finished (``completed``). Admin điều chỉnh trạng thái qua ``PATCH /api/orders``."""
    if body.delivery_status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Chỉ có thể đánh dấu hoàn thành giao từ đây — liên hệ admin nếu cần đưa đơn về đang giao",
        )
    order = db.scalars(
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines), joinedload(SalesOrder.assigned_to))
        .where(SalesOrder.id == order_id)
    ).first()
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Order not found")
    allowed = order.assigned_to_user_id == user.id or (
        order.assigned_to_user_id is None and order.created_by_user_id == user.id
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not your order")
    order.delivery_status = "completed"
    db.commit()
    db.refresh(order)
    return sales.order_to_response(order)


@router.get("/order-notes", response_model=list[OrderNoteResponse])
def list_order_notes(
    mine: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[OrderNoteResponse]:
    """List order notes; admin can request all notes with `mine=false`."""
    stmt = select(OrderNote).order_by(OrderNote.created_at.desc()).limit(limit)
    if mine or user.role != UserRole.ADMIN.value:
        stmt = stmt.where(OrderNote.created_by_user_id == user.id)
    rows = db.scalars(stmt).all()
    return [_order_note_to_response(r) for r in rows]


_VOICE_EXTS = frozenset({".webm", ".wav", ".mp3", ".m4a", ".ogg", ".oga"})


@router.post("/order-notes", response_model=OrderNoteResponse)
def create_order_note(
    payload: OrderNoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderNoteResponse:
    """Create a free-text delivery note."""
    row = OrderNote(
        created_by_user_id=user.id,
        title=_strip_opt_text(payload.title),
        note_type=OrderNoteKind.TEXT.value,
        raw_text=payload.raw_text.strip(),
        structured_payload={},
        status=OrderNoteStatus.DRAFT.value,
        voice_enabled_stub=False,
        parser_status=OrderNoteParserStatus.IDLE.value,
        audio_path=None,
        audio_duration_sec=None,
        mime_type=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _order_note_to_response(row)


@router.post("/order-notes/voice", response_model=OrderNoteResponse)
async def create_voice_order_note(
    file: UploadFile = File(...),
    duration_sec: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderNoteResponse:
    """Store a voice recording as a note (create only; no later edits)."""
    settings = get_settings()
    raw_name = file.filename or "recording.webm"
    ext = Path(raw_name).suffix.lower() or ".webm"
    if ext not in _VOICE_EXTS:
        raise HTTPException(status_code=400, detail="Unsupported audio file extension")
    body = await file.read()
    if len(body) > settings.order_note_audio_max_bytes:
        raise HTTPException(status_code=400, detail="Audio file too large")
    rel_dir = f"order-notes/{user.id}"
    out_name = f"{uuid4().hex}{ext}"
    base = Path(settings.media_root).resolve()
    dest_dir = (base / rel_dir).resolve()
    try:
        dest_dir.relative_to(base)
    except ValueError as e:
        raise HTTPException(status_code=500, detail="Invalid media path") from e
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / out_name
    dest_file.write_bytes(body)
    rel_path = f"{rel_dir}/{out_name}".replace("\\", "/")
    dur = duration_sec if duration_sec is not None and duration_sec >= 0 else None
    row = OrderNote(
        created_by_user_id=user.id,
        title=None,
        note_type=OrderNoteKind.VOICE.value,
        raw_text=None,
        structured_payload={},
        status=OrderNoteStatus.DRAFT.value,
        voice_enabled_stub=False,
        parser_status=OrderNoteParserStatus.IDLE.value,
        audio_path=rel_path,
        audio_duration_sec=dur,
        mime_type=file.content_type or "application/octet-stream",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _order_note_to_response(row)


@router.patch("/order-notes/{note_id}", response_model=OrderNoteResponse)
def update_order_note(
    note_id: int,
    payload: OrderNoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderNoteResponse:
    """Update text note fields for the owner or admin (voice notes cannot be patched)."""
    row = db.get(OrderNote, note_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Order note not found")
    _ensure_note_access(row, user)
    if (getattr(row, "note_type", None) or OrderNoteKind.TEXT.value) != OrderNoteKind.TEXT.value:
        raise HTTPException(status_code=400, detail="Voice notes cannot be updated")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        row.title = _strip_opt_text(data["title"])
    if "raw_text" in data and data["raw_text"] is not None:
        row.raw_text = data["raw_text"].strip()
    if "structured_payload" in data and data["structured_payload"] is not None:
        row.structured_payload = payload.structured_payload.model_dump(mode="json")
    if "status" in data and data["status"]:
        row.status = str(data["status"])
    db.commit()
    db.refresh(row)
    return _order_note_to_response(row)


@router.delete("/order-notes/{note_id}")
def delete_order_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Delete order note owned by actor or as admin; removes voice file if present."""
    row = db.get(OrderNote, note_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Order note not found")
    _ensure_note_access(row, user)
    settings = get_settings()
    delete_voice_blob_if_any(settings, getattr(row, "audio_path", None))
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.get("/products", response_model=list[ProductResponse])
def list_products(include_inactive: bool = Query(default=False), db: Session = Depends(get_db)) -> list[ProductResponse]:
    """Return active products by default; include archived rows when requested."""
    stmt = select(Product).order_by(Product.created_at.desc())
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    rows = db.scalars(stmt).all()
    return [_product_to_response(p) for p in rows]


@router.get("/products-export.csv", dependencies=[Depends(require_admin_user)])
def products_export_csv(db: Session = Depends(get_db)):
    """Export full product catalog as CSV (UTF-8 BOM for Excel)."""
    rows = db.scalars(select(Product).order_by(Product.id)).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id",
            "name",
            "sku",
            "description",
            "cost_price",
            "sell_price",
            "stock_quantity",
            "low_stock_threshold",
            "created_at",
        ]
    )
    for p in rows:
        writer.writerow(
            [
                p.id,
                p.name,
                p.sku or "",
                (p.description or "").replace("\n", " ").strip(),
                str(p.cost_price),
                str(p.sell_price),
                p.stock_quantity,
                p.low_stock_threshold,
                p.created_at.isoformat() if p.created_at else "",
            ]
        )
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="products_export.csv"'},
    )


@router.post("/products", response_model=ProductResponse, dependencies=[Depends(require_admin_user)])
def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> ProductResponse:
    """Create a product."""
    if payload.sku:
        exists = db.scalar(select(Product.id).where(Product.sku == payload.sku))
        if exists:
            raise HTTPException(status_code=400, detail="SKU already exists")
    p = Product(
        name=payload.name.strip(),
        sku=payload.sku.strip() if payload.sku else None,
        description=payload.description.strip() if payload.description else None,
        cost_price=payload.cost_price,
        sell_price=payload.sell_price,
        stock_quantity=payload.stock_quantity,
        low_stock_threshold=payload.low_stock_threshold,
        is_active=True,
    )
    db.add(p)
    db.flush()
    if payload.stock_quantity > 0:
        record_opening_receipt(
            db,
            product_id=p.id,
            receipt_date=datetime.now(tz=UTC).date(),
            quantity=payload.stock_quantity,
            note="Tồn khởi tạo sản phẩm",
            created_by_user_id=None,
        )
    db.commit()
    db.refresh(p)
    return _product_to_response(p)


@router.patch("/products/{product_id}", response_model=ProductResponse, dependencies=[Depends(require_admin_user)])
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)) -> ProductResponse:
    """Update product fields."""
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump(exclude_unset=True)
    if "stock_quantity" in data:
        raise HTTPException(
            status_code=400,
            detail="Không cập nhật tồn trực tiếp — dùng POST /api/products/{id}/stock-receipts để nhập kho.",
        )
    if "sku" in data and data["sku"]:
        exists = db.scalar(select(Product.id).where(Product.sku == data["sku"], Product.id != product_id))
        if exists:
            raise HTTPException(status_code=400, detail="SKU already exists")
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _product_to_response(p)


@router.get(
    "/products/{product_id}/stock-receipts",
    response_model=list[StockReceiptResponse],
    dependencies=[Depends(require_admin_user)],
)
def list_stock_receipts(product_id: int, db: Session = Depends(get_db)) -> list[StockReceiptResponse]:
    """Chronological stock receipts for one product (opening + inbound)."""
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    rows = db.scalars(
        select(StockReceipt)
        .where(StockReceipt.product_id == product_id)
        .order_by(StockReceipt.receipt_date.desc(), StockReceipt.id.desc())
    ).all()
    return [StockReceiptResponse.model_validate(r) for r in rows]


@router.post(
    "/products/{product_id}/stock-receipts",
    response_model=StockReceiptResponse,
    dependencies=[Depends(require_admin_user)],
)
def create_stock_receipt(
    product_id: int,
    payload: StockReceiptCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> StockReceiptResponse:
    """Record inbound stock and increment ``Product.stock_quantity``."""
    try:
        row = apply_inbound_receipt(
            db,
            product_id=product_id,
            receipt_date=payload.receipt_date,
            quantity=payload.quantity,
            note=payload.note,
            created_by_user_id=actor.id,
        )
        db.commit()
        db.refresh(row)
        return StockReceiptResponse.model_validate(row)
    except ValueError as e:
        detail = str(e)
        code = 404 if detail == "Product not found" else 400
        raise HTTPException(status_code=code, detail=detail) from e


@router.delete("/products/{product_id}", dependencies=[Depends(require_admin_user)])
def delete_product(product_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    """Remove a product if not referenced by order lines."""
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    used = db.scalar(select(SalesOrderItem.id).where(SalesOrderItem.product_id == product_id).limit(1))
    if used:
        raise HTTPException(status_code=400, detail="Product is referenced by orders")
    for r in db.scalars(select(StockReceipt).where(StockReceipt.product_id == product_id)).all():
        db.delete(r)
    db.delete(p)
    db.commit()
    return {"status": "ok"}


@router.get("/users", response_model=list[UserResponse], dependencies=[Depends(require_admin_user)])
def list_users(db: Session = Depends(get_db)) -> list[UserResponse]:
    """List application users for admin management."""
    rows = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [UserResponse.model_validate(u) for u in rows]


@router.post("/users", response_model=UserResponse, dependencies=[Depends(require_admin_user)])
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserResponse:
    """Create a new user account (admin only)."""
    username = payload.username.strip()
    exists = db.scalar(select(User.id).where(User.username == username))
    if exists:
        raise HTTPException(status_code=400, detail="Username already exists")
    u = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=normalize_role(payload.role),
        is_active=payload.is_active,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return UserResponse.model_validate(u)


@router.patch("/users/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin_user)])
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)) -> UserResponse:
    """Update user info (role, status, password) as admin."""
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if "username" in data:
        username = str(data["username"]).strip()
        exists = db.scalar(select(User.id).where(User.username == username, User.id != user_id))
        if exists:
            raise HTTPException(status_code=400, detail="Username already exists")
        u.username = username
    if "password" in data and data["password"]:
        u.password_hash = hash_password(str(data["password"]))
    if "role" in data and data["role"]:
        u.role = normalize_role(str(data["role"]))
    if "is_active" in data:
        u.is_active = bool(data["is_active"])
    db.commit()
    db.refresh(u)
    return UserResponse.model_validate(u)


@router.delete("/users/{user_id}", dependencies=[Depends(require_admin_user)])
def delete_user(user_id: int, db: Session = Depends(get_db), actor: User = Depends(get_current_user)) -> dict[str, str]:
    """Delete non-self user account as admin."""
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete current admin account")
    db.delete(u)
    db.commit()
    return {"status": "ok"}


_ORDER_PAGE_LIMITS = frozenset({10, 20, 50, 100})


@router.get("/orders", response_model=SalesOrderListResponse, dependencies=[Depends(require_admin_user)])
def list_orders(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
) -> SalesOrderListResponse:
    """List orders with nested lines, newest first (paginated). Optional ``q`` filters code, customer, phone."""
    if limit not in _ORDER_PAGE_LIMITS:
        raise HTTPException(status_code=400, detail="limit must be one of: 10, 20, 50, 100")
    filters = [SalesOrder.deleted_at.is_(None)]
    if q and q.strip():
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                SalesOrder.customer_name.ilike(term),
                SalesOrder.phone.ilike(term),
                SalesOrder.order_code.ilike(term),
            )
        )
    count_stmt = select(func.count()).select_from(SalesOrder).where(*filters)
    total = int(db.scalar(count_stmt) or 0)
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines), joinedload(SalesOrder.assigned_to))
        .where(*filters)
        .order_by(SalesOrder.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    orders = db.execute(stmt).unique().scalars().all()
    return SalesOrderListResponse(items=[sales.order_to_response(o) for o in orders], total=total)


@router.post("/orders", response_model=SalesOrderResponse, dependencies=[Depends(require_admin_user)])
def create_order_route(
    payload: SalesOrderCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> SalesOrderResponse:
    """Create a VAT sales order (admin only); optional delivery staff assignment."""
    try:
        created = sales.create_sales_order(db, payload, created_by_user_id=actor.id)
        outstanding = Decimal(str(created.outstanding_amount))
        if outstanding > 0:
            account = _get_or_create_debt_account(db, created.customer_name, created.phone or payload.phone)
            _append_debt_entry(
                db,
                account_id=account.id,
                entry_type="invoice",
                amount_signed=outstanding,
                created_by_user_id=actor.id,
                note=f"Đơn {created.order_code}",
                reference_type="sales_order",
                reference_id=str(created.id),
            )
            _recompute_debt_balance(db, account)
            _write_audit(
                db,
                actor_user_id=actor.id,
                action="CREATE_DEBT_INVOICE",
                target_type="debt_account",
                target_id=str(account.id),
                detail=created.order_code,
            )
            db.commit()
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.patch("/orders/{order_id}", response_model=SalesOrderResponse, dependencies=[Depends(require_admin_user)])
def update_order_route(
    order_id: int,
    payload: SalesOrderCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> SalesOrderResponse:
    """Update an existing sales order and line items."""
    try:
        before = db.scalars(
            select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)
        ).first()
        if before is None:
            raise ValueError("Order not found")
        before_json = order_snapshot(before)
        updated = sales.update_sales_order(db, order_id, payload, commit=False)
        order = db.get(SalesOrder, order_id)
        assert order is not None
        record_order_change(
            db,
            order=order,
            before=before_json,
            changed_by_user_id=actor.id,
            source="web",
            summary=None,
        )
        db.commit()
        return updated
    except ValueError as e:
        db.rollback()
        detail = str(e)
        status_code = 404 if detail == "Order not found" else 400
        raise HTTPException(status_code=status_code, detail=detail) from e


@router.get(
    "/orders/{order_id}/change-log",
    response_model=list[OrderChangeLogEntry],
    dependencies=[Depends(require_admin_user)],
)
def list_order_change_log(order_id: int, db: Session = Depends(get_db)) -> list[OrderChangeLogEntry]:
    """Return append-only edit history for one order."""
    order = db.get(SalesOrder, order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Order not found")
    rows = db.scalars(
        select(OrderChangeLog).where(OrderChangeLog.order_id == order_id).order_by(OrderChangeLog.changed_at.desc())
    ).all()
    return [OrderChangeLogEntry.model_validate(r) for r in rows]


@router.delete("/orders/{order_id}", dependencies=[Depends(require_admin_user)])
def delete_order_route(order_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    """Delete order and restore inventory quantities."""
    try:
        order = db.get(SalesOrder, order_id)
        if order is None:
            raise ValueError("Order not found")
        phone = order.phone
        outstanding = Decimal(str(order.outstanding_amount or 0))
        sales.delete_sales_order(db, order_id)
        if phone and outstanding > 0:
            account = db.scalar(select(DebtAccount).where(DebtAccount.customer_key == phone))
            if account is not None:
                _append_debt_entry(
                    db,
                    account_id=account.id,
                    entry_type="adjustment",
                    amount_signed=-outstanding,
                    created_by_user_id=None,
                    note=f"Đảo công nợ do xóa đơn #{order_id}",
                    reference_type="sales_order_delete",
                    reference_id=str(order_id),
                )
                _recompute_debt_balance(db, account)
                db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok"}


@router.get(
    "/debt-accounts",
    response_model=list[DebtAccountResponse],
    dependencies=[Depends(require_admin_user)],
)
def list_debt_accounts(
    status: str = Query(default="active"),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[DebtAccountResponse]:
    """List customer debt accounts with status/search filters."""
    stmt = select(DebtAccount).order_by(DebtAccount.current_balance.desc(), DebtAccount.updated_at.desc())
    if status != "all":
        stmt = stmt.where(DebtAccount.status == status)
    if search:
        q = f"%{search.strip()}%"
        stmt = stmt.where((DebtAccount.customer_name.ilike(q)) | (DebtAccount.phone.ilike(q)))
    rows = db.scalars(stmt.offset(offset).limit(limit)).all()
    return [_debt_account_to_response(r) for r in rows]


@router.get(
    "/debt-accounts/{account_id}",
    response_model=DebtAccountDetailResponse,
    dependencies=[Depends(require_admin_user)],
)
def debt_account_detail(
    account_id: int,
    ledger_limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> DebtAccountDetailResponse:
    """Return one debt account with latest ledger rows."""
    account = db.get(DebtAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Debt account not found")
    ledger = db.scalars(
        select(DebtLedgerEntry)
        .where(DebtLedgerEntry.debt_account_id == account_id)
        .order_by(DebtLedgerEntry.created_at.desc())
        .limit(ledger_limit)
    ).all()
    return DebtAccountDetailResponse(
        account=_debt_account_to_response(account),
        ledger=[_debt_ledger_to_response(db, r) for r in ledger],
    )


@router.get(
    "/debt-accounts/{account_id}/ledger",
    response_model=list[DebtLedgerEntryResponse],
    dependencies=[Depends(require_admin_user)],
)
def debt_account_ledger(
    account_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[DebtLedgerEntryResponse]:
    """List ledger entries for one debt account."""
    exists = db.get(DebtAccount, account_id)
    if exists is None:
        raise HTTPException(status_code=404, detail="Debt account not found")
    rows = db.scalars(
        select(DebtLedgerEntry)
        .where(DebtLedgerEntry.debt_account_id == account_id)
        .order_by(DebtLedgerEntry.created_at.desc())
        .limit(limit)
    ).all()
    return [_debt_ledger_to_response(db, r) for r in rows]


@router.post("/debt-payments", response_model=DebtLedgerEntryResponse, dependencies=[Depends(require_admin_user)])
def create_debt_payment(
    payload: DebtPaymentIn,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> DebtLedgerEntryResponse:
    """Record debt collection and reduce oldest outstanding orders."""
    account = db.get(DebtAccount, payload.debt_account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Debt account not found")
    amount = Decimal(str(payload.amount))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if amount > Decimal(str(account.current_balance)):
        raise HTTPException(status_code=400, detail="Amount exceeds current debt balance")
    row = DebtPayment(
        debt_account_id=account.id,
        amount=amount,
        payment_method=payload.payment_method.strip(),
        paid_at=payload.paid_at or datetime.now(UTC),
        collector_name=_strip_opt_text(payload.collector_name),
        note=_strip_opt_text(payload.note),
        returned_shell_units=int(payload.returned_shell_units or 0),
        created_by_user_id=actor.id,
    )
    db.add(row)
    db.flush()
    entry = _append_debt_entry(
        db,
        account_id=account.id,
        entry_type="payment",
        amount_signed=-amount,
        created_by_user_id=actor.id,
        note=payload.note,
        reference_type="debt_payment",
        reference_id=str(row.id),
    )
    _allocate_credit_to_orders(db, phone=account.customer_key, credit_amount=amount)
    _recompute_debt_balance(db, account)
    _recompute_order_outstanding_from_ledger(db, account=account)
    _write_audit(
        db,
        actor_user_id=actor.id,
        action="CREATE_DEBT_PAYMENT",
        target_type="debt_account",
        target_id=str(account.id),
        detail=str(amount),
    )
    db.commit()
    db.refresh(entry)
    return _debt_ledger_to_response(db, entry)


@router.patch("/debt-payments/{payment_id}", response_model=DebtLedgerEntryResponse, dependencies=[Depends(require_admin_user)])
def update_debt_payment(
    payment_id: int,
    payload: DebtPaymentUpdateIn,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> DebtLedgerEntryResponse:
    """Correct debt payment record and synchronize linked ledger row."""
    payment = db.get(DebtPayment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Debt payment not found")
    account = db.get(DebtAccount, payment.debt_account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Debt account not found")
    ledger = db.scalar(
        select(DebtLedgerEntry).where(
            DebtLedgerEntry.reference_type == "debt_payment",
            DebtLedgerEntry.reference_id == str(payment_id),
        )
    )
    if ledger is None:
        raise HTTPException(status_code=404, detail="Debt payment ledger entry not found")
    data = payload.model_dump(exclude_unset=True)
    if "amount" in data and data["amount"] is not None:
        amt = Decimal(str(data["amount"]))
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Amount must be > 0")
        payment.amount = amt
        ledger.amount_signed = -amt
    if "payment_method" in data and data["payment_method"] is not None:
        payment.payment_method = str(data["payment_method"]).strip()
    if "paid_at" in data:
        payment.paid_at = data["paid_at"] or datetime.now(UTC)
    if "collector_name" in data:
        payment.collector_name = _strip_opt_text(data["collector_name"])
    if "note" in data:
        payment.note = _strip_opt_text(data["note"])
        ledger.note = _strip_opt_text(data["note"])
    if "returned_shell_units" in data and data["returned_shell_units"] is not None:
        payment.returned_shell_units = int(data["returned_shell_units"])
    _recompute_debt_balance(db, account)
    _recompute_order_outstanding_from_ledger(db, account=account)
    _write_audit(
        db,
        actor_user_id=actor.id,
        action="UPDATE_DEBT_PAYMENT",
        target_type="debt_payment",
        target_id=str(payment_id),
    )
    db.commit()
    db.refresh(ledger)
    return _debt_ledger_to_response(db, ledger)


@router.delete("/debt-payments/{payment_id}", dependencies=[Depends(require_admin_user)])
def delete_debt_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, str]:
    """Delete wrong debt payment and recalculate balances."""
    payment = db.get(DebtPayment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Debt payment not found")
    account = db.get(DebtAccount, payment.debt_account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Debt account not found")
    ledger = db.scalar(
        select(DebtLedgerEntry).where(
            DebtLedgerEntry.reference_type == "debt_payment",
            DebtLedgerEntry.reference_id == str(payment_id),
        )
    )
    if ledger is not None:
        db.delete(ledger)
    db.delete(payment)
    _recompute_debt_balance(db, account)
    _recompute_order_outstanding_from_ledger(db, account=account)
    _write_audit(
        db,
        actor_user_id=actor.id,
        action="DELETE_DEBT_PAYMENT",
        target_type="debt_payment",
        target_id=str(payment_id),
    )
    db.commit()
    return {"status": "ok"}


@router.post("/debt-write-offs", response_model=DebtLedgerEntryResponse, dependencies=[Depends(require_admin_user)])
def create_debt_write_off(
    payload: DebtWriteOffIn,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> DebtLedgerEntryResponse:
    """Record write-off with approval and adjust account balance."""
    account = db.get(DebtAccount, payload.debt_account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Debt account not found")
    approver = db.get(User, payload.approved_by_user_id)
    if approver is None:
        raise HTTPException(status_code=404, detail="Approver not found")
    amount = Decimal(str(payload.amount))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if amount > Decimal(str(account.current_balance)):
        raise HTTPException(status_code=400, detail="Amount exceeds current debt balance")
    wo = DebtWriteOff(
        debt_account_id=account.id,
        amount=amount,
        reason=payload.reason.strip(),
        approved_by_user_id=payload.approved_by_user_id,
        created_by_user_id=actor.id,
    )
    db.add(wo)
    db.flush()
    entry = _append_debt_entry(
        db,
        account_id=account.id,
        entry_type="write_off",
        amount_signed=-amount,
        created_by_user_id=actor.id,
        note=payload.reason,
        reference_type="debt_write_off",
        reference_id=str(wo.id),
    )
    _allocate_credit_to_orders(db, phone=account.customer_key, credit_amount=amount)
    _recompute_debt_balance(db, account)
    _recompute_order_outstanding_from_ledger(db, account=account)
    _write_audit(
        db,
        actor_user_id=actor.id,
        action="CREATE_DEBT_WRITE_OFF",
        target_type="debt_account",
        target_id=str(account.id),
        detail=payload.reason,
    )
    db.commit()
    db.refresh(entry)
    return _debt_ledger_to_response(db, entry)


@router.get("/debt-aging", response_model=list[DebtAgingBucket], dependencies=[Depends(require_admin_user)])
def debt_aging(as_of: datetime | None = Query(default=None), db: Session = Depends(get_db)) -> list[DebtAgingBucket]:
    """Aggregate real outstanding receivable by order age buckets."""
    now = as_of or datetime.now()
    buckets: dict[str, Decimal] = {
        "0-7 ngày": Decimal("0"),
        "8-15 ngày": Decimal("0"),
        "16-30 ngày": Decimal("0"),
        "31+ ngày": Decimal("0"),
    }
    rows = db.scalars(select(SalesOrder).where(sales.active_order_clause(SalesOrder.outstanding_amount > 0))).all()
    for row in rows:
        if row.created_at is None:
            days = 0
        else:
            created = row.created_at.replace(tzinfo=None) if row.created_at.tzinfo else row.created_at
            days = max(0, (now - created).days)
        amount = Decimal(str(row.outstanding_amount))
        if days <= 7:
            buckets["0-7 ngày"] += amount
        elif days <= 15:
            buckets["8-15 ngày"] += amount
        elif days <= 30:
            buckets["16-30 ngày"] += amount
        else:
            buckets["31+ ngày"] += amount
    return [DebtAgingBucket(bucket=k, amount=v) for k, v in buckets.items()]


@router.get("/gas-ledger", response_model=list[GasLedgerRow], dependencies=[Depends(require_admin_user)])
def gas_ledger(db: Session = Depends(get_db)) -> list[GasLedgerRow]:
    """Flatten order lines into the ``sổ gas`` ledger shape (Excel columns)."""
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines))
        .where(sales.active_order_clause())
        .order_by(SalesOrder.created_at.desc())
    )
    orders = db.execute(stmt).unique().scalars().all()
    out: list[GasLedgerRow] = []
    for o in orders:
        parts: list[str] = [o.customer_name]
        if o.address:
            parts.append(o.address.strip())
        customer_usage = ", ".join(parts)
        for li in o.lines:
            if not order_line_eligible_for_gas_ledger(o, li):
                continue
            out.append(
                GasLedgerRow(
                    owner_name=li.owner_name,
                    cylinder_type=li.cylinder_type,
                    cylinder_serial=li.cylinder_serial,
                    inspection_expiry=li.inspection_expiry,
                    import_source=li.import_source,
                    import_date=li.import_date,
                    customer_name_and_address=customer_usage,
                    customer_phone=o.phone,
                    customer_address=(o.address.strip() if o.address and o.address.strip() else None),
                    delivery_date=o.delivery_date,
                )
            )
    return out


@router.get("/gas-ledger.csv", dependencies=[Depends(require_admin_user)])
def gas_ledger_csv(db: Session = Depends(get_db)):
    """CSV export matching the gas cylinder ledger columns."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "chủ sở hữu",
            "Loại chai",
            "Số sê ri chai",
            "Hạn kiểm định",
            "Nơi nhập chai chứa cho cửa hàng",
            "Ngày nhập",
            "Tên và địa chỉ khách hàng sử dụng",
            "SĐT khách",
            "Địa chỉ khách (riêng)",
            "Ngày giao chai cho khách hàng",
        ]
    )
    rows = gas_ledger(db)
    for r in rows:
        writer.writerow(
            [
                r.owner_name or "",
                r.cylinder_type or "",
                r.cylinder_serial or "",
                r.inspection_expiry.isoformat() if r.inspection_expiry else "",
                r.import_source or "",
                r.import_date.isoformat() if r.import_date else "",
                r.customer_name_and_address,
                r.customer_phone or "",
                r.customer_address or "",
                r.delivery_date.isoformat() if r.delivery_date else "",
            ]
        )
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="so_gas.csv"'},
    )


def _shell_debt_ledger_query(db: Session, q: str | None):
    """Build filtered query for orders with borrowed shell units."""
    filters = [
        SalesOrder.deleted_at.is_(None),
        SalesOrder.borrowed_shell_units > 0,
    ]
    if q and q.strip():
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                SalesOrder.customer_name.ilike(term),
                SalesOrder.phone.ilike(term),
                SalesOrder.order_code.ilike(term),
            )
        )
    return filters


def _shell_debt_rows(db: Session, q: str | None, limit: int) -> tuple[list[ShellDebtLedgerRow], int, int]:
    """Return ledger rows, total matching orders, and sum of borrowed shells."""
    filters = _shell_debt_ledger_query(db, q)
    count_stmt = select(func.count()).select_from(SalesOrder).where(*filters)
    total = int(db.scalar(count_stmt) or 0)
    sum_stmt = select(func.coalesce(func.sum(SalesOrder.borrowed_shell_units), 0)).where(*filters)
    total_shell = int(db.scalar(sum_stmt) or 0)
    stmt = (
        select(SalesOrder)
        .where(*filters)
        .order_by(SalesOrder.delivery_date.desc().nullslast(), SalesOrder.created_at.desc())
        .limit(limit)
    )
    orders = db.scalars(stmt).all()
    items = [
        ShellDebtLedgerRow(
            order_id=o.id,
            order_code=o.order_code,
            customer_name=o.customer_name,
            phone=o.phone,
            delivery_date=o.delivery_date,
            borrowed_shell_units=int(o.borrowed_shell_units or 0),
            delivery_status=str(o.delivery_status),
            address=o.address,
        )
        for o in orders
    ]
    return items, total, total_shell


@router.get("/shell-debt-ledger", response_model=ShellDebtLedgerResponse, dependencies=[Depends(require_admin_user)])
def shell_debt_ledger(
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> ShellDebtLedgerResponse:
    """List orders with borrowed shell units (nợ vỏ theo đơn)."""
    items, total, total_shell = _shell_debt_rows(db, q, limit)
    return ShellDebtLedgerResponse(items=items, total=total, total_shell_units=total_shell)


@router.get("/shell-debt-ledger.csv", dependencies=[Depends(require_admin_user)])
def shell_debt_ledger_csv(
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
):
    """CSV export of shell-debt ledger."""
    items, _, total_shell = _shell_debt_rows(db, q, 500)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Mã đơn", "Khách hàng", "SĐT", "Ngày giao", "Số vỏ mượn", "Trạng thái giao", "Địa chỉ"])
    for r in items:
        writer.writerow(
            [
                r.order_code,
                r.customer_name,
                r.phone or "",
                r.delivery_date.isoformat() if r.delivery_date else "",
                r.borrowed_shell_units,
                r.delivery_status,
                r.address or "",
            ]
        )
    writer.writerow([])
    writer.writerow(["Tổng", "", "", "", total_shell, f"{len(items)} đơn (max 500)", ""])
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="so_no_vo.csv"'},
    )


@router.get("/sales-gas-export.csv", dependencies=[Depends(require_admin_user)])
def sales_gas_export_csv(db: Session = Depends(get_db)):
    """Flatten every order line with VAT header fields and gas/cylinder columns."""
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines).joinedload(SalesOrderItem.product))
        .where(sales.active_order_clause())
        .order_by(SalesOrder.id.desc())
    )
    orders = db.execute(stmt).unique().scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "order_id",
            "order_code",
            "order_created_at",
            "delivery_date",
            "store_contact",
            "customer_name",
            "customer_phone",
            "customer_address",
            "order_note",
            "vat_rate_pct",
            "order_subtotal",
            "vat_amount",
            "order_total",
            "line_id",
            "product_id",
            "product_sku",
            "product_name",
            "qty",
            "unit_price",
            "line_subtotal",
            "owner_name",
            "cylinder_type",
            "cylinder_serial",
            "inspection_expiry",
            "import_source",
            "import_date",
        ]
    )
    for o in orders:
        for li in o.lines:
            sku = (li.product.sku if getattr(li, "product", None) else None) or ""
            writer.writerow(
                [
                    o.id,
                    o.order_code,
                    o.created_at.isoformat(),
                    o.delivery_date.isoformat() if o.delivery_date else "",
                    (o.store_contact or "").replace("\n", " ").strip(),
                    o.customer_name,
                    o.phone or "",
                    (o.address or "").replace("\n", " ").strip(),
                    (o.note or "").replace("\n", " ").strip(),
                    o.vat_rate,
                    str(o.subtotal),
                    str(o.vat_amount),
                    str(o.total),
                    li.id,
                    li.product_id,
                    sku,
                    li.product_name,
                    li.quantity,
                    str(li.unit_price),
                    str(li.line_subtotal),
                    li.owner_name or "",
                    li.cylinder_type or "",
                    li.cylinder_serial or "",
                    li.inspection_expiry.isoformat() if li.inspection_expiry else "",
                    (li.import_source or "").replace("\n", " ").strip(),
                    li.import_date.isoformat() if li.import_date else "",
                ]
            )
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="sales_gas_export.csv"'},
    )


@router.get("/shift-settlements", response_model=list[ShiftSettlementResponse], dependencies=[Depends(require_admin_user)])
def list_shift_settlements(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[ShiftSettlementResponse]:
    """List recent shift settlements for core-ops cash reconciliation."""
    rows = db.scalars(select(ShiftSettlement).order_by(ShiftSettlement.created_at.desc()).limit(limit)).all()
    return [ShiftSettlementResponse.model_validate(r) for r in rows]


@router.post("/shift-settlements", response_model=ShiftSettlementResponse, dependencies=[Depends(require_admin_user)])
def create_shift_settlement(
    payload: ShiftSettlementIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ShiftSettlementResponse:
    """Create a shift settlement row and auto-compute delta anomaly."""
    delta = payload.actual_cash - payload.expected_cash
    row = ShiftSettlement(
        shift_date=payload.shift_date,
        shift_label=payload.shift_label.strip(),
        expected_cash=payload.expected_cash,
        actual_cash=payload.actual_cash,
        delta_cash=delta,
        note=_strip_opt_text(payload.note),
        created_by_user_id=user.id,
    )
    db.add(row)
    _write_audit(
        db,
        actor_user_id=user.id,
        action="CREATE_SHIFT_SETTLEMENT",
        target_type="shift_settlement",
        target_id=str(payload.shift_date),
        detail=f"delta={delta}",
    )
    db.commit()
    db.refresh(row)
    return ShiftSettlementResponse.model_validate(row)


@router.get("/shift-settlements/anomalies", dependencies=[Depends(require_admin_user)])
def list_shift_settlement_anomalies(db: Session = Depends(get_db)) -> dict[str, list[dict]]:
    """Return simple anomaly list where cash delta is non-zero."""
    rows = db.scalars(
        select(ShiftSettlement).where(ShiftSettlement.delta_cash != 0).order_by(ShiftSettlement.created_at.desc()).limit(100)
    ).all()
    return {
        "items": [
            {
                "id": r.id,
                "shift_date": r.shift_date.isoformat(),
                "shift_label": r.shift_label,
                "expected_cash": str(r.expected_cash),
                "actual_cash": str(r.actual_cash),
                "delta_cash": str(r.delta_cash),
                "note": r.note,
            }
            for r in rows
        ]
    }


@router.get("/finance-kpis", response_model=list[FinanceKpiBaselineResponse], dependencies=[Depends(require_admin_user)])
def list_finance_kpis(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[FinanceKpiBaselineResponse]:
    """List finance-governance KPI baselines and measured values."""
    rows = db.scalars(select(FinanceKpiBaseline).order_by(FinanceKpiBaseline.created_at.desc()).limit(limit)).all()
    return [FinanceKpiBaselineResponse.model_validate(r) for r in rows]


@router.post("/finance-kpis", response_model=FinanceKpiBaselineResponse, dependencies=[Depends(require_admin_user)])
def create_finance_kpi(
    payload: FinanceKpiBaselineIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FinanceKpiBaselineResponse:
    """Create a KPI baseline/measurement row."""
    row = FinanceKpiBaseline(**payload.model_dump())
    db.add(row)
    _write_audit(
        db,
        actor_user_id=user.id,
        action="CREATE_FINANCE_KPI",
        target_type="finance_kpi",
        target_id=payload.kpi_key,
        detail=payload.label,
    )
    db.commit()
    db.refresh(row)
    return FinanceKpiBaselineResponse.model_validate(row)


@router.get("/customer-journey-events", response_model=list[CustomerJourneyEventResponse], dependencies=[Depends(require_admin_user)])
def list_customer_journey_events(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[CustomerJourneyEventResponse]:
    """List customer journey events in reverse time order."""
    rows = db.scalars(select(CustomerJourneyEvent).order_by(CustomerJourneyEvent.happened_at.desc()).limit(limit)).all()
    return [CustomerJourneyEventResponse.model_validate(r) for r in rows]


@router.post("/customer-journey-events", response_model=CustomerJourneyEventResponse, dependencies=[Depends(require_admin_user)])
def create_customer_journey_event(
    payload: CustomerJourneyEventIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomerJourneyEventResponse:
    """Insert a customer lifecycle event used by CX dashboards."""
    row = CustomerJourneyEvent(
        customer_name=payload.customer_name.strip(),
        step_key=payload.step_key.strip(),
        step_label=payload.step_label.strip(),
        channel=_strip_opt_text(payload.channel),
        order_id=payload.order_id,
        status=payload.status.strip(),
        note=_strip_opt_text(payload.note),
    )
    db.add(row)
    _write_audit(
        db,
        actor_user_id=user.id,
        action="CREATE_CUSTOMER_JOURNEY_EVENT",
        target_type="customer_journey_event",
        target_id=payload.step_key,
        detail=payload.customer_name,
    )
    db.commit()
    db.refresh(row)
    return CustomerJourneyEventResponse.model_validate(row)


@router.get("/complaint-tickets", response_model=list[ComplaintTicketResponse], dependencies=[Depends(require_admin_user)])
def list_complaint_tickets(
    status: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[ComplaintTicketResponse]:
    """List complaint tickets with optional status filter."""
    stmt = select(ComplaintTicket).order_by(ComplaintTicket.updated_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(ComplaintTicket.status == status.strip())
    rows = db.scalars(stmt).all()
    return [ComplaintTicketResponse.model_validate(r) for r in rows]


@router.post("/complaint-tickets", response_model=ComplaintTicketResponse, dependencies=[Depends(require_admin_user)])
def create_complaint_ticket(
    payload: ComplaintTicketIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ComplaintTicketResponse:
    """Create a complaint ticket with SLA metadata."""
    row = ComplaintTicket(
        customer_name=payload.customer_name.strip(),
        issue_text=payload.issue_text.strip(),
        owner_name=payload.owner_name.strip(),
        status=payload.status.strip(),
        sla_due_at=payload.sla_due_at,
    )
    db.add(row)
    _write_audit(
        db,
        actor_user_id=user.id,
        action="CREATE_COMPLAINT_TICKET",
        target_type="complaint_ticket",
        detail=payload.customer_name,
    )
    db.commit()
    db.refresh(row)
    return ComplaintTicketResponse.model_validate(row)


@router.patch("/complaint-tickets/{ticket_id}", response_model=ComplaintTicketResponse, dependencies=[Depends(require_admin_user)])
def update_complaint_ticket(
    ticket_id: int,
    payload: ComplaintTicketUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ComplaintTicketResponse:
    """Patch owner/status/content for complaint ticket."""
    row = db.get(ComplaintTicket, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Complaint ticket not found")
    data = payload.model_dump(exclude_unset=True)
    if "owner_name" in data and data["owner_name"] is not None:
        row.owner_name = data["owner_name"].strip()
    if "status" in data and data["status"] is not None:
        row.status = data["status"].strip()
    if "issue_text" in data and data["issue_text"] is not None:
        row.issue_text = data["issue_text"].strip()
    if "sla_due_at" in data:
        row.sla_due_at = data["sla_due_at"]
    _write_audit(
        db,
        actor_user_id=user.id,
        action="UPDATE_COMPLAINT_TICKET",
        target_type="complaint_ticket",
        target_id=str(ticket_id),
    )
    db.commit()
    db.refresh(row)
    return ComplaintTicketResponse.model_validate(row)


@router.get("/safety-checklist-runs", response_model=list[SafetyChecklistRunResponse], dependencies=[Depends(require_admin_user)])
def list_safety_checklist_runs(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[SafetyChecklistRunResponse]:
    """List safety checklist runs before dispatch."""
    rows = db.scalars(select(SafetyChecklistRun).order_by(SafetyChecklistRun.created_at.desc()).limit(limit)).all()
    return [SafetyChecklistRunResponse.model_validate(r) for r in rows]


@router.post("/safety-checklist-runs", response_model=SafetyChecklistRunResponse, dependencies=[Depends(require_admin_user)])
def create_safety_checklist_run(
    payload: SafetyChecklistRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SafetyChecklistRunResponse:
    """Create a safety checklist run; completed=true only when all critical checks pass and inspection not expired."""
    inspection_valid = payload.inspection_expiry is not None and payload.inspection_expiry >= payload.run_date
    completed = payload.valve_ok and payload.seal_ok and payload.leak_ok and payload.inspection_ok and inspection_valid
    row = SafetyChecklistRun(
        run_date=payload.run_date,
        shift_label=payload.shift_label.strip(),
        valve_ok=payload.valve_ok,
        seal_ok=payload.seal_ok,
        leak_ok=payload.leak_ok,
        inspection_ok=payload.inspection_ok,
        inspection_expiry=payload.inspection_expiry,
        completed=completed,
        created_by_user_id=user.id,
    )
    db.add(row)
    _write_audit(
        db,
        actor_user_id=user.id,
        action="CREATE_SAFETY_CHECKLIST_RUN",
        target_type="safety_checklist_run",
        detail=f"completed={completed}",
    )
    db.commit()
    db.refresh(row)
    return SafetyChecklistRunResponse.model_validate(row)


@router.get("/capa-items", response_model=list[CapaItemResponse], dependencies=[Depends(require_admin_user)])
def list_capa_items(
    status: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[CapaItemResponse]:
    """List CAPA board items."""
    stmt = select(CapaItem).order_by(CapaItem.updated_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(CapaItem.status == status.strip())
    rows = db.scalars(stmt).all()
    return [CapaItemResponse.model_validate(r) for r in rows]


@router.post("/capa-items", response_model=CapaItemResponse, dependencies=[Depends(require_admin_user)])
def create_capa_item(
    payload: CapaItemIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CapaItemResponse:
    """Create CAPA board item."""
    row = CapaItem(
        title=payload.title.strip(),
        owner_name=payload.owner_name.strip(),
        detail=_strip_opt_text(payload.detail),
        status=payload.status.strip(),
    )
    db.add(row)
    _write_audit(
        db,
        actor_user_id=user.id,
        action="CREATE_CAPA_ITEM",
        target_type="capa_item",
        detail=payload.title,
    )
    db.commit()
    db.refresh(row)
    return CapaItemResponse.model_validate(row)


@router.patch("/capa-items/{item_id}", response_model=CapaItemResponse, dependencies=[Depends(require_admin_user)])
def update_capa_item(
    item_id: int,
    payload: CapaItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CapaItemResponse:
    """Patch CAPA status/owner/detail."""
    row = db.get(CapaItem, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="CAPA item not found")
    data = payload.model_dump(exclude_unset=True)
    if "owner_name" in data and data["owner_name"] is not None:
        row.owner_name = data["owner_name"].strip()
    if "status" in data and data["status"] is not None:
        row.status = data["status"].strip()
    if "detail" in data:
        row.detail = _strip_opt_text(data["detail"])
    _write_audit(
        db,
        actor_user_id=user.id,
        action="UPDATE_CAPA_ITEM",
        target_type="capa_item",
        target_id=str(item_id),
    )
    db.commit()
    db.refresh(row)
    return CapaItemResponse.model_validate(row)


@router.get("/audit-logs", response_model=list[AuditLogEntryResponse], dependencies=[Depends(require_admin_user)])
def list_audit_logs(
    action: str | None = Query(default=None),
    limit: int = Query(default=300, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> list[AuditLogEntryResponse]:
    """List audit log entries with optional action filter."""
    stmt = select(AuditLogEntry).order_by(AuditLogEntry.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLogEntry.action == action.strip())
    rows = db.scalars(stmt).all()
    return [AuditLogEntryResponse.model_validate(r) for r in rows]


@router.post("/audit-logs", response_model=AuditLogEntryResponse, dependencies=[Depends(require_admin_user)])
def create_audit_log(
    payload: AuditLogEntryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AuditLogEntryResponse:
    """Manual audit entry endpoint for explicit logging from UI operations."""
    row = _write_audit(
        db,
        actor_user_id=user.id,
        action=payload.action,
        target_type=payload.target_type,
        target_id=payload.target_id,
        detail=payload.detail,
    )
    db.commit()
    db.refresh(row)
    return AuditLogEntryResponse.model_validate(row)


@router.get("/dashboard", response_model=DashboardPayload, dependencies=[Depends(require_admin_user)])
def dashboard_bundle(db: Session = Depends(get_db)) -> DashboardPayload:
    """Orders (30d) with totals + full product list for Tổng quan."""
    since = datetime.now(tz=UTC) - timedelta(days=29)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    order_rows = db.scalars(
        select(SalesOrder).where(sales.active_order_clause(SalesOrder.created_at >= since)).order_by(SalesOrder.created_at)
    ).all()
    orders_json = [{"total": str(o.total), "created_at": o.created_at.isoformat()} for o in order_rows]
    products = db.scalars(select(Product).order_by(Product.name)).all()
    return DashboardPayload(
        orders=orders_json,
        products=[_product_to_response(p) for p in products],
    )


@router.get(
    "/operations/delivery-day-summary",
    response_model=DeliveryDaySummaryResponse,
    dependencies=[Depends(require_admin_user)],
)
def delivery_day_summary(
    dates: str = Query(..., description="Comma-separated YYYY-MM-DD (ngày giao)"),
    db: Session = Depends(get_db),
) -> DeliveryDaySummaryResponse:
    """List orders with ``delivery_date`` in the given set and aggregate money / quantities."""
    raw_parts = [p.strip() for p in dates.split(",") if p.strip()]
    if not raw_parts:
        raise HTTPException(status_code=400, detail="Cần ít nhất một ngày (YYYY-MM-DD)")
    parsed: list[date] = []
    for p in raw_parts:
        try:
            parsed.append(date.fromisoformat(p))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Ngày không hợp lệ: {p}") from e
    unique_dates = sorted(set(parsed))
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines), joinedload(SalesOrder.assigned_to))
        .where(sales.active_order_clause(SalesOrder.delivery_date.in_(unique_dates)))
        .order_by(SalesOrder.delivery_date.asc(), SalesOrder.id.asc())
    )
    rows = db.execute(stmt).unique().scalars().all()
    orders_out = [sales.order_to_response(o) for o in rows]
    total_amt = sum((o.total for o in rows), Decimal("0"))
    line_qty_total = 0
    by_pid: dict[int, tuple[str, int]] = {}
    for o in rows:
        for li in o.lines:
            line_qty_total += li.quantity
            prev = by_pid.get(li.product_id)
            if prev:
                by_pid[li.product_id] = (prev[0], prev[1] + li.quantity)
            else:
                by_pid[li.product_id] = (li.product_name, li.quantity)
    roll = [ProductQtyRollup(product_id=pid, product_name=name, quantity=qty) for pid, (name, qty) in sorted(by_pid.items())]
    return DeliveryDaySummaryResponse(
        dates=[d.isoformat() for d in unique_dates],
        orders=orders_out,
        total_amount=total_amt,
        total_line_quantity=line_qty_total,
        line_qty_by_product=roll,
    )


def _aggregate_delivered_full(db: Session, business_date: date) -> int:
    """Sum line quantities for completed orders on ``delivery_date``."""
    q = (
        select(func.coalesce(func.sum(SalesOrderItem.quantity), 0))
        .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
        .where(
            sales.active_order_clause(
                SalesOrder.delivery_date == business_date,
                SalesOrder.delivery_status == "completed",
            )
        )
    )
    return int(db.scalar(q) or 0)


def _aggregate_borrowed_shells(db: Session, business_date: date) -> int:
    """Sum ``borrowed_shell_units`` on completed orders for that delivery day."""
    q = select(func.coalesce(func.sum(SalesOrder.borrowed_shell_units), 0)).where(
        sales.active_order_clause(
            SalesOrder.delivery_date == business_date,
            SalesOrder.delivery_status == "completed",
        )
    )
    return int(db.scalar(q) or 0)


def _aggregate_returned_shells_debt(db: Session, business_date: date) -> int:
    """Sum vỏ trả kèm trả nợ; business day uses UTC+7 calendar on ``paid_at``."""
    dialect = db.bind.dialect.name if db.bind is not None else "postgresql"
    if dialect == "sqlite":
        total = 0
        for payment in db.scalars(select(DebtPayment)).all():
            if to_business_date(payment.paid_at) == business_date:
                total += int(payment.returned_shell_units or 0)
        return total
    q = select(func.coalesce(func.sum(DebtPayment.returned_shell_units), 0)).where(
        func.date(func.timezone("Asia/Ho_Chi_Minh", DebtPayment.paid_at)) == business_date
    )
    return int(db.scalar(q) or 0)


def _build_daily_cylinder_computed(db: Session, business_date: date, row: DailyCylinderAudit | None) -> DailyCylinderAuditComputed:
    """Apply end-of-day reconciliation: water from supplier (``import_full``) and shells to supplier (``supplier_shell_units``) are independent."""
    delivered = _aggregate_delivered_full(db, business_date)
    borrowed = _aggregate_borrowed_shells(db, business_date)
    returned = _aggregate_returned_shells_debt(db, business_date)
    mf = int(row.morning_full) if row else 0
    ms = int(row.morning_shell) if row else 0
    imp = int(row.import_full) if row else 0
    sup_shell = int(row.supplier_shell_units) if row else 0
    eve_f = int(row.evening_full) if row else 0
    eve_s = int(row.evening_shell) if row else 0
    exp_f = mf + imp - delivered
    exp_s = ms + delivered - sup_shell - borrowed + returned
    var_f: int | None = (eve_f - exp_f) if row is not None else None
    var_s: int | None = (eve_s - exp_s) if row is not None else None
    return DailyCylinderAuditComputed(
        delivered_full=delivered,
        borrowed_shell_total=borrowed,
        returned_shells_debt=returned,
        expected_evening_full=exp_f,
        expected_evening_shell=exp_s,
        variance_full=var_f,
        variance_shell=var_s,
    )


@router.get(
    "/operations/daily-cylinder-audit",
    response_model=DailyCylinderAuditPayload,
    dependencies=[Depends(require_admin_user)],
)
def get_daily_cylinder_audit(
    audit_date: str = Query(..., description="YYYY-MM-DD (business_date)"),
    db: Session = Depends(get_db),
) -> DailyCylinderAuditPayload:
    """Kiểm kê nước/vỏ theo ngày + computed đối soát từ đơn và trả nợ."""
    try:
        d = date.fromisoformat(audit_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Ngày không hợp lệ (YYYY-MM-DD)") from e
    row = db.scalar(select(DailyCylinderAudit).where(DailyCylinderAudit.business_date == d))
    computed = _build_daily_cylinder_computed(db, d, row)
    rec = DailyCylinderAuditRecord.model_validate(row) if row is not None else None
    return DailyCylinderAuditPayload(record=rec, computed=computed)


@router.put(
    "/operations/daily-cylinder-audit/{business_date}",
    response_model=DailyCylinderAuditPayload,
    dependencies=[Depends(require_admin_user)],
)
def put_daily_cylinder_audit(
    business_date: str,
    payload: DailyCylinderAuditUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> DailyCylinderAuditPayload:
    """Upsert morning/evening counts for one calendar day."""
    try:
        d = date.fromisoformat(business_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Ngày không hợp lệ (YYYY-MM-DD)") from e
    row = db.scalar(select(DailyCylinderAudit).where(DailyCylinderAudit.business_date == d))
    if row is None:
        row = DailyCylinderAudit(business_date=d, created_by_user_id=actor.id)
        db.add(row)
        db.flush()
    data = payload.model_dump(exclude_unset=True)
    if "morning_full" in data and data["morning_full"] is not None:
        row.morning_full = int(data["morning_full"])
    if "morning_shell" in data and data["morning_shell"] is not None:
        row.morning_shell = int(data["morning_shell"])
    if "import_full" in data and data["import_full"] is not None:
        row.import_full = int(data["import_full"])
    if "supplier_shell_units" in data and data["supplier_shell_units"] is not None:
        row.supplier_shell_units = int(data["supplier_shell_units"])
    if "evening_full" in data and data["evening_full"] is not None:
        row.evening_full = int(data["evening_full"])
    if "evening_shell" in data and data["evening_shell"] is not None:
        row.evening_shell = int(data["evening_shell"])
    if "note" in data:
        row.note = _strip_opt_text(data.get("note"))
    row.updated_at = datetime.now(UTC)
    _write_audit(
        db,
        actor_user_id=actor.id,
        action="UPSERT_DAILY_CYLINDER_AUDIT",
        target_type="daily_cylinder_audit",
        target_id=business_date,
        detail=None,
    )
    db.commit()
    db.refresh(row)
    computed = _build_daily_cylinder_computed(db, d, row)
    return DailyCylinderAuditPayload(record=DailyCylinderAuditRecord.model_validate(row), computed=computed)


@router.get("/orders/tax-report", response_model=list[TaxReportRow], dependencies=[Depends(require_admin_user)])
def tax_report(
    date_from: str = Query(..., alias="from", description="YYYY-MM-DD"),
    date_to: str = Query(..., alias="to", description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> list[TaxReportRow]:
    """Orders in date range for Báo cáo thuế page."""
    try:
        start = datetime.fromisoformat(date_from + "T00:00:00").replace(tzinfo=UTC)
        end = datetime.fromisoformat(date_to + "T23:59:59.999999").replace(tzinfo=UTC)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid date format") from e
    stmt = (
        select(SalesOrder)
        .where(sales.active_order_clause(SalesOrder.created_at >= start, SalesOrder.created_at <= end))
        .order_by(SalesOrder.created_at.asc())
    )
    rows = db.scalars(stmt).all()
    return [TaxReportRow.model_validate(r) for r in rows]


@router.get("/orders/{order_id}", response_model=SalesOrderResponse, dependencies=[Depends(require_admin_user)])
def get_order(order_id: int, db: Session = Depends(get_db)) -> SalesOrderResponse:
    """Return one order with lines (phiếu giao / chi tiết)."""
    try:
        return sales.load_sales_order_response(db, order_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/orders/{order_id}/delivery-slip.html", dependencies=[Depends(require_admin_user)])
def delivery_slip_html(order_id: int, db: Session = Depends(get_db)):
    """Download printable HTML for ``PHIẾU GIAO HÀNG`` (one section per line)."""
    o = db.scalars(select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)).first()
    if o is None:
        raise HTTPException(status_code=404, detail="Order not found")
    doc = render_delivery_slip_html(o)
    fn = f"{invoice_filename_stem(o.customer_name, o.phone, f'phieu-{order_id}')}.html"
    return Response(
        content=doc,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": content_disposition_filename(fn)},
    )


@router.get("/orders/{order_id}/gas-export.csv", dependencies=[Depends(require_admin_user)])
def order_gas_export_csv(order_id: int, db: Session = Depends(get_db)):
    """CSV for a single order in the same column layout as ``/gas-ledger.csv``."""
    o = db.scalars(select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)).first()
    if o is None:
        raise HTTPException(status_code=404, detail="Order not found")
    parts: list[str] = [o.customer_name]
    if o.address:
        parts.append(o.address.strip())
    customer_usage = ", ".join(parts)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "chủ sở hữu",
            "Loại chai",
            "Số sê ri chai",
            "Hạn kiểm định",
            "Nơi nhập chai chứa cho cửa hàng",
            "Ngày nhập",
            "Tên và địa chỉ khách hàng sử dụng",
            "SĐT khách",
            "Địa chỉ khách (riêng)",
            "Ngày giao chai cho khách hàng",
        ]
    )
    for li in o.lines:
        if not order_line_eligible_for_gas_ledger(o, li):
            continue
        writer.writerow(
            [
                li.owner_name or "",
                li.cylinder_type or "",
                li.cylinder_serial or "",
                li.inspection_expiry.isoformat() if li.inspection_expiry else "",
                li.import_source or "",
                li.import_date.isoformat() if li.import_date else "",
                customer_usage,
                o.phone or "",
                (o.address.strip() if o.address and o.address.strip() else ""),
                o.delivery_date.isoformat() if o.delivery_date else "",
            ]
        )
    fn = f"{invoice_filename_stem(o.customer_name, o.phone, f'order-{order_id}')}.csv"
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": content_disposition_filename(fn)},
    )


@router.get("/tax-export.csv", dependencies=[Depends(require_admin_user)])
def tax_export_csv(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
):
    """
    CSV export for accounting (line-level).

    See ``docs/thue-va-xuat-du-lieu.md``.
    """
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines).joinedload(SalesOrderItem.product))
        .where(sales.active_order_clause())
        .order_by(SalesOrder.id)
    )
    orders = db.execute(stmt).unique().scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "order_id",
            "order_code",
            "order_date",
            "customer_name",
            "phone",
            "line_id",
            "product_sku",
            "product_name",
            "qty",
            "unit_price",
            "line_subtotal",
            "order_subtotal",
            "vat_rate_pct",
            "vat_amount",
            "order_total",
            "note_tax_placeholder",
            "delivery_date",
            "store_contact",
            "customer_address",
            "owner_name",
            "cylinder_type",
            "cylinder_serial",
            "inspection_expiry",
            "import_source",
            "import_date",
        ]
    )
    for o in orders:
        if date_from and o.created_at < date_from:
            continue
        if date_to and o.created_at > date_to:
            continue
        for li in o.lines:
            sku = (li.product.sku if getattr(li, "product", None) else None) or ""
            writer.writerow(
                [
                    o.id,
                    o.order_code,
                    o.created_at.isoformat(),
                    o.customer_name,
                    o.phone or "",
                    li.id,
                    sku or "",
                    li.product_name,
                    li.quantity,
                    str(li.unit_price),
                    str(li.line_subtotal),
                    str(o.subtotal),
                    o.vat_rate,
                    str(o.vat_amount),
                    str(o.total),
                    "",
                    o.delivery_date.isoformat() if o.delivery_date else "",
                    (o.store_contact or "").replace("\n", " ").strip(),
                    (o.address or "").replace("\n", " ").strip(),
                    li.owner_name or "",
                    li.cylinder_type or "",
                    li.cylinder_serial or "",
                    li.inspection_expiry.isoformat() if li.inspection_expiry else "",
                    (li.import_source or "").replace("\n", " ").strip(),
                    li.import_date.isoformat() if li.import_date else "",
                ]
            )
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tax_export.csv"'},
    )
