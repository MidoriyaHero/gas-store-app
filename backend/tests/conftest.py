"""Shared pytest fixtures: in-memory SQLite and FastAPI TestClient with DB override."""

from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — register Item/Order models on Base.metadata before create_all.

from app.api.routes import router
from app.database import Base, get_db


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide a SQLite in-memory session with fresh schema tables."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def api_client(db_session: Session) -> Generator[TestClient, None, None]:
    """HTTP client against a minimal FastAPI app with overridden database session."""

    def override_db() -> Generator[Session, None, None]:
        yield db_session

    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
