"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the API server and database."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Gas Huy Hoàng API"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gas_store"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8080,http://127.0.0.1:8080,"
        "http://localhost:8081,http://127.0.0.1:8081"
    )
    jwt_secret_key: str = "change-this-jwt-secret"
    jwt_access_token_minutes: int = 15
    jwt_refresh_token_days: int = 14
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    seed_admin_username: str = "admin"
    seed_admin_password: str = "admin123"
    media_root: str = "data/media"
    order_note_audio_max_bytes: int = 20 * 1024 * 1024


def get_settings() -> Settings:
    """Return a cached settings instance (FastAPI Depends can call this)."""
    return Settings()
