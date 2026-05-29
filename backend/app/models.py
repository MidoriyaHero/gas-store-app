"""SQLAlchemy models for products, sales orders, users, and related data."""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    """Catalog product with cost/sell prices and low-stock threshold."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    sell_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    stock_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order_items: Mapped[list["SalesOrderItem"]] = relationship(back_populates="product")
    stock_receipts: Mapped[list["StockReceipt"]] = relationship(back_populates="product")


class StockReceipt(Base):
    """Inbound stock line for audit; ``opening`` rows do not change ``Product.stock_quantity`` again."""

    __tablename__ = "stock_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    receipt_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    #: ``opening`` = baseline snapshot; ``inbound`` = nhập kho (đã cộng vào ``stock_quantity``).
    receipt_kind: Mapped[str] = mapped_column(String(24), nullable=False, default="inbound", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship(back_populates="stock_receipts")


class CylinderInventorySnapshot(Base):
    """Legacy snapshot table; API kiểm kê theo ngày dùng ``DailyCylinderAudit``."""

    __tablename__ = "cylinder_inventory_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    full_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    empty_shells: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    debt_account_id: Mapped[int | None] = mapped_column(ForeignKey("debt_accounts.id"), nullable=True, index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DailyCylinderAudit(Base):
    """One row per business day: morning/evening counts plus supplier movements (water and shells are independent)."""

    __tablename__ = "daily_cylinder_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    business_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    morning_full: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    morning_shell: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Bình đầy nhận từ công ty gas trong ngày (không gắn 1–1 với vỏ; vỏ khai riêng ``supplier_shell_units``).
    import_full: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Vỏ giao/trả cho công ty gas trong ngày (giảm kỳ vọng vỏ trong kho).
    supplier_shell_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    evening_full: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    evening_shell: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CylinderTemplate(Base):
    """Admin-defined preset for cylinder fields on order lines (serial entered per line)."""

    __tablename__ = "cylinder_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    import_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    inspection_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    import_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SalesOrder(Base):
    """Sales order header with VAT summary (matches UI đơn hàng)."""

    __tablename__ = "sales_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_contact: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    vat_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="cash")
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    outstanding_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    #: ``in_transit`` = đang giao; ``completed`` = hoàn thành (lịch sử).
    delivery_status: Mapped[str] = mapped_column(String(24), nullable=False, default="in_transit", index=True)
    #: Vỏ cho mượn / nợ vỏ ghi trên đơn (dùng trong công thức kiểm kê vỏ cuối ngày).
    borrowed_shell_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    client_id: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[list["SalesOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    created_by: Mapped["User | None"] = relationship(
        back_populates="orders_created", foreign_keys=[created_by_user_id]
    )
    assigned_to: Mapped["User | None"] = relationship(
        back_populates="orders_assigned", foreign_keys=[assigned_to_user_id]
    )


class SalesOrderItem(Base):
    """Single line on a sales order."""

    __tablename__ = "sales_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    owner_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cylinder_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cylinder_serial: Mapped[str | None] = mapped_column(String(255), nullable=True)
    inspection_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    import_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    import_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    order: Mapped["SalesOrder"] = relationship(back_populates="lines")
    product: Mapped["Product"] = relationship(back_populates="order_items")


class UserRole(str, Enum):
    """Supported roles for API authorization."""

    ADMIN = "admin"
    USER = "user"


class OrderNoteStatus(str, Enum):
    """Lifecycle for manual or voice-assisted order notes."""

    DRAFT = "draft"
    CONVERTED = "converted"
    ARCHIVED = "archived"


class OrderNoteParserStatus(str, Enum):
    """Stub parser state for future STT + LLM integration."""

    IDLE = "idle"
    READY_FOR_PARSE = "ready_for_parse"
    PARSED = "parsed"
    ERROR = "error"


class OrderNoteKind(str, Enum):
    """Whether the note is free-text or a stored voice recording."""

    TEXT = "text"
    VOICE = "voice"


class User(Base):
    """Application user for login and role-based access."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default=UserRole.USER.value)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    template_owner_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    template_import_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_inspection_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    template_import_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    map_location: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    orders_created: Mapped[list["SalesOrder"]] = relationship(
        back_populates="created_by", foreign_keys="SalesOrder.created_by_user_id"
    )
    orders_assigned: Mapped[list["SalesOrder"]] = relationship(
        back_populates="assigned_to", foreign_keys="SalesOrder.assigned_to_user_id"
    )
    order_notes: Mapped[list["OrderNote"]] = relationship(back_populates="created_by", cascade="all, delete-orphan")


class OrderNote(Base):
    """Draft-like note for quick order capture before creating an official order."""

    __tablename__ = "order_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note_type: Mapped[str] = mapped_column(String(16), nullable=False, default=OrderNoteKind.TEXT.value)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=OrderNoteStatus.DRAFT.value)
    voice_enabled_stub: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    parser_status: Mapped[str] = mapped_column(String(32), nullable=False, default=OrderNoteParserStatus.IDLE.value)
    audio_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    audio_duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    created_by: Mapped["User"] = relationship(back_populates="order_notes")


class OrderChangeLog(Base):
    """Append-only audit of order edits (who changed what)."""

    __tablename__ = "order_change_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    changed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="web")
    mutation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    before_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class SyncAppliedMutation(Base):
    """Idempotency ledger for mobile/sync push mutations."""

    __tablename__ = "sync_applied_mutations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_mutation_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    entity: Mapped[str] = mapped_column(String(64), nullable=False)
    server_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShiftSettlement(Base):
    """Cash settlement summary by shift/date for delivery operations."""

    __tablename__ = "shift_settlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shift_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_label: Mapped[str] = mapped_column(String(64), nullable=False, default="ca-ngay")
    expected_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    actual_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    delta_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FinanceKpiBaseline(Base):
    """KPI baseline definitions and measured values for finance-governance tracking."""

    __tablename__ = "finance_kpi_baselines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kpi_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    target_value: Mapped[str] = mapped_column(String(120), nullable=False)
    data_source: Mapped[str] = mapped_column(Text, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    measured_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CustomerJourneyEvent(Base):
    """Structured event in customer lifecycle (remind/reorder/track/feedback)."""

    __tablename__ = "customer_journey_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    step_key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    step_label: Mapped[str] = mapped_column(String(120), nullable=False)
    channel: Mapped[str | None] = mapped_column(String(40), nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("sales_orders.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="done")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    happened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ComplaintTicket(Base):
    """Customer complaint and SLA ticket."""

    __tablename__ = "complaint_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    issue_text: Mapped[str] = mapped_column(Text, nullable=False)
    owner_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open", index=True)
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SafetyChecklistRun(Base):
    """Checklist execution record before dispatch."""

    __tablename__ = "safety_checklist_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_label: Mapped[str] = mapped_column(String(64), nullable=False, default="ca-ngay")
    valve_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    seal_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    leak_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    inspection_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    inspection_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CapaItem(Base):
    """Corrective and Preventive Action board item."""

    __tablename__ = "capa_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_name: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLogEntry(Base):
    """Audit trail for sensitive actions."""

    __tablename__ = "audit_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DebtAccount(Base):
    """Customer-level debt account keyed by normalized phone number."""

    __tablename__ = "debt_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"), index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DebtLedgerEntry(Base):
    """Immutable debt ledger entry; positive increases debt, negative decreases debt."""

    __tablename__ = "debt_ledger_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    debt_account_id: Mapped[int] = mapped_column(ForeignKey("debt_accounts.id"), nullable=False, index=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    amount_signed: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DebtPayment(Base):
    """Recorded debt collection action."""

    __tablename__ = "debt_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    debt_account_id: Mapped[int] = mapped_column(ForeignKey("debt_accounts.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="cash")
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    collector_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Vỏ khách trả kèm khoản thu nợ (cộng vào kỳ vọng vỏ khi kiểm kê cuối ngày).
    returned_shell_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DebtWriteOff(Base):
    """Debt write-off operation with approval metadata."""

    __tablename__ = "debt_write_offs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    debt_account_id: Mapped[int] = mapped_column(ForeignKey("debt_accounts.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    approved_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    """Persisted refresh token hash for revocation and rotation."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
