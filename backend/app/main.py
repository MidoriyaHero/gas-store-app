"""FastAPI entrypoint: CORS, DB bootstrap, and API routes."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.api.auth import router as auth_router
from app.api.routes import router
from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import Product, User, UserRole
from app.schema_migrate import ensure_gas_schema
from app.services.auth import hash_password

settings = get_settings()


def _seed_demo_products() -> None:
    """Insert demo catalog when the products table is empty."""
    with SessionLocal() as db:
        n = db.scalar(select(Product.id).limit(1))
        if n is not None:
            return
        samples = [
            Product(
                name="Gas 12kg",
                sku="GAS-12",
                description="Bình gas 12kg",
                cost_price=350000,
                sell_price=420000,
                stock_quantity=120,
                low_stock_threshold=10,
            ),
            Product(
                name="Gas 45kg",
                sku="GAS-45",
                description="Bình gas 45kg",
                cost_price=1200000,
                sell_price=1450000,
                stock_quantity=40,
                low_stock_threshold=10,
            ),
            Product(
                name="Van ly gas",
                sku="VAN-LY",
                description=None,
                cost_price=25000,
                sell_price=35000,
                stock_quantity=200,
                low_stock_threshold=10,
            ),
        ]
        db.add_all(samples)
        db.commit()


def _seed_admin_user() -> None:
    """Create initial admin account when missing."""
    with SessionLocal() as db:
        exists = db.scalar(select(User.id).where(User.username == settings.seed_admin_username.strip()))
        if exists is not None:
            return
        db.add(
            User(
                username=settings.seed_admin_username.strip(),
                password_hash=hash_password(settings.seed_admin_password),
                role=UserRole.ADMIN.value,
                is_active=True,
            )
        )
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create tables on startup and optional seed data."""
    Base.metadata.create_all(bind=engine)
    ensure_gas_schema()
    media_root = Path(get_settings().media_root).resolve()
    (media_root / "order-notes").mkdir(parents=True, exist_ok=True)
    _seed_demo_products()
    _seed_admin_user()
    yield


def create_app() -> FastAPI:
    """Build the FastAPI application with middleware and routers."""
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth_router, prefix="/api")
    app.include_router(router, prefix="/api")
    media_dir = Path(get_settings().media_root).resolve()
    media_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(media_dir)), name="media")
    return app


app = create_app()
