# Contributing

PRs và issues đều welcome. Tài liệu kỹ thuật: [docs/README.md](./docs/README.md). Cách chạy stack: [README.md](./README.md).

## Trước khi mở PR

1. Backend tests:

   ```bash
   cd backend
   pip install -r requirements-dev.txt
   pytest -q
   ```

2. Frontend build:

   ```bash
   cd frontend
   npm ci
   npm run build
   ```

3. (Tuỳ chọn) Mobile typecheck: `cd mobile && npx tsc --noEmit`

4. (Tuỳ chọn) E2E: `./scripts/e2e-api.sh` hoặc `./scripts/e2e-full.sh` khi Docker đang chạy.

## Ghi chú

- Không commit `.env`, keystore, mật khẩu.
- Schema DB cũ được nâng cấp additive trong `backend/app/schema_migrate.py` — không thêm file Alembic trừ khi đội quyết định đổi hướng.
- Feature mới trên dashboard: đọc [docs/dashboard-feature-gate.md](./docs/dashboard-feature-gate.md).
