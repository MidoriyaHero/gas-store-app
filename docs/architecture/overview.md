# Kiến trúc tổng quan

Gas Store App là hệ thống quản lý cửa hàng gas gồm **3 client** và **1 API** dùng chung PostgreSQL.

## Stack

| Layer | Công nghệ | Thư mục |
|-------|-----------|---------|
| API | FastAPI, SQLAlchemy, PostgreSQL | `backend/` |
| Web | Vite, React, TypeScript, shadcn/ui | `frontend/` |
| Mobile | Expo, React Native, SQLite (Drizzle) | `mobile/` |
| Deploy | Docker Compose (db + api + web) | `docker-compose.yml` |

## System context

```mermaid
flowchart LR
  subgraph clients [Clients]
    Web[Web React]
    Mobile[Mobile Expo]
  end
  API[FastAPI API]
  DB[(PostgreSQL)]
  Media[Media volume]
  Web -->|"JWT httpOnly cookie"| API
  Mobile -->|"Bearer JWT"| API
  API --> DB
  API --> Media
  Mobile --> SQLite[(SQLite cache)]
```

- **Web:** session qua cookie `access_token` / `refresh_token` (httpOnly).
- **Mobile:** token JSON (`/api/auth/mobile/*`), lưu SecureStore; cache offline SQLite + outbox.
- **Media:** file ghi âm, static path `/media/...` (volume `api_media` trong Docker).

## Auth — Web vs Mobile

```mermaid
sequenceDiagram
  participant W as Web browser
  participant M as Mobile app
  participant A as FastAPI auth

  Note over W,A: Web — cookie session
  W->>A: POST /api/auth/login
  A-->>W: Set-Cookie access + refresh
  W->>A: GET /api/... (cookie tự gửi)
  W->>A: POST /api/auth/refresh (refresh cookie)

  Note over M,A: Mobile — Bearer
  M->>A: POST /api/auth/mobile/login
  A-->>M: access_token + refresh_token JSON
  M->>A: Authorization Bearer + API calls
  M->>A: POST /api/auth/mobile/refresh
```

**Nguồn:** [backend/app/api/auth.py](../../backend/app/api/auth.py), [mobile/src/api/client.ts](../../mobile/src/api/client.ts)

### Phân quyền (RBAC)

| Role | Quyền chính |
|------|-------------|
| `admin` | Full CRUD đơn, kho, nợ, báo cáo, users |
| `user` | Tạo đơn, ghi chú; xem đơn được giao / do mình tạo |

Dependency: `get_current_user`, `require_admin_user`, `require_any_role`.

## Mobile offline-first

```mermaid
flowchart TB
  UI[Mobile UI] --> Local[(SQLite)]
  UI --> Outbox[outbox queue]
  Sync[Sync engine] --> Outbox
  Sync -->|POST /api/sync/push| API[FastAPI]
  Sync -->|GET /api/sync/pull| API
  API --> PG[(PostgreSQL)]
  Sync --> Local
```

Luồng chính:

1. **Pull:** incremental theo `cursor` + `entities` (`products`, `sales_orders`, `order_notes`).
2. **Push:** FIFO một mutation/lần; `client_mutation_id` idempotent qua `sync_applied_mutations`.
3. **Voice:** upload multipart `/api/order-notes/voice` sau khi ghi âm local.

**UX feedback (P1):** toast toàn app — [features/mobile-ux-feedback.md](../features/mobile-ux-feedback.md).

Chi tiết: [api/sync.md](../api/sync.md), [adr-mobile-sync.md](../adr-mobile-sync.md), [features/sync-offline-mobile.md](../features/sync-offline-mobile.md).

## Deploy Docker

```mermaid
flowchart LR
  Host[Host machine]
  subgraph compose [docker compose]
    WebC[web nginx :8686]
    ApiC[api uvicorn :8000]
    DbC[db postgres :5432]
  end
  Host --> WebC
  WebC -->|proxy /api| ApiC
  ApiC --> DbC
  ApiC --> Vol[api_media volume]
```

| Service | Port mặc định | Ghi chú |
|---------|---------------|---------|
| `web` | 8686 | Static UI + proxy API |
| `api` | 8000 | FastAPI, `/docs` OpenAPI |
| `db` | 5432 | Postgres 16 |

Khởi động: `./setup.sh` hoặc `docker compose up --build` — xem [README gốc](../../README.md).

## Liên kết

- [Database overview](../database/overview.md)
- [API overview](../api/overview.md)
- [Features index](../features/README.md)
