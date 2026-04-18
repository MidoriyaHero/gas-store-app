"""SQLAlchemy models aligned with the Bright Order Boss UI (products + VAT orders)."""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order_items: Mapped[list["SalesOrderItem"]] = relationship(back_populates="product")


class SalesOrder(Base):
    """Sales order header with VAT summary (matches UI đơn hàng)."""

    __tablename__ = "sales_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    store_contact: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    vat_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lines: Mapped[list["SalesOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


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
