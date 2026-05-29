# Quan hệ bảng PostgreSQL

Sơ đồ ER và bảng FK cho schema server. **Nguồn:** [backend/app/models.py](../../backend/app/models.py).

---

## 1. Auth & Users

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--o{ sales_orders : creates
  users ||--o{ sales_orders : assigns
  users ||--o{ order_notes : writes
  users ||--o{ order_change_log : edits
  users {
    int id PK
    string username UK
    string password_hash
    string role
    bool is_active
    json map_location
  }
  refresh_tokens {
    int id PK
    int user_id FK
    string token_hash UK
    datetime expires_at
    datetime revoked_at
  }
```

| Cột FK | Bảng đích | Ghi chú |
|--------|-----------|---------|
| `refresh_tokens.user_id` | `users.id` | Cascade delete tokens khi xóa user (ORM) |
| `sales_orders.created_by_user_id` | `users.id` | Nullable |
| `sales_orders.assigned_to_user_id` | `users.id` | Nullable — nhân viên giao |
| `order_notes.created_by_user_id` | `users.id` | NOT NULL |
| `order_change_log.changed_by_user_id` | `users.id` | Nullable |

---

## 2. Catalog & Inventory

```mermaid
erDiagram
  products ||--o{ sales_order_items : sold_in
  products ||--o{ stock_receipts : received
  users ||--o{ stock_receipts : records
  products {
    int id PK
    string name
    string sku UK
    numeric cost_price
    numeric sell_price
    int stock_quantity
    int low_stock_threshold
    bool is_active
  }
  stock_receipts {
    int id PK
    int product_id FK
    date receipt_date
    int quantity
    string receipt_kind
    int created_by_user_id FK
  }
  cylinder_templates {
    int id PK
    string name
    string owner_name
    date inspection_expiry
    bool is_active
  }
```

| Cột FK | Bảng đích | Ghi chú |
|--------|-----------|---------|
| `stock_receipts.product_id` | `products.id` | NOT NULL |
| `stock_receipts.created_by_user_id` | `users.id` | Nullable |
| `sales_order_items.product_id` | `products.id` | NOT NULL |

`cylinder_templates` không có FK — preset cho UI tạo dòng đơn (serial nhập tay).

**`receipt_kind`:** `opening` (baseline, không cộng tồn lần nữa) | `inbound` (nhập kho).

---

## 3. Orders (core)

```mermaid
erDiagram
  sales_orders ||--|{ sales_order_items : contains
  sales_orders ||--o{ order_change_log : audited
  products ||--o{ sales_order_items : referenced
  users ||--o{ sales_orders : creates
  users ||--o{ sales_orders : assigns
  sales_orders {
    int id PK
    string order_code UK
    string customer_name
    string phone
    text address
    float delivery_latitude
    float delivery_longitude
    string delivery_status
    int borrowed_shell_units
    string client_id UK
    datetime deleted_at
  }
  sales_order_items {
    int id PK
    int order_id FK
    int product_id FK
    string product_name
    int quantity
    numeric unit_price
    string cylinder_serial
  }
  order_change_log {
    int id PK
    int order_id FK
    int changed_by_user_id FK
    string mutation_id
    json before_json
    json after_json
  }
```

| Cột FK | Bảng đích | On delete |
|--------|-----------|-----------|
| `sales_order_items.order_id` | `sales_orders.id` | — |
| `order_change_log.order_id` | `sales_orders.id` | **CASCADE** |

**Index/UK quan trọng:** `order_code` (unique), `client_id` (unique, sync mobile), `delivery_status`.

**`delivery_status`:** `in_transit` | `completed`.

---

## 4. Order notes

```mermaid
erDiagram
  users ||--o{ order_notes : creates
  order_notes {
    int id PK
    int created_by_user_id FK
    string note_type
    text raw_text
    json structured_payload
    string status
    string audio_path
    string client_id UK
    datetime updated_at
  }
```

| Cột FK | Bảng đích | Ghi chú |
|--------|-----------|---------|
| `order_notes.created_by_user_id` | `users.id` | NOT NULL |

**Enums:** `note_type` (`text` | `voice`), `status` (`draft` | `converted` | `archived`).

Không có FK trực tiếp tới `sales_orders` trên server — liên kết đơn qua `structured_payload` hoặc UI; mobile dùng `sales_order_id` local.

---

## 5. Debt & finance

```mermaid
erDiagram
  debt_accounts ||--o{ debt_ledger_entries : ledger
  debt_accounts ||--o{ debt_payments : payments
  debt_accounts ||--o{ debt_write_offs : writeoffs
  users ||--o{ debt_ledger_entries : records
  users ||--o{ debt_payments : collects
  users ||--o{ debt_write_offs : approves
  debt_accounts {
    int id PK
    string customer_key UK
    string customer_name
    string phone
    numeric current_balance
    string status
  }
  debt_ledger_entries {
    int id PK
    int debt_account_id FK
    string entry_type
    numeric amount_signed
    string reference_type
    string reference_id
    int created_by_user_id FK
  }
  debt_payments {
    int id PK
    int debt_account_id FK
    numeric amount
    int returned_shell_units
    int created_by_user_id FK
  }
  debt_write_offs {
    int id PK
    int debt_account_id FK
    numeric amount
    int approved_by_user_id FK
    int created_by_user_id FK
  }
```

| Cột FK | Bảng đích |
|--------|-----------|
| `debt_ledger_entries.debt_account_id` | `debt_accounts.id` |
| `debt_payments.debt_account_id` | `debt_accounts.id` |
| `debt_write_offs.debt_account_id` | `debt_accounts.id` |
| `debt_write_offs.approved_by_user_id` | `users.id` |

**`customer_key`:** số điện thoại chuẩn hóa (unique). Ledger `amount_signed`: dương = tăng nợ, âm = giảm nợ.

---

## 6. Operations & audit

```mermaid
erDiagram
  users ||--o{ daily_cylinder_audit : records
  users ||--o{ cylinder_inventory_snapshots : records
  debt_accounts ||--o{ cylinder_inventory_snapshots : optional
  daily_cylinder_audit {
    int id PK
    date business_date UK
    int morning_full
    int morning_shell
    int import_full
    int supplier_shell_units
    int evening_full
    int evening_shell
    int created_by_user_id FK
  }
  cylinder_inventory_snapshots {
    int id PK
    date snapshot_date
    int full_units
    int empty_shells
    int debt_account_id FK
    int created_by_user_id FK
  }
```

| Bảng | Ghi chú |
|------|---------|
| `daily_cylinder_audit` | Một row / `business_date` (unique) — kiểm kê vỏ/bình theo ngày |
| `cylinder_inventory_snapshots` | Legacy; API mới dùng `daily_cylinder_audit` |

Công thức kỳ vọng vỏ cuối ngày tích hợp `borrowed_shell_units` (đơn) và `returned_shell_units` (thu nợ).

---

## 7. Sync idempotency

```mermaid
erDiagram
  sync_applied_mutations {
    int id PK
    string client_mutation_id UK
    string entity
    string server_id
    datetime applied_at
  }
```

Bảng độc lập — không FK. Mỗi push mobile ghi một row để tránh replay mutation.

---

## 8. Governance (admin dashboards)

```mermaid
erDiagram
  users ||--o{ shift_settlements : creates
  users ||--o{ safety_checklist_runs : creates
  users ||--o{ audit_log_entries : actor
  sales_orders ||--o{ customer_journey_events : optional
  shift_settlements {
    int id PK
    date shift_date
    numeric expected_cash
    numeric actual_cash
    int created_by_user_id FK
  }
  finance_kpi_baselines {
    int id PK
    string kpi_key
    string label
    numeric measured_value
  }
  customer_journey_events {
    int id PK
    int order_id FK
    string step_key
    string status
  }
  complaint_tickets {
    int id PK
    string customer_name
    string status
    datetime sla_due_at
  }
  safety_checklist_runs {
    int id PK
    date run_date
    bool completed
    int created_by_user_id FK
  }
  capa_items {
    int id PK
    string title
    string status
  }
  audit_log_entries {
    int id PK
    int actor_user_id FK
    string action
    string target_type
  }
```

| Bảng | FK chính |
|------|----------|
| `shift_settlements` | `created_by_user_id` → `users` |
| `customer_journey_events` | `order_id` → `sales_orders` (nullable) |
| `safety_checklist_runs` | `created_by_user_id` → `users` |
| `audit_log_entries` | `actor_user_id` → `users` |

`finance_kpi_baselines`, `complaint_tickets`, `capa_items` — không FK bắt buộc tới bảng nghiệp vụ khác.

---

## Migration

Schema cập nhật **additive** lúc startup qua [backend/app/schema_migrate.py](../../backend/app/schema_migrate.py) — không dùng Alembic riêng.

## Liên kết

- [Database overview](./overview.md)
- [Mobile SQLite](./mobile-sqlite.md)
