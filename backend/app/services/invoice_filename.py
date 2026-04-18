"""Filename stem for per-order exports: ``TenKH-so-dien-thoai``."""

import re
from urllib.parse import quote


def invoice_filename_stem(customer_name: str, phone: str | None, fallback: str) -> str:
    """
    Build a filesystem-safe stem (no extension) from customer name and phone digits.

    Example: ``Nguyễn Văn A`` + ``0909123456`` → ``Nguyễn-Văn-A-0909123456``.
    """
    name = (customer_name or "").strip()
    if not name:
        name = fallback
    tel = "".join(c for c in ((phone or "").strip()) if c.isdigit())
    safe_name = re.sub(r'[<>:"/\\|?*\r\n]+', "", name)
    safe_name = re.sub(r"\s+", "-", safe_name.strip())
    if not safe_name:
        safe_name = fallback
    stem = f"{safe_name}-{tel}" if tel else safe_name
    return stem[:200]


def content_disposition_filename(filename: str) -> str:
    """``Content-Disposition`` with RFC 5987 ``filename*`` for Unicode names."""
    ascii_name = filename.encode("ascii", "replace").decode().replace("?", "_")
    ascii_name = ascii_name.replace('"', "_")[:120]
    if not ascii_name.strip("_"):
        ascii_name = "export"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
