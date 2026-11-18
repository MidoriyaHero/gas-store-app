"""Admin-only OCR order drafts: photo of a handwritten order sheet → one draft per order → reviewed → real order.

A full page takes minutes on free VLMs (beyond proxy/Cloudflare timeouts), so upload and reparse only store a
``processing`` placeholder and read the photo in a background task; the web UI polls the list until it settles.
All drafts read from one photo share its ``image_path``.
"""

import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, require_admin_user
from app.api.routes import create_order_with_debt
from app.config import get_settings
from app.database import SessionLocal, get_db
from app.models import OrderDraft, OrderDraftStatus, Product, User
from app.schemas import OrderDraftExtraction, OrderDraftResponse, SalesOrderCreate, SalesOrderResponse
from app.services import order_ocr
from app.timezone import business_date_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/order-drafts", tags=["order-drafts"], dependencies=[Depends(require_admin_user)])

_EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_MIME_BY_EXT = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
_CONVERTED_DETAIL = "Đơn nháp đã được lưu thành đơn"
_PROCESSING_DETAIL = "Ảnh đang được đọc, chờ xong rồi thử lại"
_INTERRUPTED_MESSAGE = "Đọc ảnh bị gián đoạn (máy chủ khởi động lại), bấm Đọc lại"


def _draft_to_response(row: OrderDraft) -> OrderDraftResponse:
    return OrderDraftResponse(
        id=row.id,
        status=row.status,
        image_url="/media/" + row.image_path,
        extraction=OrderDraftExtraction.model_validate(row.extraction or {}),
        error_message=row.error_message,
        model_name=row.model_name,
        sales_order_id=row.sales_order_id,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_draft(db: Session, draft_id: int) -> OrderDraft:
    row = db.get(OrderDraft, draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn nháp")
    return row


def _media_base() -> Path:
    return Path(get_settings().media_root).resolve()


def _image_file(row: OrderDraft) -> Path:
    base = _media_base()
    path = (base / row.image_path).resolve()
    try:
        path.relative_to(base)
    except ValueError as e:
        raise HTTPException(status_code=500, detail="Invalid media path") from e
    return path


def _sheet_rows(draft: OrderDraft, db: Session) -> list[OrderDraft]:
    """All drafts read from the same photo, in sheet order."""
    stmt = select(OrderDraft).where(OrderDraft.image_path == draft.image_path).order_by(OrderDraft.id)
    return list(db.execute(stmt).scalars().all())


def _require_ocr_configured() -> None:
    try:
        order_ocr.ocr_credentials(get_settings())
    except order_ocr.OcrNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


def _process_sheet(placeholder_id: int, image_bytes: bytes) -> None:
    """Background task: read the photo and turn the placeholder into one draft per order (or an error draft)."""
    with SessionLocal() as db:
        placeholder = db.get(OrderDraft, placeholder_id)
        if placeholder is None:
            return
        products = list(db.execute(select(Product).where(Product.is_active.is_(True))).scalars().all())
        mime_type = placeholder.mime_type or "image/jpeg"
        try:
            orders, raw, model_used = order_ocr.extract_orders_from_image(
                image_bytes, mime_type, products, settings=get_settings()
            )
            error = None
        except (order_ocr.OcrExtractionError, order_ocr.OcrNotConfiguredError) as e:
            orders, raw, model_used, error = [], None, None, str(e)
        except Exception:
            logger.exception("OCR failed for order draft %s", placeholder_id)
            orders, raw, model_used, error = [], None, None, "Lỗi không mong đợi khi đọc ảnh"

        db.refresh(placeholder)
        # Deleted (or otherwise settled) while the VLM was running: drop the result.
        if placeholder.status != OrderDraftStatus.PROCESSING.value:
            return
        if error is not None:
            placeholder.status = OrderDraftStatus.ERROR.value
            placeholder.error_message = error
            placeholder.extraction = {}
            db.commit()
            return
        first, *rest = orders
        placeholder.status = OrderDraftStatus.PARSED.value
        placeholder.extraction = first.model_dump(mode="json")
        placeholder.raw_model_output = raw
        placeholder.model_name = model_used
        placeholder.error_message = None
        db.add_all(
            OrderDraft(
                created_by_user_id=placeholder.created_by_user_id,
                image_path=placeholder.image_path,
                mime_type=mime_type,
                status=OrderDraftStatus.PARSED.value,
                extraction=o.model_dump(mode="json"),
                raw_model_output=raw,
                model_name=model_used,
            )
            for o in rest
        )
        db.commit()


def fail_interrupted_drafts(db: Session) -> None:
    """Startup hook: background tasks die with the process, so leftover placeholders become retryable errors."""
    db.execute(
        update(OrderDraft)
        .where(OrderDraft.status == OrderDraftStatus.PROCESSING.value)
        .values(status=OrderDraftStatus.ERROR.value, error_message=_INTERRUPTED_MESSAGE)
    )
    db.commit()


@router.post("", response_model=OrderDraftResponse)
def create_order_draft(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> OrderDraftResponse:
    """Store a photo of an order sheet and queue reading it; each order on it becomes its own draft."""
    settings = get_settings()
    ext = Path(file.filename or "").suffix.lower()
    if not ext:
        ext = _EXT_BY_MIME.get((file.content_type or "").lower(), "")
    if ext not in _MIME_BY_EXT:
        raise HTTPException(status_code=400, detail="Chỉ nhận ảnh JPG, PNG hoặc WEBP")
    max_bytes = settings.order_draft_image_max_bytes
    body = file.file.read(max_bytes + 1)
    if len(body) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Ảnh quá lớn (tối đa {max_bytes // (1024 * 1024)}MB)")
    if not body:
        raise HTTPException(status_code=400, detail="File ảnh rỗng")
    _require_ocr_configured()

    rel_dir = f"order-drafts/{business_date_now():%Y-%m}"
    out_name = f"{uuid4().hex}{ext}"
    base = _media_base()
    dest_dir = (base / rel_dir).resolve()
    try:
        dest_dir.relative_to(base)
    except ValueError as e:
        raise HTTPException(status_code=500, detail="Invalid media path") from e
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / out_name).write_bytes(body)

    placeholder = OrderDraft(
        created_by_user_id=actor.id,
        image_path=f"{rel_dir}/{out_name}",
        mime_type=_MIME_BY_EXT[ext],
        status=OrderDraftStatus.PROCESSING.value,
        extraction={},
    )
    db.add(placeholder)
    db.commit()
    db.refresh(placeholder)
    background.add_task(_process_sheet, placeholder.id, body)
    return _draft_to_response(placeholder)


@router.get("", response_model=list[OrderDraftResponse])
def list_order_drafts(
    include_converted: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[OrderDraftResponse]:
    """Newest photos first, orders of one photo in sheet order; converted drafts hidden unless ``include_converted``.

    A photo's drafts are inserted placeholder-first, so its smallest id orders photos and ids order lines.
    """
    sheet = (
        select(OrderDraft.image_path, func.min(OrderDraft.id).label("first_id"))
        .group_by(OrderDraft.image_path)
        .subquery()
    )
    stmt = (
        select(OrderDraft)
        .join(sheet, sheet.c.image_path == OrderDraft.image_path)
        .order_by(sheet.c.first_id.desc(), OrderDraft.id.asc())
        .limit(limit)
    )
    if not include_converted:
        stmt = stmt.where(OrderDraft.status != OrderDraftStatus.CONVERTED.value)
    return [_draft_to_response(r) for r in db.execute(stmt).scalars().all()]


@router.get("/{draft_id}", response_model=OrderDraftResponse)
def get_order_draft(draft_id: int, db: Session = Depends(get_db)) -> OrderDraftResponse:
    return _draft_to_response(_get_draft(db, draft_id))


@router.post("/{draft_id}/reparse", response_model=OrderDraftResponse)
def reparse_order_draft(
    draft_id: int, background: BackgroundTasks, db: Session = Depends(get_db)
) -> OrderDraftResponse:
    """Queue reading the photo again; every draft from that photo is replaced (refused once any was saved)."""
    draft = _get_draft(db, draft_id)
    siblings = _sheet_rows(draft, db)
    if any(s.status == OrderDraftStatus.CONVERTED.value for s in siblings):
        raise HTTPException(status_code=409, detail="Ảnh này đã có đơn được lưu, không đọc lại được")
    if any(s.status == OrderDraftStatus.PROCESSING.value for s in siblings):
        raise HTTPException(status_code=409, detail=_PROCESSING_DETAIL)
    path = _image_file(draft)
    if not path.is_file():
        raise HTTPException(status_code=410, detail="Ảnh gốc không còn")
    _require_ocr_configured()

    placeholder, *others = siblings
    for s in others:
        db.delete(s)
    placeholder.status = OrderDraftStatus.PROCESSING.value
    placeholder.extraction = {}
    placeholder.raw_model_output = None
    placeholder.model_name = None
    placeholder.error_message = None
    db.commit()
    db.refresh(placeholder)
    background.add_task(_process_sheet, placeholder.id, path.read_bytes())
    return _draft_to_response(placeholder)


@router.post("/{draft_id}/convert", response_model=SalesOrderResponse)
def convert_order_draft(
    draft_id: int,
    payload: SalesOrderCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> SalesOrderResponse:
    """Create the real order (with debt invoice) from the admin-reviewed payload and mark the draft converted."""
    draft = _get_draft(db, draft_id)
    if draft.status == OrderDraftStatus.CONVERTED.value:
        raise HTTPException(status_code=409, detail=_CONVERTED_DETAIL)
    if draft.status == OrderDraftStatus.PROCESSING.value:
        raise HTTPException(status_code=409, detail=_PROCESSING_DETAIL)
    order = create_order_with_debt(db, payload, actor)
    draft = _get_draft(db, draft_id)
    draft.status = OrderDraftStatus.CONVERTED.value
    draft.sales_order_id = order.id
    db.commit()
    return order


@router.delete("/{draft_id}")
def delete_order_draft(draft_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    """Delete one draft; the shared photo is removed with the last draft read from it."""
    draft = _get_draft(db, draft_id)
    if draft.status == OrderDraftStatus.CONVERTED.value:
        raise HTTPException(status_code=409, detail="Không xoá đơn nháp đã lưu thành đơn")
    if len(_sheet_rows(draft, db)) == 1:
        _image_file(draft).unlink(missing_ok=True)
    db.delete(draft)
    db.commit()
    return {"status": "deleted"}
