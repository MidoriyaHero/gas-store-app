# Service flow & module relations

Sơ đồ tổng hợp flow và quan hệ giữa các service/module trong `gas-store-app`: backend (FastAPI), web (React/Vite), mobile (Expo, offline-first) và hạ tầng deploy.

Ghi chú quan trọng:

- **Backend không có repository layer.** Router và service truy vấn ORM trực tiếp qua `Session`. `backend/app/api/routes.py` (~2.979 dòng) chứa luôn các helper công nợ và audit.
- **Chỉ đường web `POST /api/orders` ghi sổ công nợ.** Đơn tạo qua mobile `POST /api/sync/push` không tạo dòng `debt_ledger_entries`.
- **Code thừa:** `QueryClientProvider` (TanStack Query) không được trang nào dùng; `wrangler.jsonc` không được script/workflow nào dùng; `services/note_parser.py` không có caller.
- **Export chỉ có CSV (UTF-8 BOM) và HTML**, không có xlsx/docx phía server. "Dashboard feature gate" chỉ là checklist trong `docs/dashboard-feature-gate.md`.

## 1. Kiến trúc hệ thống & deploy

```mermaid
flowchart LR
  subgraph Clients
    BR["Browser - React SPA"]
    APK["Android APK - Expo"]
  end
  subgraph CF["Cloudflare Tunnel"]
    APPD["app.domain"]
    APID["api.domain"]
  end
  subgraph Host["Windows host - Docker Desktop"]
    CFD["cloudflared - chạy trên host"]
    subgraph Compose["docker-compose"]
      WEB["web: nginx :8686→80<br/>SPA + proxy /api, /media"]
      API["api: FastAPI uvicorn :8000"]
      DB[("db: Postgres 16 :5432")]
      MEDIA[("volume api_media<br/>/data/media")]
    end
  end
  NOM["OSM Nominatim"]
  GMAP["Google Maps URLs"]

  BR --> APPD --> CFD
  APK --> APID --> CFD
  CFD -- "app → :8686" --> WEB
  CFD -- "api → :8000" --> API
  WEB -- "/api, /media" --> API
  API --> DB
  API --> MEDIA
  API -- geocode --> NOM
  API -- "resolve paste link" --> GMAP
```

- Dev: Vite `:5173` proxy `/api`, `/media` → `127.0.0.1:8000`; emulator gọi `10.0.2.2:8000`.
- Khởi động trên Windows: `scripts/start-gas-store.bat` → `scripts/start-manual.ps1` (đợi Docker → `docker compose up -d --build` → chạy `cloudflared` với `CLOUDFLARE_TUNNEL_TOKEN`). Phương án thay thế: Task Scheduler `GasStore-Production` → `scripts/start-production-windows.ps1`.

## 2. Backend: router → service → model

```mermaid
flowchart TB
  MAIN["main.py create_app + lifespan<br/>create_all → ensure_gas_schema → reconcile debt → seed"]
  CFG["config.py Settings"]
  DBM["database.py engine / SessionLocal / get_db"]

  subgraph Routers["/api routers"]
    RA["api/auth.py /auth<br/>cookie web + Bearer mobile"]
    RS["api/sync.py /sync<br/>pull, push, sales-order-ids"]
    RR["api/routes.py<br/>orders, me/orders, debt, products, stock,<br/>users, notes, ledgers, tax, dashboard,<br/>operations, governance, geocode"]
  end

  subgraph Services["app/services"]
    SAUTH["auth: JWT, pbkdf2, refresh rotate"]
    SALES["sales: create/update/delete order<br/>stock ±, VAT, payment_mode"]
    PRICE["pricing: giá theo segment"]
    DEBT["debt_orders: outstanding, balance, backfill"]
    STOCK["stock_receipts: opening/inbound<br/>sync_audit_import_full"]
    SYNC["sync_engine: pull_changes, apply_push<br/>idempotent + lock"]
    OCL["order_change_log: snapshot, record"]
    GLR["gas_ledger_rules"]
    DEXP["delivery_export: phiếu giao HTML"]
    INV["invoice_filename"]
    GEO["geocode: Nominatim"]
    MPR["map_paste_resolve: Maps URL, Plus Code"]
    NMED["order_note_media: file voice"]
    PHONE["phone.normalize_phone"]
  end

  MODELS["models.py - SQLAlchemy ORM"]
  MIG["schema_migrate.py ensure_gas_schema"]

  MAIN --> CFG
  MAIN --> DBM
  MAIN --> MIG
  MAIN --> RA
  MAIN --> RR
  MAIN --> RS
  RA --> SAUTH
  RS --> SYNC
  SYNC --> SALES
  SYNC --> OCL
  RR --> SALES
  RR --> DEBT
  RR --> STOCK
  RR --> OCL
  RR --> GLR
  RR --> DEXP
  RR --> GEO
  RR --> MPR
  RR --> NMED
  RR --> PHONE
  RR --> SAUTH
  RR -. "helpers: _sync_order_debt_ledger,<br/>_append_debt_entry, _write_audit" .-> MODELS
  SALES --> PRICE
  SALES --> PHONE
  SALES --> GLR
  DEBT --> SALES
  DEXP --> INV
  MIG --> DEBT
  SALES --> MODELS
  DEBT --> MODELS
  STOCK --> MODELS
  SYNC --> MODELS
  OCL --> MODELS
  MODELS --> DBM
```

### Bảng router → service

| Nhóm API | Endpoint chính | Service / model |
|---|---|---|
| Auth | `/auth/login`, `/refresh`, `/logout`, `/mobile/*`, `/me` | `services/auth`, `User`, `RefreshToken` |
| Sync | `/sync/pull`, `/sync/push`, `/sync/sales-order-ids` | `sync_engine` → `sales`, `order_change_log` |
| Orders | `/orders` CRUD, `/orders/{id}/change-log` | `sales`, `order_change_log`, `debt_orders` + debt helpers |
| Staff orders | `/me/orders`, `PATCH /me/orders/{id}` | `SalesOrder`, `sales.order_to_response` |
| Debt | `/debt-orders`, `/debt-accounts`, `/debt-payments`, `/debt-write-offs`, `/debt-aging` | `debt_orders`, `phone`, `Debt*` |
| Catalog / stock | `/products`, `/products/{id}/stock-receipts`, `/stock-receipts`, `/cylinder-templates` | `stock_receipts`, `Product`, `CylinderTemplate` |
| Ledgers / export | `/gas-ledger[.csv]`, `/shell-debt-ledger[.csv]`, `/sales-gas-export.csv`, `/orders/{id}/delivery-slip.html` | `gas_ledger_rules`, `delivery_export`, `invoice_filename` |
| Tax | `/orders/tax-report`, `/tax-export.csv` | `SalesOrder` + lines |
| Dashboard | `/dashboard`, `/dashboard/summary?range=` | aggregate trong `routes.py` |
| Operations | `/operations/delivery-day-summary`, `/operations/daily-cylinder-audit[/{date}]` | `DailyCylinderAudit`, `stock_receipts` |
| Notes | `/order-notes`, `/order-notes/voice` | `OrderNote`, `order_note_media` → `/media` |
| Geocode | `/geocode`, `/geocode/reverse`, `/geocode/from-paste` | `geocode`, `map_paste_resolve` |
| Governance | `/shift-settlements`, `/finance-kpis`, `/complaint-tickets`, `/capa-items`, `/audit-logs`, ... | model tương ứng + `_write_audit` |

## 3. Data model (rút gọn)

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--o{ sales_orders : "created_by / assigned_to"
  sales_orders ||--o{ sales_order_items : lines
  products ||--o{ sales_order_items : product
  products ||--o{ stock_receipts : "opening / inbound"
  sales_orders ||--o{ order_change_log : history
  debt_accounts ||--o{ debt_ledger_entries : ledger
  sales_orders ||--o{ debt_ledger_entries : "invoice / adjust"
  debt_accounts ||--o{ debt_payments : pays
  sales_orders ||--o{ debt_payments : for
  debt_accounts ||--o{ debt_write_offs : writeoff
  users ||--o{ order_notes : writes
  users ||--o{ daily_cylinder_audit : records
  users ||--o{ audit_log_entries : actor
  sales_orders ||--o{ customer_journey_events : events
```

- `debt_accounts.customer_key` là số điện thoại đã chuẩn hoá (`phone.normalize_phone`).
- `order_notes` không có FK trỏ tới đơn hàng.
- `sync_applied_mutations` là bảng độc lập, dùng để chống ghi trùng khi push.
- Chi tiết ER từng domain: `docs/database/relations-postgresql.md`.

## 4. Frontend web: module/component

```mermaid
flowchart TB
  MAIN["main.tsx"] --> APP["App.tsx<br/>Providers + Routes + GuardedRoute"]
  APP --> AUTH["lib/auth.tsx AuthProvider / useAuth"]
  AUTH --> API["lib/api.ts<br/>fetch + cookie + 401 → refresh retry"]
  APP --> LAYOUT["AppLayout<br/>admin: AppSidebar / staff: StaffPrimaryNav"]
  LAYOUT --> NAV["lib/navGroups"]

  subgraph Admin["Admin pages"]
    DASH["/tong-quan Dashboard"]
    ORD["/don-hang Orders"]
    SLIP["/don-hang/phieu/:id DeliverySlip"]
    LED["/so-gas GasLedger"]
    PROD["/san-pham Products"]
    INVP["/kho Inventory"]
    TAX["/bao-cao-thue TaxReport"]
    USR["/nguoi-dung Users"]
    CT["/mau-chai CylinderTemplates"]
    OPS["/dieu-hanh CoreOperations"]
    FIN["/tai-chinh-quan-tri FinanceGovernance"]
    CX["/trai-nghiem-khach-hang CustomerExperience"]
  end
  subgraph Staff["Staff pages"]
    MY["/don-cua-toi StaffOrderHistory"]
    NOTES["/ghi-chu-giao OrderNotes"]
    MAP["/ban-do StaffDeliveryMap"]
  end
  subgraph Shared["Shared components"]
    DNP["DeliveryNotesPanel"]
    DMP["DeliveryMapPanel"]
    OAPM["OrderAddressPickMap - leaflet"]
    SDL["finance/ShellDebtLedgerTab"]
    ASP["AsyncStatePanel / StatusBadge"]
  end

  LAYOUT --> Admin
  LAYOUT --> Staff
  APP --> SLIP
  ORD --> DNP
  ORD --> DMP
  ORD --> OAPM
  NOTES --> DNP
  MAP --> DMP
  FIN --> SDL
  DASH --> ASP
  OPS --> ASP
  FIN --> ASP
  CX --> ASP
  Admin --> API
  Staff --> API
  Shared --> API
  API -- "/api/*" --> BE["FastAPI backend"]
```

- Public: `/` `StoreLanding` (tĩnh), `/admin` `Login`.
- State toàn cục duy nhất là `AuthContext`; mọi trang tự fetch bằng `useState` + `useEffect` + `apiGet/apiPost`.
- `DeliverySlip` và `Login` không dùng `AppLayout`.

## 5. Mobile: module + offline sync

```mermaid
flowchart TB
  ROOT["app/_layout.tsx<br/>migrateLocalDb, startAutoSync"] --> BOOT["auth/bootstrap resolveSessionRoute<br/>offline-policy 72h: full / restricted / locked"]
  BOOT --> ADM["(admin)/(tabs): dashboard, orders, audit, more<br/>module/*: products, inventory, debt, tax, users..."]
  BOOT --> STF["(staff)/(tabs): đơn giao, notes, điểm giao"]
  BOOT --> LOCK["locked-session"]

  subgraph Panels["src/features panels"]
    P1["AdminCreateOrderPanel"]
    P2["StaffOrdersPanel / StaffNotesPanel"]
    P3["AdminAuditPanel"]
    P4["Online-only: debt, CRUD, tax, export"]
  end
  ADM --> P1
  ADM --> P3
  ADM --> P4
  STF --> P2

  SQL[("SQLite + Drizzle<br/>sales_orders, products, order_notes,<br/>outbox, sync_meta")]
  OUT["sync/outbox enqueueMutation"]
  AUTO["sync/auto-sync<br/>NetInfo, foreground, 30s / 2min"]
  ENG["sync/engine runSyncCycle"]
  CLI["api/client apiFetch<br/>Bearer + refresh"]
  SEC[("SecureStore tokens")]

  P1 -- offline --> OUT
  P1 -- online --> CLI
  P2 --> OUT
  P3 --> OUT
  P4 --> CLI
  P1 --> SQL
  P2 --> SQL
  P3 --> SQL
  OUT --> SQL
  AUTO --> ENG
  ENG -- "1. voice upload" --> CLI
  ENG -- "2. push outbox" --> CLI
  ENG -- "3. pull + upsert" --> SQL
  ENG -- "4. purge stale" --> CLI
  CLI --> SEC
  CLI -- "EXPO_PUBLIC_API_URL" --> BE["FastAPI /api"]
```

## 6. Flow nghiệp vụ chính

### 6.1 Đăng nhập: web (cookie) vs mobile (Bearer)

```mermaid
sequenceDiagram
  participant W as Web AuthProvider
  participant M as Mobile bootstrap
  participant A as api/auth.py
  participant S as services/auth
  participant D as DB

  W->>A: POST /api/auth/login
  A->>S: authenticate_user + create_access_token
  S->>D: insert refresh_tokens (sha256)
  A-->>W: Set-Cookie access_token, refresh_token
  W->>A: GET /api/auth/me
  Note over W,A: 401 → POST /api/auth/refresh → retry 1 lần

  M->>A: POST /api/auth/mobile/login
  A-->>M: JSON access + refresh
  M->>M: SecureStore lưu token
  Note over M: offline: token còn hạn → full,<br/>≤72h từ lần online → restricted, quá → locked
```

### 6.2 Tạo / sửa / xoá đơn trên web + công nợ

```mermaid
sequenceDiagram
  participant UI as Orders page
  participant R as routes.py
  participant SA as services/sales
  participant DO as services/debt_orders
  participant OC as order_change_log
  participant D as DB

  UI->>R: POST /api/orders
  R->>SA: create_sales_order
  SA->>D: check stock, price theo segment, VAT,<br/>insert order + items, trừ stock
  alt outstanding > 0
    R->>D: debt account theo phone + ledger invoice (+outstanding)
    R->>DO: recompute outstanding + balance
    R->>D: audit CREATE_DEBT_INVOICE
  end
  R-->>UI: order

  UI->>R: PATCH /api/orders/{id}
  R->>OC: order_snapshot(before)
  R->>SA: update_sales_order (hoàn stock, rebuild lines, trừ stock)
  R->>OC: record_order_change(source=web)
  R->>D: _sync_order_debt_ledger (adjustment / chuyển account nếu đổi phone)

  UI->>R: DELETE /api/orders/{id}
  R->>SA: delete_sales_order (soft delete, hoàn stock)
  R->>D: ledger adjustment (-net) + recompute
```

### 6.3 Thu nợ / xoá nợ

```mermaid
flowchart LR
  A["POST /debt-payments"] --> B{"amount ≤ outstanding?"}
  B -- no --> E["422"]
  B -- yes --> C["insert DebtPayment<br/>+ returned_shell_units"]
  C --> D["ledger payment (-amount)"]
  D --> F["_sync_account_after_order<br/>recompute outstanding + balance"]
  F --> G["audit CREATE_DEBT_PAYMENT"]
  W["POST /debt-write-offs"] --> W1["insert DebtWriteOff + approver"] --> W2["ledger write_off (-amount)"] --> F
```

### 6.4 Mobile offline sync (push → pull)

```mermaid
sequenceDiagram
  participant P as Mobile panel
  participant O as outbox (SQLite)
  participant E as sync/engine
  participant API as api/sync.py
  participant SE as sync_engine
  participant D as Postgres

  P->>O: enqueueMutation(client_mutation_id, entity, payload)
  Note over E: trigger: startup, online lại,<br/>foreground, 30s pending, 2min pull
  E->>API: POST /api/order-notes/voice (voice chờ upload)
  loop đến khi outbox rỗng
    E->>API: POST /api/sync/push
    API->>SE: apply_push
    alt đã apply client_mutation_id
      SE-->>E: applied (idempotent)
    else
      SE->>D: lock → order_note / sales_order / daily_cylinder_audit
      SE->>D: record_order_change(source=sync) + mark applied
      SE-->>E: applied hoặc rejected
    end
  end
  E->>API: GET /api/sync/pull?cursor=
  API->>SE: pull_changes (staff chỉ thấy đơn của mình)
  SE-->>E: upserts + tombstones + cursor mới
  E->>O: upsert SQLite, lưu pull_cursor
  E->>API: GET /api/sync/sales-order-ids → xoá đơn cũ local
```

Đơn tạo qua sync **không** ghi `debt_ledger_entries`.

### 6.5 Kho & kiểm kê bình

```mermaid
flowchart TB
  NP["POST /products (stock > 0)"] --> OR["record_opening_receipt<br/>opening, không cộng stock"]
  SR["POST /products/{id}/stock-receipts"] --> IR["apply_inbound_receipt<br/>inbound, cộng stock_quantity"]
  IR --> SY["sync_audit_import_full<br/>DailyCylinderAudit.import_full"]
  ORD["Orders create/update/delete"] --> STK["trừ / hoàn Product.stock_quantity"]
  GA["GET /operations/daily-cylinder-audit"] --> SY
  GA --> CMP["_build_daily_cylinder_computed<br/>exp_full = morning_full + import - delivered<br/>exp_shell = morning_shell + delivered - supplier_shell - borrowed + returned<br/>variance = evening - expected"]
  PA["PUT /operations/daily-cylinder-audit/{date}"] --> UP["upsert counts + audit"] --> CMP
```

### 6.6 Geocode địa chỉ giao hàng

```mermaid
flowchart LR
  IN["POST /geocode/from-paste"] --> R1["resolve_paste_to_lat_lng<br/>follow Maps redirect, DMS, decimal, Plus Code"]
  R1 -- "có toạ độ" --> REV["nominatim_reverse"]
  R1 -- "không có" --> Q["resolve_place_query_from_paste<br/>place_query_variants"] --> SRCH["nominatim_search"]
  REV --> OUT["GeocodeHit"]
  SRCH --> OUT
  SRCH -. "Nominatim lỗi" .-> E503["503"]
```

## 7. CI / release

```mermaid
flowchart LR
  PUSH["push / PR main"] --> CI[".github/workflows/ci.yml"]
  CI --> J1["backend: Postgres 16 + pytest"]
  CI --> J2["frontend: npm ci + build"]
  CI --> J3["mobile: npm ci + tsc"]
  TAG["tag mobile/v* hoặc dispatch"] --> MR["mobile-release.yml"]
  MR --> K["decode keystore + set version"] --> G["gradlew assembleRelease"] --> REL["APK artifact + GitHub Release"]
```
