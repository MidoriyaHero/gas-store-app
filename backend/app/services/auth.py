"""Authentication helpers for password hashing, JWT, and cookie sessions."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import RefreshToken, User, UserRole

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
settings = get_settings()


def hash_password(password: str) -> str:
    """Hash a plaintext password for persistent storage."""
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Validate a plaintext password against stored hash."""
    return pwd_context.verify(password, password_hash)


def create_access_token(user: User) -> str:
    """Generate short-lived JWT access token containing subject and role."""
    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def _refresh_token_hash(token: str) -> str:
    """Hash refresh token for safe database persistence."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_refresh_token(db: Session, user: User) -> str:
    """Create refresh token, persist hashed value, and return plaintext token."""
    token = secrets.token_urlsafe(48)
    row = RefreshToken(
        user_id=user.id,
        token_hash=_refresh_token_hash(token),
        expires_at=datetime.now(tz=UTC) + timedelta(days=settings.jwt_refresh_token_days),
    )
    db.add(row)
    db.commit()
    return token


def rotate_refresh_token(db: Session, token: str) -> User | None:
    """Revoke old refresh token and issue a new one when token is valid."""
    h = _refresh_token_hash(token)
    row = db.scalars(select(RefreshToken).where(RefreshToken.token_hash == h)).first()
    if row is None:
        return None
    if row.revoked_at is not None or row.expires_at < datetime.now(tz=UTC):
        return None
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    row.revoked_at = datetime.now(tz=UTC)
    db.commit()
    return user


def revoke_refresh_token(db: Session, token: str | None) -> None:
    """Mark a refresh token as revoked if it exists."""
    if not token:
        return
    h = _refresh_token_hash(token)
    row = db.scalars(select(RefreshToken).where(RefreshToken.token_hash == h)).first()
    if row is None or row.revoked_at is not None:
        return
    row.revoked_at = datetime.now(tz=UTC)
    db.commit()


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify JWT access token payload."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    """Find user by username and verify password."""
    user = db.scalars(select(User).where(User.username == username.strip())).first()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def normalize_role(role: str) -> str:
    """Convert arbitrary role input to canonical enum value."""
    role_lower = role.strip().lower()
    if role_lower == UserRole.ADMIN.value:
        return UserRole.ADMIN.value
    return UserRole.USER.value
