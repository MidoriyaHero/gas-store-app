"""Authentication routes and authorization dependencies."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User, UserRole
from app.schemas import AuthSessionResponse, AuthUser, LoginRequest
from app.services.auth import (
    authenticate_user,
    create_access_token,
    decode_access_token,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
)

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_max_age(seconds: int) -> int:
    """Return cookie max-age in seconds with sane lower bound."""
    return max(1, seconds)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set access + refresh tokens as httpOnly cookies."""
    access_seconds = settings.jwt_access_token_minutes * 60
    refresh_seconds = settings.jwt_refresh_token_days * 24 * 60 * 60
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=_cookie_max_age(access_seconds),
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=_cookie_max_age(refresh_seconds),
        path="/api/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Delete auth cookies from browser."""
    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/auth")


def _to_auth_user(user: User) -> AuthUser:
    """Map User ORM row into safe response schema."""
    return AuthUser(id=user.id, username=user.username, role=user.role)


def get_current_user(
    access_token: str | None = Cookie(default=None, alias=ACCESS_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    """Resolve current user from access token cookie."""
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    try:
        payload = decode_access_token(access_token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    user = db.get(User, int(sub))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return user


def require_admin_user(user: User = Depends(get_current_user)) -> User:
    """Require current user to have admin role."""
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return user


def require_any_role(*allowed_roles: str):
    """Build dependency function that validates current user role in allowed set."""

    normalized = {r.strip().lower() for r in allowed_roles}

    def _inner(user: User = Depends(get_current_user)) -> User:
        if user.role.strip().lower() not in normalized:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return _inner


@router.post("/login", response_model=AuthSessionResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> AuthSessionResponse:
    """Login with username/password and issue httpOnly JWT cookies."""
    user = authenticate_user(db, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sai tài khoản hoặc mật khẩu")
    access_token = create_access_token(user)
    refresh_token = issue_refresh_token(db, user)
    _set_auth_cookies(response, access_token, refresh_token)
    return AuthSessionResponse(user=_to_auth_user(user))


@router.post("/refresh", response_model=AuthSessionResponse)
def refresh_session(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
) -> AuthSessionResponse:
    """Rotate refresh token and renew access cookie."""
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    user = rotate_refresh_token(db, refresh_token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    access = create_access_token(user)
    new_refresh = issue_refresh_token(db, user)
    _set_auth_cookies(response, access, new_refresh)
    return AuthSessionResponse(user=_to_auth_user(user))


@router.post("/logout")
def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Revoke refresh token and clear cookies."""
    revoke_refresh_token(db, refresh_token)
    _clear_auth_cookies(response)
    return {"status": "ok"}


@router.get("/me", response_model=AuthSessionResponse)
def me(user: User = Depends(get_current_user)) -> AuthSessionResponse:
    """Return identity for current authenticated session."""
    return AuthSessionResponse(user=_to_auth_user(user))
