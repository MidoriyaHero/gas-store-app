"""REST API routes for the gas store application."""

import csv
import io
from datetime import datetime, timedelta, UTC

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user, require_admin_user
from app.database import get_db
from app.models import Product, SalesOrder, SalesOrderItem, User
from app.schemas import (
    CylinderTemplatePayload,
    DashboardPayload,
    GasLedgerRow,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    SalesOrderCreate,
    SalesOrderResponse,
    TaxReportRow,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services.auth import hash_password, normalize_role
from app.services import sales
from app.services.delivery_export import render_delivery_slip_html
from app.services.invoice_filename import content_disposition_filename, invoice_filename_stem


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


def _user_template_to_payload(user: User) -> CylinderTemplatePayload:
    """Convert user template columns to API response model."""
    return CylinderTemplatePayload(
        owner_name=user.template_owner_name,
        import_source=user.template_import_source,
        inspection_expiry=user.template_inspection_expiry,
        import_date=user.template_import_date,
    )


@router.get("/me/cylinder-template", response_model=CylinderTemplatePayload)
def get_my_cylinder_template(user: User = Depends(get_current_user)) -> CylinderTemplatePayload:
    """Return server-side stored cylinder template for current user."""
    return _user_template_to_payload(user)


@router.patch("/me/cylinder-template", response_model=CylinderTemplatePayload)
def update_my_cylinder_template(
    payload: CylinderTemplatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CylinderTemplatePayload:
    """Persist cylinder template defaults for current user."""
    user.template_owner_name = _strip_opt_text(payload.owner_name)
    user.template_import_source = _strip_opt_text(payload.import_source)
    user.template_inspection_expiry = payload.inspection_expiry
    user.template_import_date = payload.import_date
    db.commit()
    db.refresh(user)
    return _user_template_to_payload(user)


@router.get("/products", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)) -> list[ProductResponse]:
    """Return all catalog products newest first."""
    rows = db.scalars(select(Product).order_by(Product.created_at.desc())).all()
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
    )
    db.add(p)
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
    if "sku" in data and data["sku"]:
        exists = db.scalar(select(Product.id).where(Product.sku == data["sku"], Product.id != product_id))
        if exists:
            raise HTTPException(status_code=400, detail="SKU already exists")
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _product_to_response(p)


@router.delete("/products/{product_id}", dependencies=[Depends(require_admin_user)])
def delete_product(product_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    """Remove a product if not referenced by order lines."""
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    used = db.scalar(select(SalesOrderItem.id).where(SalesOrderItem.product_id == product_id).limit(1))
    if used:
        raise HTTPException(status_code=400, detail="Product is referenced by orders")
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


@router.get("/orders", response_model=list[SalesOrderResponse], dependencies=[Depends(require_admin_user)])
def list_orders(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[SalesOrderResponse]:
    """List orders with nested lines, newest first."""
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines))
        .order_by(SalesOrder.created_at.desc())
        .limit(limit)
    )
    orders = db.execute(stmt).unique().scalars().all()
    out: list[SalesOrderResponse] = []
    return [sales.order_to_response(o) for o in orders]


@router.post("/orders", response_model=SalesOrderResponse)
def create_order_route(payload: SalesOrderCreate, db: Session = Depends(get_db)) -> SalesOrderResponse:
    """Create a VAT sales order."""
    try:
        return sales.create_sales_order(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.patch("/orders/{order_id}", response_model=SalesOrderResponse, dependencies=[Depends(require_admin_user)])
def update_order_route(order_id: int, payload: SalesOrderCreate, db: Session = Depends(get_db)) -> SalesOrderResponse:
    """Update an existing sales order and line items."""
    try:
        return sales.update_sales_order(db, order_id, payload)
    except ValueError as e:
        detail = str(e)
        status_code = 404 if detail == "Order not found" else 400
        raise HTTPException(status_code=status_code, detail=detail) from e


@router.delete("/orders/{order_id}", dependencies=[Depends(require_admin_user)])
def delete_order_route(order_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    """Delete order and restore inventory quantities."""
    try:
        sales.delete_sales_order(db, order_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"status": "ok"}


@router.get("/gas-ledger", response_model=list[GasLedgerRow], dependencies=[Depends(require_admin_user)])
def gas_ledger(db: Session = Depends(get_db)) -> list[GasLedgerRow]:
    """Flatten order lines into the ``sổ gas`` ledger shape (Excel columns)."""
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines))
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


@router.get("/sales-gas-export.csv", dependencies=[Depends(require_admin_user)])
def sales_gas_export_csv(db: Session = Depends(get_db)):
    """Flatten every order line with VAT header fields and gas/cylinder columns."""
    stmt = (
        select(SalesOrder)
        .options(joinedload(SalesOrder.lines).joinedload(SalesOrderItem.product))
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


@router.get("/dashboard", response_model=DashboardPayload, dependencies=[Depends(require_admin_user)])
def dashboard_bundle(db: Session = Depends(get_db)) -> DashboardPayload:
    """Orders (30d) with totals + full product list for Tổng quan."""
    since = datetime.now(tz=UTC) - timedelta(days=29)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    order_rows = db.scalars(
        select(SalesOrder).where(SalesOrder.created_at >= since).order_by(SalesOrder.created_at)
    ).all()
    orders_json = [{"total": str(o.total), "created_at": o.created_at.isoformat()} for o in order_rows]
    products = db.scalars(select(Product).order_by(Product.name)).all()
    return DashboardPayload(
        orders=orders_json,
        products=[_product_to_response(p) for p in products],
    )


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
        .where(SalesOrder.created_at >= start, SalesOrder.created_at <= end)
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
