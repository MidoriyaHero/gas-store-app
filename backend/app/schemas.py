"""Pydantic request/response schemas for catalog, sales orders, auth, and templates."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


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
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = None
    note: str | None = None
    delivery_date: date | None = None
    store_contact: str | None = None
    vat_rate: int = Field(ge=0, le=100, default=10)
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
    created_at: datetime
    order_items: list[SalesOrderItemOut]


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


class CylinderTemplatePayload(BaseModel):
    """User-level default values for cylinder-related order fields."""

    owner_name: str | None = Field(default=None, max_length=255)
    import_source: str | None = None
    inspection_expiry: date | None = None
    import_date: date | None = None
