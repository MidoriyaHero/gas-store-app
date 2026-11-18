"""Admin customer directory routes."""

from datetime import timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.auth import require_admin_user, require_any_role
from app.database import get_db
from app.models import Customer, DebtAccount, SalesOrder
from app.schemas import (
    CustomerCreate,
    CustomerDetailResponse,
    CustomerListResponse,
    CustomerResponse,
    CustomerSegmentLiteral,
    CustomerUpdate,
)
from app.services import sales
from app.services.customers import (
    AT_RISK_DAYS,
    PHONE_TAKEN_MSG,
    CustomerStats,
    PhoneTakenError,
    computed_group,
    create_customer,
    load_stats_map,
    typical_product_name,
    update_customer,
)
from app.services.phone import normalize_phone
from app.timezone import utc_now

router = APIRouter(prefix="/customers", tags=["customers"])

_LIST_LIMITS = frozenset({10, 20, 50, 100})


def _to_response(db: Session, row: Customer, stats: CustomerStats | None = None) -> CustomerResponse:
    """Serialize one customer with purchase aggregates."""
    if stats is None:
        stats = load_stats_map(db, [row.id]).get(row.id)
    last_at = stats.last_order_at if stats else None
    count_90 = stats.order_count_90d if stats else 0
    return CustomerResponse(
        id=row.id,
        name=row.name,
        phone=row.phone,
        address=row.address,
        hamlet=row.hamlet,
        notes=row.notes,
        customer_segment=row.customer_segment,  # type: ignore[arg-type]
        assigned_to_user_id=row.assigned_to_user_id,
        last_order_at=last_at,
        order_count=stats.order_count if stats else 0,
        outstanding=stats.outstanding if stats else Decimal("0"),
        computed_group=computed_group(last_at, count_90),
        typical_product_name=typical_product_name(db, row.id),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _http_from_domain(exc: Exception) -> HTTPException:
    """Map domain errors to HTTP status codes."""
    if isinstance(exc, PhoneTakenError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=CustomerListResponse, dependencies=[Depends(require_any_role("admin", "user"))])
def list_customers(
    q: str | None = Query(default=None, max_length=100),
    segment: CustomerSegmentLiteral | None = Query(default=None),
    at_risk: bool = Query(default=False),
    has_debt: bool = Query(default=False),
    limit: int = Query(default=20),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CustomerListResponse:
    """Search the customer directory with optional at-risk and debt filters."""
    if limit not in _LIST_LIMITS:
        raise HTTPException(status_code=400, detail="limit must be one of: 10, 20, 50, 100")
    stmt = select(Customer)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Customer.name.ilike(term), Customer.phone.ilike(term)))
    if segment is not None:
        stmt = stmt.where(Customer.customer_segment == segment)
    if at_risk:
        cutoff = utc_now() - timedelta(days=AT_RISK_DAYS)
        last_order = (
            select(func.max(SalesOrder.created_at))
            .where(sales.active_order_clause(SalesOrder.customer_id == Customer.id))
            .correlate(Customer)
            .scalar_subquery()
        )
        stmt = stmt.where(or_(last_order.is_(None), last_order < cutoff))
    if has_debt:
        stmt = stmt.where(
            exists().where(DebtAccount.customer_id == Customer.id, DebtAccount.current_balance > 0)
        )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int(db.scalar(count_stmt) or 0)
    rows = db.scalars(
        stmt.order_by(Customer.updated_at.desc(), Customer.id.desc()).offset(offset).limit(limit)
    ).all()
    stats_map = load_stats_map(db, [row.id for row in rows])
    return CustomerListResponse(
        items=[_to_response(db, row, stats_map.get(row.id)) for row in rows],
        total=total,
    )


@router.get("/by-phone", response_model=CustomerResponse, dependencies=[Depends(require_any_role("admin", "user"))])
def get_customer_by_phone(
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> CustomerResponse:
    """Lookup one customer by normalized phone for the order form."""
    try:
        key = normalize_phone(phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    row = db.scalar(select(Customer).where(Customer.phone == key))
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách")
    return _to_response(db, row)


@router.get("/{customer_id}", response_model=CustomerDetailResponse, dependencies=[Depends(require_any_role("admin", "user"))])
def get_customer(customer_id: int, db: Session = Depends(get_db)) -> CustomerDetailResponse:
    """Customer profile plus the newest 20 active orders."""
    row = db.get(Customer, customer_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách")
    orders = (
        db.execute(
            select(SalesOrder)
            .options(joinedload(SalesOrder.lines), joinedload(SalesOrder.assigned_to))
            .where(sales.active_order_clause(SalesOrder.customer_id == customer_id))
            .order_by(SalesOrder.created_at.desc(), SalesOrder.id.desc())
            .limit(20)
        )
        .unique()
        .scalars()
        .all()
    )
    return CustomerDetailResponse(
        customer=_to_response(db, row),
        recent_orders=[sales.order_to_response(order) for order in orders],
    )


@router.post("", response_model=CustomerResponse, dependencies=[Depends(require_admin_user)])
def post_customer(payload: CustomerCreate, db: Session = Depends(get_db)) -> CustomerResponse:
    """Create a directory customer."""
    try:
        row = create_customer(
            db,
            name=payload.name,
            phone=payload.phone,
            address=payload.address,
            hamlet=payload.hamlet,
            notes=payload.notes,
            customer_segment=payload.customer_segment,
            assigned_to_user_id=payload.assigned_to_user_id,
        )
        db.commit()
        db.refresh(row)
        return _to_response(db, row)
    except (PhoneTakenError, ValueError) as e:
        db.rollback()
        raise _http_from_domain(e) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=PHONE_TAKEN_MSG) from e


@router.patch("/{customer_id}", response_model=CustomerResponse, dependencies=[Depends(require_admin_user)])
def patch_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
) -> CustomerResponse:
    """Patch directory fields; unique phone changes retarget the debt account key."""
    data = payload.model_dump(exclude_unset=True)
    try:
        row = update_customer(db, customer_id, data)
        db.commit()
        db.refresh(row)
        return _to_response(db, row)
    except (PhoneTakenError, ValueError, LookupError) as e:
        db.rollback()
        raise _http_from_domain(e) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=PHONE_TAKEN_MSG) from e
