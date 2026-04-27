"""Create sales orders, adjust stock, and assign `order_code`."""

from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Product, SalesOrder, SalesOrderItem
from app.schemas import SalesOrderCreate, SalesOrderItemOut, SalesOrderLineIn, SalesOrderResponse
from app.services.gas_ledger_rules import gas_ledger_gap_messages, order_fully_ready_for_gas_ledger
from app.services.phone import normalize_phone


def _assign_order_code_after_flush(order_id: int) -> str:
    """Build deterministic code DH-YYYYMMDD-NNNNNN once `order_id` is known."""
    d = date.today().strftime("%Y%m%d")
    return f"DH-{d}-{order_id:06d}"


def _strip_opt(val: str | None) -> str | None:
    """Normalize optional text: empty string becomes ``None``."""
    if val is None:
        return None
    t = val.strip()
    return t or None


def create_sales_order(
    db: Session, payload: SalesOrderCreate, *, created_by_user_id: int | None = None
) -> SalesOrderResponse:
    """
    Persist header + lines, decrement product stock, compute VAT totals.

    Raises ValueError when a product is missing or stock is insufficient.
    """
    lines_in = payload.lines
    product_ids = [ln.product_id for ln in lines_in]
    products = db.scalars(select(Product).where(Product.id.in_(product_ids))).all()
    by_id = {p.id: p for p in products}
    if len(by_id) != len(set(product_ids)):
        raise ValueError("One or more products not found")

    qty_by_product: defaultdict[int, int] = defaultdict(int)
    for ln in lines_in:
        qty_by_product[ln.product_id] += ln.quantity

    for pid, need in qty_by_product.items():
        p = by_id[pid]
        if p.stock_quantity < need:
            raise ValueError(f"Insufficient stock for {p.name} (need {need}, have {p.stock_quantity})")

    cart_subtotal = Decimal("0")
    built_lines: list[tuple[Product, int, Decimal, Decimal, SalesOrderLineIn]] = []
    for ln in lines_in:
        p = by_id[ln.product_id]
        unit = Decimal(str(p.sell_price))
        line_tot = unit * ln.quantity
        cart_subtotal += line_tot
        built_lines.append((p, ln.quantity, unit, line_tot, ln))

    vat_amount = (cart_subtotal * Decimal(payload.vat_rate) / Decimal(100)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    grand_total = cart_subtotal + vat_amount

    phone = normalize_phone(payload.phone)
    payment_mode = payload.payment_mode
    if payment_mode == "cash":
        paid_amount = grand_total
    elif payment_mode == "debt":
        paid_amount = Decimal("0")
    else:
        paid_amount = Decimal(str(payload.paid_amount or 0))
        if paid_amount > grand_total:
            raise ValueError("Paid amount cannot exceed order total")
    outstanding_amount = grand_total - paid_amount

    header = SalesOrder(
        order_code="TEMP",
        customer_name=payload.customer_name.strip(),
        phone=phone,
        address=(payload.address or "").strip() or None,
        note=(payload.note or "").strip() or None,
        delivery_date=payload.delivery_date,
        store_contact=_strip_opt(payload.store_contact),
        subtotal=cart_subtotal,
        vat_rate=payload.vat_rate,
        vat_amount=vat_amount,
        total=grand_total,
        payment_mode=payment_mode,
        paid_amount=paid_amount,
        outstanding_amount=outstanding_amount,
        created_by_user_id=created_by_user_id,
    )
    db.add(header)
    db.flush()
    header.order_code = _assign_order_code_after_flush(header.id)

    for p, qty, unit, line_tot, ln_in in built_lines:
        db.add(
            SalesOrderItem(
                order_id=header.id,
                product_id=p.id,
                product_name=p.name,
                quantity=qty,
                unit_price=unit,
                line_subtotal=line_tot,
                owner_name=_strip_opt(ln_in.owner_name),
                cylinder_type=_strip_opt(ln_in.cylinder_type),
                cylinder_serial=_strip_opt(ln_in.cylinder_serial),
                inspection_expiry=ln_in.inspection_expiry,
                import_source=_strip_opt(ln_in.import_source),
                import_date=ln_in.import_date,
            )
        )
        p.stock_quantity -= qty

    db.commit()

    db.refresh(header)
    order = db.scalars(
        select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == header.id)
    ).first()
    assert order is not None
    return order_to_response(order)


def _build_order_payload(
    db: Session, payload: SalesOrderCreate
) -> tuple[dict[int, Product], list[tuple[Product, int, Decimal, Decimal, SalesOrderLineIn]], Decimal, Decimal, Decimal]:
    """Validate order payload and compute pricing tuple used by create/update."""
    lines_in = payload.lines
    product_ids = [ln.product_id for ln in lines_in]
    products = db.scalars(select(Product).where(Product.id.in_(product_ids))).all()
    by_id = {p.id: p for p in products}
    if len(by_id) != len(set(product_ids)):
        raise ValueError("One or more products not found")

    qty_by_product: defaultdict[int, int] = defaultdict(int)
    for ln in lines_in:
        qty_by_product[ln.product_id] += ln.quantity
    for pid, need in qty_by_product.items():
        p = by_id[pid]
        if p.stock_quantity < need:
            raise ValueError(f"Insufficient stock for {p.name} (need {need}, have {p.stock_quantity})")

    cart_subtotal = Decimal("0")
    built_lines: list[tuple[Product, int, Decimal, Decimal, SalesOrderLineIn]] = []
    for ln in lines_in:
        p = by_id[ln.product_id]
        unit = Decimal(str(p.sell_price))
        line_tot = unit * ln.quantity
        cart_subtotal += line_tot
        built_lines.append((p, ln.quantity, unit, line_tot, ln))

    vat_amount = (cart_subtotal * Decimal(payload.vat_rate) / Decimal(100)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    grand_total = cart_subtotal + vat_amount
    return by_id, built_lines, cart_subtotal, vat_amount, grand_total


def update_sales_order(db: Session, order_id: int, payload: SalesOrderCreate) -> SalesOrderResponse:
    """Replace order header + lines and recalculate stock deltas."""
    order = db.scalars(
        select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)
    ).first()
    if order is None:
        raise ValueError("Order not found")

    for li in order.lines:
        product = db.get(Product, li.product_id)
        if product is not None:
            product.stock_quantity += li.quantity

    _, built_lines, cart_subtotal, vat_amount, grand_total = _build_order_payload(db, payload)

    for li in list(order.lines):
        db.delete(li)
    db.flush()

    payment_mode = payload.payment_mode
    if payment_mode == "cash":
        paid_amount = grand_total
    elif payment_mode == "debt":
        paid_amount = Decimal("0")
    else:
        paid_amount = Decimal(str(payload.paid_amount or 0))
        if paid_amount > grand_total:
            raise ValueError("Paid amount cannot exceed order total")
    order.customer_name = payload.customer_name.strip()
    order.phone = normalize_phone(payload.phone)
    order.address = _strip_opt(payload.address)
    order.note = _strip_opt(payload.note)
    order.delivery_date = payload.delivery_date
    order.store_contact = _strip_opt(payload.store_contact)
    order.subtotal = cart_subtotal
    order.vat_rate = payload.vat_rate
    order.vat_amount = vat_amount
    order.total = grand_total
    order.payment_mode = payment_mode
    order.paid_amount = paid_amount
    order.outstanding_amount = grand_total - paid_amount

    for p, qty, unit, line_tot, ln_in in built_lines:
        db.add(
            SalesOrderItem(
                order_id=order.id,
                product_id=p.id,
                product_name=p.name,
                quantity=qty,
                unit_price=unit,
                line_subtotal=line_tot,
                owner_name=_strip_opt(ln_in.owner_name),
                cylinder_type=_strip_opt(ln_in.cylinder_type),
                cylinder_serial=_strip_opt(ln_in.cylinder_serial),
                inspection_expiry=ln_in.inspection_expiry,
                import_source=_strip_opt(ln_in.import_source),
                import_date=ln_in.import_date,
            )
        )
        p.stock_quantity -= qty

    db.commit()
    return load_sales_order_response(db, order.id)


def delete_sales_order(db: Session, order_id: int) -> None:
    """Delete order and return reserved stock back to inventory."""
    order = db.scalars(
        select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)
    ).first()
    if order is None:
        raise ValueError("Order not found")
    for li in order.lines:
        p = db.get(Product, li.product_id)
        if p is not None:
            p.stock_quantity += li.quantity
    db.delete(order)
    db.commit()


def order_to_response(order: SalesOrder) -> SalesOrderResponse:
    """Serialize loaded `SalesOrder` with lines."""
    items_out = [
        SalesOrderItemOut(
            id=li.id,
            product_id=li.product_id,
            product_name=li.product_name,
            quantity=li.quantity,
            unit_price=Decimal(str(li.unit_price)),
            subtotal=Decimal(str(li.line_subtotal)),
            owner_name=li.owner_name,
            cylinder_type=li.cylinder_type,
            cylinder_serial=li.cylinder_serial,
            inspection_expiry=li.inspection_expiry,
            import_source=li.import_source,
            import_date=li.import_date,
        )
        for li in order.lines
    ]
    return SalesOrderResponse(
        id=order.id,
        order_code=order.order_code,
        customer_name=order.customer_name,
        phone=order.phone,
        address=order.address,
        note=order.note,
        delivery_date=order.delivery_date,
        store_contact=order.store_contact,
        subtotal=Decimal(str(order.subtotal)),
        vat_rate=order.vat_rate,
        vat_amount=Decimal(str(order.vat_amount)),
        total=Decimal(str(order.total)),
        payment_mode=order.payment_mode,
        paid_amount=Decimal(str(order.paid_amount)),
        outstanding_amount=Decimal(str(order.outstanding_amount)),
        created_at=order.created_at,
        order_items=items_out,
        gas_ledger_ready=order_fully_ready_for_gas_ledger(order),
        gas_ledger_gaps=gas_ledger_gap_messages(order),
    )


def load_sales_order_response(db: Session, order_id: int) -> SalesOrderResponse:
    """Reload order with lines for API serialization."""
    order = db.scalars(
        select(SalesOrder).options(joinedload(SalesOrder.lines)).where(SalesOrder.id == order_id)
    ).first()
    if order is None:
        raise ValueError("Order not found")
    return order_to_response(order)
