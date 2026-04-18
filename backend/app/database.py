"""SQLAlchemy engine and session factory."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for ORM models."""


settings = get_settings()
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
_engine_kwargs: dict = {"connect_args": _connect_args} if _connect_args else {}
if settings.database_url.startswith("postgresql"):
    _engine_kwargs["pool_pre_ping"] = True
engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator:
    """Yield a database session for request-scoped use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
