"""Persist and remove voice note audio files under ``media_root``."""

from pathlib import Path

from app.config import Settings


def order_notes_voice_dir(settings: Settings) -> Path:
    """Return absolute directory for voice note blobs."""
    return Path(settings.media_root).resolve() / "order-notes"


def delete_voice_blob_if_any(settings: Settings, audio_path: str | None) -> None:
    """Remove stored audio file if path is set and exists under media root."""
    if not audio_path:
        return
    rel = audio_path.replace("\\", "/").lstrip("/")
    root = Path(settings.media_root).resolve()
    full = (root / rel).resolve()
    try:
        full.relative_to(root)
    except ValueError:
        return
    if full.is_file():
        full.unlink()


def public_audio_url(audio_path: str | None) -> str | None:
    """Build URL path served by ``StaticFiles`` mount at ``/media``."""
    if not audio_path:
        return None
    rel = audio_path.replace("\\", "/").lstrip("/")
    return f"/media/{rel}"
