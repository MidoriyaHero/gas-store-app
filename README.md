# Gas Store App

Open-source app quản lý cửa hàng gas: kho hàng, đơn hàng, sổ gas, báo cáo thuế, phân quyền người dùng và xuất dữ liệu CSV/HTML.

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, PostgreSQL
- **Frontend:** Vite, React, TypeScript, shadcn/ui
- **Auth:** JWT + httpOnly cookie (`access_token`, `refresh_token`)
- **Deploy local:** Docker Compose (web + api + db)

## Main Features

- Quản lý sản phẩm kho hàng (CRUD)
- Quản lý đơn hàng:
  - Tạo đơn
  - Sửa đơn
  - Xóa đơn
- Sổ gas:
  - UI hiển thị theo mẫu sổ
  - Export CSV
- Phiếu giao hàng:
  - In trực tiếp
  - Export HTML / CSV theo đơn
- Báo cáo thuế + export CSV
- Quản lý người dùng (admin-only):
  - Tạo/sửa/xóa user
  - Bật/tắt trạng thái hoạt động
  - Đổi role (`admin`, `user`)
- Phân quyền:
  - `admin`: full quyền
  - `user`: chỉ tạo đơn hàng
- Lưu **Mẫu thông tin chai** theo user trên server (không còn localStorage)

## Authentication & Authorization

- Frontend không lưu token ở localStorage.
- Session chạy bằng cookie httpOnly.
- API kiểm soát quyền ở backend (RBAC), không phụ thuộc frontend.

### Default Admin Account

Được seed tự động khi backend khởi động lần đầu:

- Username: `admin`
- Password: `admin123`

Bạn nên đổi thông tin này khi deploy thật (qua biến môi trường).

## Quick Start (Docker)

Từ thư mục gốc project:

```bash
docker compose up --build
```

Services mặc định:

- Web: `http://localhost:8080`
- API: `http://localhost:8000`
- Postgres: `localhost:5432`

Nếu trùng port:

```bash
WEB_PORT=9080 API_PORT=8001 POSTGRES_PORT=55432 docker compose up --build
```

## Local Development

### 1) Start DB only

```bash
docker compose up -d db
```

### 2) Run backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Mở `http://127.0.0.1:5173` (Vite proxy `/api` sang backend).

## Environment Variables

### Backend

- `DATABASE_URL`
- `CORS_ORIGINS`
- `JWT_SECRET_KEY`
- `JWT_ACCESS_TOKEN_MINUTES`
- `JWT_REFRESH_TOKEN_DAYS`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_SAMESITE`
- `SEED_ADMIN_USERNAME`
- `SEED_ADMIN_PASSWORD`

### Docker Compose

- `WEB_PORT`
- `API_PORT`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

## Data & Schema Notes

- Current tables:
  - `products`
  - `sales_orders`
  - `sales_order_items`
  - `users`
  - `refresh_tokens`
- `users` có thêm cột lưu mẫu thông tin chai:
  - `template_owner_name`
  - `template_import_source`
  - `template_inspection_expiry`
  - `template_import_date`
- App có startup migration additive trong `backend/app/schema_migrate.py` để thêm cột thiếu cho DB cũ.

Nếu bạn nâng cấp từ schema rất cũ và gặp lỗi lạ, reset volume:

```bash
docker compose down -v
```

## Tests

### Backend unit/integration

```bash
cd backend
source .venv/bin/activate
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

Chạy headed:

```bash
HEADED=1 ./scripts/e2e-full.sh
```

## Project Structure

```text
.
├── backend/
│   ├── app/
│   └── tests/
├── frontend/
│   └── src/
├── docs/
├── scripts/
└── docker-compose.yml
```

## API Overview

Một số endpoint chính:

- Auth:
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- User template:
  - `GET /api/me/cylinder-template`
  - `PATCH /api/me/cylinder-template`
- Products:
  - `GET /api/products`
  - `POST /api/products`
  - `PATCH /api/products/{id}`
  - `DELETE /api/products/{id}`
- Orders:
  - `GET /api/orders`
  - `POST /api/orders`
  - `PATCH /api/orders/{id}`
  - `DELETE /api/orders/{id}`
- Ledger / reports / exports:
  - `GET /api/gas-ledger`
  - `GET /api/gas-ledger.csv`
  - `GET /api/orders/tax-report`
  - `GET /api/tax-export.csv`

## Documentation

- [Thuế và xuất dữ liệu](docs/thue-va-xuat-du-lieu.md)
- [Tích hợp UI bright-order-boss](docs/integrate-bright-ui.md)

## Contributing

PRs/issues are welcome.

Recommended before opening a PR:

1. Run backend tests (`pytest -q`)
2. Run frontend build (`npm run build`)
3. (Optional) Run e2e scripts

## License

Add your preferred license file (for example `MIT`) before publishing.
