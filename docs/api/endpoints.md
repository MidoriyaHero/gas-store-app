# API — Endpoints

Bảng endpoint theo domain. Chi tiết request/response: FastAPI `/docs` hoặc [schemas.py](../../backend/app/schemas.py).

**Nguồn:** [backend/app/api/routes.py](../../backend/app/api/routes.py)

Legend auth: **A** = admin, **U** = any authenticated user, **—** = public.

## Auth

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| POST | `/auth/login` | — | Web session |
| POST | `/auth/mobile/login` | — | Mobile tokens |
| GET | `/auth/me` | U | Current user |

→ [auth.md](./auth.md)

## Sync

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/sync/pull` | U | Incremental pull |
| POST | `/sync/push` | U | Push mutation |

→ [sync.md](./sync.md)

## Geocode

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/geocode` | U | Forward geocode search |
| GET | `/geocode/reverse` | U | Reverse geocode lat/lng |
| POST | `/geocode/from-paste` | U | Parse địa chỉ dán |

## Products & inventory

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/products` | U | List products |
| POST | `/products` | A | Create product |
| PATCH | `/products/{id}` | A | Update product |
| DELETE | `/products/{id}` | A | Deactivate/delete |
| GET | `/products-export.csv` | A | Export CSV |
| GET | `/products/{id}/stock-receipts` | U | Lịch sử nhập kho |
| POST | `/products/{id}/stock-receipts` | A | Nhập kho / opening |

## Cylinder templates

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/cylinder-templates` | U | List mẫu chai |
| POST | `/cylinder-templates` | A | Create |
| PATCH | `/cylinder-templates/{id}` | A | Update |
| DELETE | `/cylinder-templates/{id}` | A | Delete |

## Orders (admin)

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/orders` | A | List + filter; query `q` (mã/khách/SĐT), `limit`, `offset` |
| POST | `/orders` | A | Create order |
| GET | `/orders/{id}` | A | Detail |
| PATCH | `/orders/{id}` | A | Update |
| DELETE | `/orders/{id}` | A | Soft delete |
| GET | `/orders/tax-report` | A | Báo cáo thuế |
| GET | `/orders/{id}/delivery-slip.html` | A | Phiếu giao HTML |
| GET | `/orders/{id}/gas-export.csv` | A | Export gas line |
| GET | `/tax-export.csv` | A | Export thuế CSV |

## Staff orders (`/me`)

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/me/orders` | U | Đơn của staff |
| PATCH | `/me/orders/{id}` | U | Cập nhật phạm vi staff |

## Order notes

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/order-notes` | U | List notes |
| POST | `/order-notes` | U | Text note |
| POST | `/order-notes/voice` | U | Upload voice |
| PATCH | `/order-notes/{id}` | U | Update |
| DELETE | `/order-notes/{id}` | U | Delete |

## Users

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/users` | A | List users |
| POST | `/users` | A | Create |
| PATCH | `/users/{id}` | A | Update role/active |
| DELETE | `/users/{id}` | A | Delete |

## Debt & finance

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/debt-accounts` | A | List công nợ |
| GET | `/debt-accounts/{id}` | A | Detail + ledger |
| GET | `/debt-accounts/{id}/ledger` | A | Ledger entries |
| POST | `/debt-payments` | A | Thu nợ |
| PATCH | `/debt-payments/{id}` | A | Sửa thu nợ |
| DELETE | `/debt-payments/{id}` | A | Xóa thu nợ |
| POST | `/debt-write-offs` | A | Xóa nợ |
| GET | `/debt-aging` | A | Phân loại tuổi nợ |

## Gas ledger & operations

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/gas-ledger` | A | Sổ gas rows |
| GET | `/gas-ledger.csv` | A | Export CSV |
| GET | `/sales-gas-export.csv` | A | Export bán gas |
| GET | `/operations/daily-cylinder-audit` | A | Kiểm kê theo ngày |
| PUT | `/operations/daily-cylinder-audit/{date}` | A | Upsert kiểm kê |

**Mobile P1 gọi trực tiếp (không qua sync):**

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/orders` | Admin tạo đơn (FAB create order) |
| GET | `/cylinder-templates` | Mẫu chai preset khi tạo đơn |
| PATCH | `/orders/{id}` | Admin sửa đơn (full body từ cache) |
| GET | `/operations/daily-cylinder-audit` | Load kiểm kê theo ngày |
| PUT | `/operations/daily-cylinder-audit/{date}` | Lưu kiểm kê online |
| POST | `/debt-payments` | Thu nợ từ admin debt module |

## Dashboard & governance

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/dashboard` | A | Dashboard payload |
| GET/POST | `/shift-settlements` | A | Quyết toán ca |
| GET | `/shift-settlements/anomalies` | A | Bất thường tiền mặt |
| GET/POST | `/finance-kpis` | A | KPI baseline |
| GET/POST | `/customer-journey-events` | A | Hành trình KH |
| GET/POST/PATCH | `/complaint-tickets` | A | Khiếu nại |
| GET/POST | `/safety-checklist-runs` | A | Checklist an toàn |
| GET/POST/PATCH | `/capa-items` | A | CAPA board |
| GET/POST | `/audit-logs` | A | Audit trail |

## Liên kết features

Mỗi nhóm map tới [features/README.md](../features/README.md).
