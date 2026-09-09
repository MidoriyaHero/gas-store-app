# Gas Store App

App quản lý cửa hàng gas: kho hàng, đơn hàng, công nợ theo đơn, sổ gas, báo cáo thuế, phân quyền và xuất CSV/HTML. Monorepo gồm API FastAPI, web React, mobile Expo (Android, offline-first).

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, PostgreSQL
- **Frontend:** Vite, React, TypeScript, shadcn/ui
- **Mobile:** Expo, React Native, SQLite (Drizzle) + outbox
- **Auth:** JWT — web dùng cookie httpOnly (`access_token`, `refresh_token`); mobile dùng Bearer
- **Deploy local:** Docker Compose (web + api + db)

## Documentation

| Tài liệu | Nội dung |
|----------|----------|
| [docs/README.md](./docs/README.md) | Kiến trúc, database ER, API, features |
| [docs/deploy/cloudflare-tunnel.md](./docs/deploy/cloudflare-tunnel.md) | Production HTTPS (Cloudflare Tunnel) |
| [docs/deploy/windows.md](./docs/deploy/windows.md) | Auto-start Docker + tunnel trên Windows |
| [mobile/README.md](./mobile/README.md) | Expo Android, APK, sync offline |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Checklist trước khi mở PR |
| [Thuế và xuất dữ liệu](./docs/thue-va-xuat-du-lieu.md) | Báo cáo thuế / CSV |

## CI

GitHub Actions: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — backend pytest, frontend build, mobile typecheck on push/PR.

Release APK: [`.github/workflows/mobile-release.yml`](./.github/workflows/mobile-release.yml) — tag `mobile/v*` or manual dispatch.

## Main Features

- Kho hàng (CRUD sản phẩm, nhập kho qua stock receipts)
- Đơn hàng: tạo / sửa / soft-delete; phiếu giao HTML; staff xem đơn của mình (`/don-cua-toi`)
- Công nợ **theo từng đơn** (không FIFO cấp SĐT); sổ nợ vỏ
- Sổ gas + kiểm kê bình/vỏ theo ngày (`/so-gas`, `/dieu-hanh`)
- Mẫu thông tin chai do admin CRUD (`/mau-chai`)
- Ghi chú giao (text + voice); file audio qua `/media/...`
- Báo cáo thuế + export CSV
- Người dùng (admin): tạo/sửa/xóa, bật/tắt, role `admin` / `user`
- Mobile admin/staff: sync offline, thu nợ online, kiểm kê

Danh sách đầy đủ × web × mobile: [docs/features/README.md](./docs/features/README.md).

## Demo

Video giới thiệu / walkthrough: [YouTube — Gas Store App](https://www.youtube.com/watch?v=k7-D3tZWkus)

## Authentication & Authorization

- Web không lưu token ở localStorage; session là cookie httpOnly.
- Mobile lưu token trong SecureStore; gọi API bằng `Authorization: Bearer`.
- API kiểm soát quyền ở backend (RBAC), không phụ thuộc frontend.

### Default Admin Account

Không còn mật khẩu mặc định trong code. Lần **đầu** chạy trên host mới, seed admin vào `.env` (không commit).

Git Bash / WSL / macOS / Linux:

```bash
./setup.sh --admin-user shopadmin --admin-pass 'YourStrongPass!'
```

Production (Cloudflare):

```bash
./setup.sh --admin-user shopadmin --admin-pass 'YourStrongPass!' \
  --cors 'https://app.gashuyhoang.io.vn,https://gashuyhoang.io.vn'
```

Windows PowerShell (không dùng `setup.sh`): copy `.env.example` → `.env`, điền `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (và `CORS_ORIGINS` nếu production), rồi `docker compose up --build`.

Chạy lại `./setup.sh` sau khi đã có `.env` giữ nguyên admin đã seed.

Nếu DB đã có admin, API bỏ qua seed — đổi mật khẩu qua UI admin hoặc tạo user mới.

## Quick Start (Docker)

Từ thư mục gốc project — **host mới** (bắt buộc admin user/pass):

```bash
./setup.sh --admin-user shopadmin --admin-pass 'YourStrongPass!'
```

Hoặc thủ công (mọi OS, kể cả Windows PowerShell):

```bash
copy .env.example .env
# điền SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD
docker compose up --build
```

*(Chỉ `docker compose up` khi `.env` đã có seed admin và DB chưa có admin, hoặc DB đã seed trước đó.)*

Services mặc định:

- Web: `http://localhost:8686`
- API: `http://localhost:8000` (OpenAPI: `/docs`)
- Postgres: `localhost:5432`

Nếu trùng port:

```bash
WEB_PORT=9080 API_PORT=8001 POSTGRES_PORT=55432 ./setup.sh
```

Windows PowerShell:

```powershell
$env:WEB_PORT=9080; $env:API_PORT=8001; $env:POSTGRES_PORT=55432
docker compose up --build
```

Auto-start production trên Windows (Docker + Cloudflare Tunnel): [docs/deploy/windows.md](./docs/deploy/windows.md).

### Kiểm tra UI

1. Mở URL web (ví dụ `http://127.0.0.1:8686` hoặc `WEB_PORT` nếu override).
2. Vào `/login`, đăng nhập bằng admin đã seed.
3. Duyệt `/` (Tổng quan), `/tai-chinh-quan-tri`, `/dieu-hanh` và các màn khác cần kiểm.

### Tùy chọn: smoke HTTP

```bash
SMOKETEST_URL=http://127.0.0.1:8686 ./scripts/smoke-http.sh
```

Nếu đổi `WEB_PORT`, truyền đúng URL vào `SMOKETEST_URL`.

### Kiểm thử API (pytest)

```bash
cd backend && pytest tests/integration/test_smoke.py -q
```

## Local Development

### 1) Start DB only

```bash
docker compose up -d db
```

### 2) Run backend

macOS / Linux:

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Mở `http://127.0.0.1:5173` (Vite proxy `/api` và `/media` sang backend `:8000`). Chi tiết: [frontend/README.md](./frontend/README.md), [backend/README.md](./backend/README.md).

## Environment Variables

Copy [.env.example](./.env.example) → `.env` ở thư mục gốc cho Docker Compose.

### Backend ([backend/app/config.py](./backend/app/config.py))

| Biến | Mục đích |
|------|----------|
| `DATABASE_URL` | SQLAlchemy URL (Compose tự set khi chạy trong Docker) |
| `CORS_ORIGINS` | Origin trình duyệt, phân tách bằng dấu phẩy |
| `JWT_SECRET_KEY` | Ký JWT (đổi trên production) |
| `JWT_ACCESS_TOKEN_MINUTES` | Thời hạn access (mặc định 7 ngày) |
| `JWT_REFRESH_TOKEN_DAYS` | Thời hạn refresh (mặc định ~10 năm) |
| `AUTH_COOKIE_SECURE` | Cookie `Secure` (HTTPS) |
| `AUTH_COOKIE_SAMESITE` | `lax` / `strict` / `none` |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | Seed lần đầu (via `./setup.sh` hoặc `.env`) |
| `MEDIA_ROOT` | Thư mục file voice note (Compose: `/data/media`) |
| `NOMINATIM_USER_AGENT` | User-Agent khi geocode OSM |

### Docker Compose / host

| Biến | Mục đích |
|------|----------|
| `WEB_PORT` / `API_PORT` / `POSTGRES_PORT` | Cổng publish |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token tunnel (Windows auto-start) |
| `VITE_API_BASE` | Build-arg web (thường để trống, same-origin `/api`) |
| `EXPO_PUBLIC_API_URL` | URL API cho mobile (xem `mobile/.env.example`) |

## Data & Schema Notes

PostgreSQL là nguồn sự thật (~25 bảng: catalog, orders, debt, ops, sync, governance). Schema và ER: [docs/database/overview.md](./docs/database/overview.md).

- Startup migration additive: [backend/app/schema_migrate.py](./backend/app/schema_migrate.py) — không dùng Alembic.
- Cột `users.template_*` (mẫu per-user cũ) có thể còn trên DB đã deploy; **API không đọc/ghi** — dùng `cylinder_templates`.

Nếu nâng cấp từ schema rất cũ và gặp lỗi lạ, reset volume:

```bash
docker compose down -v
```

## Tests

### Backend unit/integration

```bash
cd backend
# macOS/Linux: source .venv/bin/activate
# Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest -q
```

### E2E API (cần API đang chạy + `jq`)

```bash
BASE_URL=http://127.0.0.1:8000 ./scripts/e2e-api.sh
```

### Full-stack E2E (Docker + Playwright)

```bash
./scripts/e2e-full.sh
```

Chạy headed: `HEADED=1 ./scripts/e2e-full.sh`.

## Project Structure

```text
.
├── backend/          FastAPI API + pytest
├── frontend/         Vite React admin/staff web
├── mobile/           Expo Android (offline-first)
├── docs/             Tài liệu kỹ thuật
├── scripts/          Smoke, e2e, Windows start
├── docker-compose.yml
└── setup.sh
```

## API Overview

Prefix `/api`. Auth cookie (web) hoặc Bearer (mobile). Bảng đầy đủ: [docs/api/endpoints.md](./docs/api/endpoints.md). Interactive: `http://localhost:8000/docs`.

Nhóm chính: `/auth/*`, `/orders`, `/me/orders`, `/products`, `/debt-orders`, `/debt-payments`, `/gas-ledger`, `/sync/*`, `/dashboard`, `/cylinder-templates`, `/order-notes`.

## Contributing

PRs/issues are welcome. Trước khi mở PR xem [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Chưa chọn license cho repo này.
