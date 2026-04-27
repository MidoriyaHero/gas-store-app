"""Pydantic request/response schemas for catalog, sales orders, auth, and templates."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    """Create catalog row."""

    name: str = Field(..., max_length=255)
    sku: str | None = Field(default=None, max_length=64)
    description: str | None = None
    cost_price: Decimal = Field(ge=0, default=Decimal("0"))
    sell_price: Decimal = Field(ge=0, default=Decimal("0"))
    stock_quantity: int = Field(ge=0, default=0)
    low_stock_threshold: int = Field(ge=0, default=10)


class ProductUpdate(BaseModel):
    """Partial update for `Product`."""

    name: str | None = Field(default=None, max_length=255)
    sku: str | None = Field(default=None, max_length=64)
    description: str | None = None
    cost_price: Decimal | None = Field(default=None, ge=0)
    sell_price: Decimal | None = Field(default=None, ge=0)
    stock_quantity: int | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ProductResponse(BaseModel):
    """Product JSON for UI tables."""

    id: int
    name: str
    sku: str | None
    description: str | None
    cost_price: Decimal
    sell_price: Decimal
    stock_quantity: int
    low_stock_threshold: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SalesOrderLineIn(BaseModel):
    """One cart line when creating an order."""

    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    owner_name: str | None = Field(default=None, max_length=255)
    cylinder_type: str | None = Field(default=None, max_length=255)
    cylinder_serial: str | None = Field(default=None, max_length=255)
    inspection_expiry: date | None = None
    import_source: str | None = None
    import_date: date | None = None


class SalesOrderCreate(BaseModel):
    """Payload matching the đơn hàng dialog."""

    customer_name: str = Field(..., max_length=255)
    phone: str = Field(..., min_length=1, max_length=64)
    address: str | None = None
    note: str | None = None
    delivery_date: date | None = None
    store_contact: str | None = None
    vat_rate: int = Field(ge=0, le=100, default=10)
    payment_mode: str = Field(default="cash", pattern="^(cash|debt|partial)$")
    paid_amount: Decimal | None = Field(default=None, ge=0)
    lines: list[SalesOrderLineIn] = Field(min_length=1)


class SalesOrderItemOut(BaseModel):
    """Nested line on order list (UI `order_items`)."""

    id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    owner_name: str | None = None
    cylinder_type: str | None = None
    cylinder_serial: str | None = None
    inspection_expiry: date | None = None
    import_source: str | None = None
    import_date: date | None = None


class SalesOrderResponse(BaseModel):
    """Full order row for list + dialog success."""

    id: int
    order_code: str
    customer_name: str
    phone: str | None
    address: str | None
    note: str | None
    delivery_date: date | None = None
    store_contact: str | None = None
    subtotal: Decimal
    vat_rate: int
    vat_amount: Decimal
    total: Decimal
    payment_mode: str = "cash"
    paid_amount: Decimal = Field(default=Decimal("0"))
    outstanding_amount: Decimal = Field(default=Decimal("0"))
    created_at: datetime
    order_items: list[SalesOrderItemOut]
    gas_ledger_ready: bool = False
    gas_ledger_gaps: list[str] = Field(default_factory=list)


class SalesOrderListResponse(BaseModel):
    """Paginated admin order list."""

    items: list[SalesOrderResponse]
    total: int


class DebtAccountResponse(BaseModel):
    """Customer-level debt account row."""

    id: int
    customer_key: str
    customer_name: str
    phone: str
    current_balance: Decimal
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DebtLedgerEntryResponse(BaseModel):
    """Immutable debt ledger row."""

    id: int
    debt_account_id: int
    entry_type: str
    amount_signed: Decimal
    note: str | None
    reference_type: str | None
    reference_id: str | None
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DebtAccountDetailResponse(BaseModel):
    """Debt account detail with latest ledger entries."""

    account: DebtAccountResponse
    ledger: list[DebtLedgerEntryResponse]


class DebtPaymentIn(BaseModel):
    """Create payload for debt collection."""

    debt_account_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0)
    payment_method: str = Field(default="cash", min_length=1, max_length=40)
    paid_at: datetime | None = None
    collector_name: str | None = Field(default=None, max_length=255)
    note: str | None = None


class DebtPaymentUpdateIn(BaseModel):
    """Patch payload for debt payment correction."""

    amount: Decimal | None = Field(default=None, gt=0)
    payment_method: str | None = Field(default=None, min_length=1, max_length=40)
    paid_at: datetime | None = None
    collector_name: str | None = Field(default=None, max_length=255)
    note: str | None = None


class DebtWriteOffIn(BaseModel):
    """Create payload for debt write-off."""

    debt_account_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0)
    reason: str = Field(..., min_length=1)
    approved_by_user_id: int = Field(gt=0)


class DebtAgingBucket(BaseModel):
    """Debt aging aggregate bucket."""

    bucket: str
    amount: Decimal


class GasLedgerRow(BaseModel):
    """One ledger row aligned with ``sổ gas.xlsx`` (chỉ thông tin chai / khách / giao)."""

    owner_name: str | None
    cylinder_type: str | None
    cylinder_serial: str | None
    inspection_expiry: date | None
    import_source: str | None
    import_date: date | None
    customer_name_and_address: str
    customer_phone: str | None = None
    customer_address: str | None = None
    delivery_date: date | None


class DashboardPayload(BaseModel):
    """Bundle for Tổng quan page."""

    orders: list[dict]
    products: list[ProductResponse]


class TaxReportRow(BaseModel):
    """Single order row for báo cáo thuế."""

    id: int
    order_code: str
    customer_name: str
    phone: str | None
    subtotal: Decimal
    vat_rate: int
    vat_amount: Decimal
    total: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    """Login request body."""

    username: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=1, max_length=255)


class AuthUser(BaseModel):
    """Authenticated user identity returned to frontend."""

    id: int
    username: str
    role: str


class AuthSessionResponse(BaseModel):
    """Login/refresh response with current user identity."""

    user: AuthUser


class UserCreate(BaseModel):
    """Admin payload for creating a user account."""

    username: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=6, max_length=255)
    role: str = Field(default="user", pattern="^(admin|user)$")
    is_active: bool = True


class UserUpdate(BaseModel):
    """Admin payload for updating account fields."""

    username: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=6, max_length=255)
    role: str | None = Field(default=None, pattern="^(admin|user)$")
    is_active: bool | None = None


class UserResponse(BaseModel):
    """Serializable user row for admin settings page."""

    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CylinderTemplateCreate(BaseModel):
    """Admin payload to create a reusable cylinder field preset."""

    name: str = Field(..., min_length=1, max_length=255)
    owner_name: str | None = Field(default=None, max_length=255)
    import_source: str | None = None
    inspection_expiry: date | None = None
    import_date: date | None = None
    is_active: bool = True


class CylinderTemplateUpdate(BaseModel):
    """Partial update for a cylinder template."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    owner_name: str | None = Field(default=None, max_length=255)
    import_source: str | None = None
    inspection_expiry: date | None = None
    import_date: date | None = None
    is_active: bool | None = None


class CylinderTemplateResponse(BaseModel):
    """Cylinder template row for dropdowns and admin table."""

    id: int
    name: str
    owner_name: str | None
    import_source: str | None
    inspection_expiry: date | None
    import_date: date | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderNoteLinePayload(BaseModel):
    """Structured line captured in a quick order note."""

    product_name: str = Field(..., min_length=1, max_length=255)
    unit_price: Decimal | None = Field(default=None, ge=0)
    quantity: int = Field(gt=0)
    note: str | None = None


class OrderNoteStructuredPayload(BaseModel):
    """Structured draft fields that can be converted into an order."""

    customer_name: str | None = Field(default=None, max_length=255)
    delivery_note: str | None = None
    items: list[OrderNoteLinePayload] = Field(default_factory=list)


class OrderNoteCreate(BaseModel):
    """Create payload for a free-text delivery note."""

    model_config = ConfigDict(extra="ignore")

    raw_text: str = Field(..., min_length=1)
    title: str | None = Field(default=None, max_length=255)


class OrderNoteUpdate(BaseModel):
    """Partial update for text notes only (voice notes are immutable)."""

    title: str | None = Field(default=None, max_length=255)
    raw_text: str | None = Field(default=None, min_length=1)
    structured_payload: OrderNoteStructuredPayload | None = None
    status: str | None = Field(default=None, pattern="^(draft|converted|archived)$")


class OrderNoteResponse(BaseModel):
    """Serialized order note row used by both admin and staff UI."""

    id: int
    created_by_user_id: int
    title: str | None
    note_type: str
    raw_text: str | None
    structured_payload: OrderNoteStructuredPayload
    status: str
    voice_enabled_stub: bool
    parser_status: str
    audio_url: str | None = None
    audio_duration_sec: int | None = None
    mime_type: str | None = None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class ShiftSettlementIn(BaseModel):
    """Create/update payload for shift settlement."""

    shift_date: date
    shift_label: str = Field(default="ca-ngay", min_length=1, max_length=64)
    expected_cash: Decimal = Field(ge=0, default=Decimal("0"))
    actual_cash: Decimal = Field(ge=0, default=Decimal("0"))
    note: str | None = None


class ShiftSettlementResponse(BaseModel):
    """Serialized shift settlement row."""

    id: int
    shift_date: date
    shift_label: str
    expected_cash: Decimal
    actual_cash: Decimal
    delta_cash: Decimal
    note: str | None
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FinanceKpiBaselineIn(BaseModel):
    """Definition and measurement input for governance KPI."""

    kpi_key: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=255)
    target_value: str = Field(..., min_length=1, max_length=120)
    data_source: str = Field(..., min_length=1)
    period_start: date | None = None
    period_end: date | None = None
    measured_value: Decimal | None = None


class FinanceKpiBaselineResponse(BaseModel):
    """Serialized governance KPI row."""

    id: int
    kpi_key: str
    label: str
    target_value: str
    data_source: str
    period_start: date | None
    period_end: date | None
    measured_value: Decimal | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerJourneyEventIn(BaseModel):
    """Input payload for a customer journey event."""

    customer_name: str = Field(..., min_length=1, max_length=255)
    step_key: str = Field(..., min_length=1, max_length=40)
    step_label: str = Field(..., min_length=1, max_length=120)
    channel: str | None = Field(default=None, max_length=40)
    order_id: int | None = Field(default=None, gt=0)
    status: str = Field(default="done", min_length=1, max_length=32)
    note: str | None = None


class CustomerJourneyEventResponse(BaseModel):
    """Serialized customer journey event row."""

    id: int
    customer_name: str
    step_key: str
    step_label: str
    channel: str | None
    order_id: int | None
    status: str
    note: str | None
    happened_at: datetime

    model_config = {"from_attributes": True}


class ComplaintTicketIn(BaseModel):
    """Create payload for customer complaint ticket."""

    customer_name: str = Field(..., min_length=1, max_length=255)
    issue_text: str = Field(..., min_length=1)
    owner_name: str = Field(..., min_length=1, max_length=255)
    status: str = Field(default="open", min_length=1, max_length=32)
    sla_due_at: datetime | None = None


class ComplaintTicketUpdate(BaseModel):
    """Patch payload for complaint ticket."""

    owner_name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = Field(default=None, min_length=1, max_length=32)
    issue_text: str | None = None
    sla_due_at: datetime | None = None


class ComplaintTicketResponse(BaseModel):
    """Serialized complaint ticket row."""

    id: int
    customer_name: str
    issue_text: str
    owner_name: str
    status: str
    sla_due_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SafetyChecklistRunIn(BaseModel):
    """Payload for dispatch safety checklist run."""

    run_date: date
    shift_label: str = Field(default="ca-ngay", min_length=1, max_length=64)
    valve_ok: bool = False
    seal_ok: bool = False
    leak_ok: bool = False
    inspection_ok: bool = False
    inspection_expiry: date | None = None


class SafetyChecklistRunResponse(BaseModel):
    """Serialized safety checklist run."""

    id: int
    run_date: date
    shift_label: str
    valve_ok: bool
    seal_ok: bool
    leak_ok: bool
    inspection_ok: bool
    inspection_expiry: date | None
    completed: bool
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CapaItemIn(BaseModel):
    """Create payload for CAPA board item."""

    title: str = Field(..., min_length=1, max_length=255)
    owner_name: str = Field(..., min_length=1, max_length=255)
    detail: str | None = None
    status: str = Field(default="open", min_length=1, max_length=32)


class CapaItemUpdate(BaseModel):
    """Patch payload for CAPA board item."""

    owner_name: str | None = Field(default=None, min_length=1, max_length=255)
    detail: str | None = None
    status: str | None = Field(default=None, min_length=1, max_length=32)


class CapaItemResponse(BaseModel):
    """Serialized CAPA item."""

    id: int
    title: str
    owner_name: str
    detail: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AuditLogEntryIn(BaseModel):
    """Payload for manual audit log entry."""

    action: str = Field(..., min_length=1, max_length=80)
    target_type: str = Field(..., min_length=1, max_length=80)
    target_id: str | None = Field(default=None, max_length=80)
    detail: str | None = None


class AuditLogEntryResponse(BaseModel):
    """Serialized audit log record."""

    id: int
    actor_user_id: int | None
    action: str
    target_type: str
    target_id: str | None
    detail: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
