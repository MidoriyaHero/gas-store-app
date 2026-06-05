"""Pydantic request/response schemas for catalog, sales orders, auth, and templates."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    """Partial update for `Product`; use stock-receipt API instead of ``stock_quantity``."""

    name: str | None = Field(default=None, max_length=255)
    sku: str | None = Field(default=None, max_length=64)
    description: str | None = None
    cost_price: Decimal | None = Field(default=None, ge=0)
    sell_price: Decimal | None = Field(default=None, ge=0)
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


class StockReceiptCreate(BaseModel):
    """Inbound warehouse line (nhập kho)."""

    receipt_date: date
    quantity: int = Field(gt=0)
    note: str | None = None


class StockReceiptResponse(BaseModel):
    """Serialized stock receipt row."""

    id: int
    product_id: int
    receipt_date: date
    quantity: int
    receipt_kind: str
    note: str | None
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DailyCylinderAuditComputed(BaseModel):
    """Server-side reconciliation for one business_date (UTC calendar date on paid_at cast)."""

    delivered_full: int = Field(description="Tổng SL dòng đơn completed, delivery_date = ngày")
    borrowed_shell_total: int
    returned_shells_debt: int
    expected_evening_full: int = Field(description="morning_full + import_full − delivered_full (nước từ công ty)")
    expected_evening_shell: int = Field(
        description="morning_shell + delivered − supplier_shell_units − borrowed + returned_shells_debt"
    )
    variance_full: int | None = Field(
        default=None, description="evening_full - expected; None nếu chưa nhập đủ buổi tối"
    )
    variance_shell: int | None = None


class DailyCylinderAuditRecord(BaseModel):
    """Persisted morning/evening counts for one day."""

    id: int
    business_date: date
    morning_full: int
    morning_shell: int
    import_full: int
    supplier_shell_units: int
    evening_full: int
    evening_shell: int
    note: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DailyCylinderAuditPayload(BaseModel):
    """GET response: stored row + computed totals."""

    record: DailyCylinderAuditRecord | None
    computed: DailyCylinderAuditComputed


class DailyCylinderAuditUpdate(BaseModel):
    """Partial PUT: only sent fields are updated."""

    morning_full: int | None = Field(default=None, ge=0)
    morning_shell: int | None = Field(default=None, ge=0)
    import_full: int | None = Field(default=None, ge=0)
    supplier_shell_units: int | None = Field(default=None, ge=0)
    evening_full: int | None = Field(default=None, ge=0)
    evening_shell: int | None = Field(default=None, ge=0)
    note: str | None = None


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
    assigned_to_user_id: int | None = None
    delivery_latitude: float | None = Field(default=None, ge=-90, le=90)
    delivery_longitude: float | None = Field(default=None, ge=-180, le=180)
    delivery_status: Literal["in_transit", "completed"] | None = None
    borrowed_shell_units: int = Field(default=0, ge=0, description="Vỏ cho mượn / nợ vỏ trên đơn")
    lines: list[SalesOrderLineIn] = Field(min_length=1)

    @model_validator(mode="after")
    def delivery_coords_pair(self) -> Self:
        """Persist GPS only when both latitude and longitude are set."""
        a, b = self.delivery_latitude, self.delivery_longitude
        if (a is None) ^ (b is None):
            raise ValueError("GPS: cần nhập đủ vĩ độ và kinh độ, hoặc để trống cả hai")
        return self


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
    created_by_user_id: int | None = None
    assigned_to_user_id: int | None = None
    assigned_to_username: str | None = None
    delivery_latitude: float | None = None
    delivery_longitude: float | None = None
    delivery_status: Literal["in_transit", "completed"] = "in_transit"
    borrowed_shell_units: int = Field(default=0, ge=0)
    order_items: list[SalesOrderItemOut]
    gas_ledger_ready: bool = False
    gas_ledger_gaps: list[str] = Field(default_factory=list)


class SalesOrderListResponse(BaseModel):
    """Paginated admin order list."""

    items: list[SalesOrderResponse]
    total: int


class ProductQtyRollup(BaseModel):
    """Aggregated line quantities per product for delivery-day summary."""

    product_id: int
    product_name: str
    quantity: int


class DeliveryDaySummaryResponse(BaseModel):
    """Orders whose ``delivery_date`` is in the requested day set, plus rollups."""

    dates: list[str]
    orders: list[SalesOrderResponse]
    total_amount: Decimal
    total_line_quantity: int
    line_qty_by_product: list[ProductQtyRollup]


class MeOrderDeliveryPatch(BaseModel):
    """Staff-only update of delivery lifecycle for an order they may execute."""

    delivery_status: Literal["in_transit", "completed"]


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
    returned_shell_units: int = Field(default=0, ge=0, description="Vỏ trả kèm giao dịch payment (từ debt_payments)")

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
    returned_shell_units: int = Field(default=0, ge=0, description="Số vỏ khách trả kèm thanh toán")


class DebtPaymentUpdateIn(BaseModel):
    """Patch payload for debt payment correction."""

    amount: Decimal | None = Field(default=None, gt=0)
    payment_method: str | None = Field(default=None, min_length=1, max_length=40)
    paid_at: datetime | None = None
    collector_name: str | None = Field(default=None, max_length=255)
    note: str | None = None
    returned_shell_units: int | None = Field(default=None, ge=0)


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


class ShellDebtLedgerRow(BaseModel):
    """One order row in the shell-debt ledger (borrowed_shell_units > 0)."""

    order_id: int
    order_code: str
    customer_name: str
    phone: str | None
    delivery_date: date | None
    borrowed_shell_units: int
    delivery_status: str
    address: str | None = None


class ShellDebtLedgerResponse(BaseModel):
    """Paginated shell-debt ledger with aggregate shell count."""

    items: list[ShellDebtLedgerRow]
    total: int
    total_shell_units: int


class DashboardPayload(BaseModel):
    """Bundle for Tổng quan page."""

    orders: list[dict]
    products: list[ProductResponse]


class DailyMetricRow(BaseModel):
    """One day of dashboard revenue, debt, and profit metrics."""

    date: str
    revenue: Decimal
    outstanding: Decimal
    profit: Decimal
    order_count: int


class DashboardSummaryResponse(BaseModel):
    """Aggregated KPIs and daily series for dashboard charts."""

    range: str
    revenue: Decimal
    outstanding: Decimal
    profit: Decimal
    order_count: int
    series: list[DailyMetricRow]


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


class MapLocationIn(BaseModel):
    """Geographic point stored on the user row (JSON) for staff map and directions."""

    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    label: str | None = Field(default=None, max_length=500)


class GeocodeHit(BaseModel):
    """One forward-geocoding match from the external search provider."""

    lat: float
    lng: float
    display_name: str
    place_id: str


class GeocodeListResponse(BaseModel):
    """Ordered list of geocode candidates for the client to pick from."""

    items: list[GeocodeHit]


class MapPasteIn(BaseModel):
    """Clipboard text from Google Maps (short link, Plus Code, DMS, decimal pair, or address)."""

    raw: str = Field(..., min_length=2, max_length=2500)


class AuthUser(BaseModel):
    """Authenticated user identity returned to frontend."""

    id: int
    username: str
    role: str
    map_location: MapLocationIn | None = None


class AuthSessionResponse(BaseModel):
    """Login/refresh response with current user identity."""

    user: AuthUser


class MobileAuthResponse(BaseModel):
    """Mobile login/refresh: tokens in body for SecureStore."""

    user: AuthUser
    access_token: str
    refresh_token: str
    expires_in: int = Field(description="Access token lifetime in seconds")


class MobileRefreshRequest(BaseModel):
    """Mobile refresh/logout body."""

    refresh_token: str = Field(..., min_length=10, max_length=512)


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


class SyncPushIn(BaseModel):
    """One offline mutation from mobile (single mutation per request for ACID clarity)."""

    client_mutation_id: str = Field(..., min_length=8, max_length=36)
    entity: str = Field(..., min_length=1, max_length=64)
    operation: Literal["create", "update", "delete", "upsert"]
    client_id: str | None = Field(default=None, max_length=36)
    server_id: int | None = Field(default=None, gt=0)
    payload: dict = Field(default_factory=dict)
    device_id: str | None = Field(default=None, max_length=64)


class SyncPushResult(BaseModel):
    """Outcome of applying one mutation."""

    status: Literal["applied", "rejected"]
    client_mutation_id: str
    entity: str
    server_id: int | None = None
    client_id: str | None = None
    server_updated_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None


class SyncChangeItem(BaseModel):
    """One row in a pull delta."""

    entity: str
    op: Literal["upsert", "delete"]
    server_id: int | None
    client_id: str | None
    updated_at: datetime
    data: dict | None = None


class SyncPullResponse(BaseModel):
    """Incremental pull payload."""

    cursor: str
    changes: list[SyncChangeItem]


class OrderChangeLogEntry(BaseModel):
    """One order edit audit row."""

    id: int
    order_id: int
    changed_by_user_id: int | None
    changed_at: datetime
    source: str
    mutation_id: str | None
    summary: str | None
    before_json: dict | None
    after_json: dict | None

    model_config = {"from_attributes": True}
