# Frontend (web)

Vite + React + TypeScript (shadcn/ui). Admin/staff UI; session cookie httpOnly, proxy `/api` và `/media` sang FastAPI.

Tài liệu nghiệp vụ / API: [docs/README.md](../docs/README.md). Nav: [src/lib/navGroups.ts](./src/lib/navGroups.ts).

## Dev

Cần API trên `http://127.0.0.1:8000` (Docker `api` hoặc `uvicorn` local).

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Mở `http://127.0.0.1:5173`. Proxy: [vite.config.ts](./vite.config.ts).

Env build (Compose args / `.env.example`): `VITE_API_BASE` (Docker web thường để trống = same-origin `/api`), `VITE_MAP_DEFAULT_LAT` / `LNG`, `VITE_DEFAULT_STORE_CONTACT`.

## Scripts

| Lệnh | Mục đích |
|------|----------|
| `npm run dev` | Vite HMR |
| `npm run build` | Production bundle (nginx image) |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |

## Wireframe cũ

[docs/ui-wireframe-phase1.md](./docs/ui-wireframe-phase1.md) là historical — không dùng làm spec route.
