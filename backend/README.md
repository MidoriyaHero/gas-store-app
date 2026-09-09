# Backend (API)

FastAPI + SQLAlchemy + PostgreSQL. Python **3.13**. OpenAPI: `http://127.0.0.1:8000/docs`.

Tài liệu: [docs/api/overview.md](../docs/api/overview.md), [docs/api/endpoints.md](../docs/api/endpoints.md). Schema: [app/models.py](./app/models.py), migrate additive: [app/schema_migrate.py](./app/schema_migrate.py).

## Dev

Postgres: `docker compose up -d db` từ thư mục gốc. Copy env từ [../.env.example](../.env.example) hoặc `backend/.env`.

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

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

Smoke: `pytest tests/integration/test_smoke.py -q`.

## Cấu hình chính

[app/config.py](./app/config.py) — `DATABASE_URL`, `CORS_ORIGINS`, `JWT_*`, cookie flags, `SEED_ADMIN_*`, `MEDIA_ROOT`, Nominatim UA. Seed admin chỉ lần đầu khi DB chưa có admin.
