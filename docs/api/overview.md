# API — Tổng quan

REST API FastAPI, prefix **`/api`**. Media static: **`/media`**.

## Base URL

| Môi trường | URL |
|------------|-----|
| Docker local | `http://localhost:8000/api` |
| Web (proxy nginx) | Same-origin `/api` |
| OpenAPI interactive | `http://localhost:8000/docs` |

## Auth modes

| Client | Cách gửi token | Refresh |
|--------|----------------|---------|
| Web | Cookie `access_token` (httpOnly) | `POST /api/auth/refresh` (cookie) |
| Mobile | Header `Authorization: Bearer <access>` | `POST /api/auth/mobile/refresh` (JSON body) |

Chi tiết: [auth.md](./auth.md)

## Role matrix

| Endpoint nhóm | `admin` | `user` |
|---------------|---------|--------|
| CRUD đơn/kho/users/nợ/báo cáo | ✓ | ✗ |
| `/me/orders`, ghi chú, sync | ✓ | ✓ (phạm vi đơn của mình) |
| Geocode | ✓ | ✓ |

## Conventions

- **JSON body:** Pydantic schemas — xem [backend/app/schemas.py](../../backend/app/schemas.py).
- **Datetime:** ISO 8601 UTC (pull cursor sync).
- **Soft delete đơn:** `deleted_at` — không trả về pull.
- **Idempotency (mobile):** mỗi push có `client_mutation_id` (UUID).

## Error format

FastAPI mặc định:

```json
{ "detail": "Mô tả lỗi" }
```

HTTP status phổ biến: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `400 Bad Request`.

## Sync (mobile)

- `GET /api/sync/pull` — incremental read
- `POST /api/sync/push` — một mutation/lần

Chi tiết: [sync.md](./sync.md)

## Liên kết

- [Auth](./auth.md)
- [Endpoints](./endpoints.md)
- [Architecture](../architecture/overview.md)
