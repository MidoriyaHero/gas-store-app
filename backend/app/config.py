"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the API server and database."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Gas Huy Hoàng API"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gas_store"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8686,http://127.0.0.1:8686,"
        "http://localhost:8081,http://127.0.0.1:8081"
    )
    jwt_secret_key: str = "change-this-jwt-secret"
    jwt_access_token_minutes: int = 60 * 24 * 7
    jwt_refresh_token_days: int = 3650
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    seed_admin_username: str = ""
    seed_admin_password: str = ""
    media_root: str = "data/media"
    order_note_audio_max_bytes: int = 20 * 1024 * 1024
    nominatim_user_agent: str = "GasStoreApp/1.0 (internal geocode; contact: admin@localhost)"
    ocr_llm_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: str = ""
    #: Comma-separated; first = primary, rest = OpenRouter fallbacks (sent as ``models`` array).
    ocr_llm_models: str = (
        "nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free"
    )
    #: OCR runs in a background task (a full page takes ~2 min on free models), so this is not bound by proxy timeouts.
    ocr_llm_timeout_sec: float = 300.0
    order_draft_image_max_bytes: int = 10 * 1024 * 1024


def get_settings() -> Settings:
    """Return a cached settings instance (FastAPI Depends can call this)."""
    return Settings()
