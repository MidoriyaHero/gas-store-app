"""Forward geocoding via public Nominatim (OpenStreetMap).

Nominatim usage policy requires a valid User-Agent and modest request rates
(about one request per second for bulk use). This helper is for interactive
single-user searches only.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from app.schemas import GeocodeHit


def nominatim_search(query: str, *, limit: int, user_agent: str, timeout_sec: float = 12.0) -> list[dict[str, Any]]:
    """
    Return raw Nominatim JSON objects (``lat``, ``lon``, ``display_name``, ``place_id``, …).

    Raises ``urllib.error.URLError`` on network/HTTP failures.
    """
    q = " ".join((query or "").split()).strip()
    if not q:
        return []
    cap = max(1, min(int(limit), 10))
    params = urllib.parse.urlencode({"q": q, "format": "json", "limit": str(cap)})
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "application/json", "Accept-Language": "vi,en"})
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        body = resp.read().decode("utf-8")
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def nominatim_reverse(lat: float, lng: float, *, user_agent: str, timeout_sec: float = 12.0) -> dict[str, Any] | None:
    """
    Reverse-geocode ``lat``/``lng`` to a single Nominatim feature (``display_name``, ``lat``, ``lon``, …).

    Returns ``None`` when the service has no result.
    """
    params = urllib.parse.urlencode({"lat": lat, "lon": lng, "format": "json"})
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "application/json", "Accept-Language": "vi,en"})
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        body = resp.read().decode("utf-8")
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def nominatim_row_to_geocode_hit(row: dict[str, Any], *, place_id_mode: str = "reverse") -> GeocodeHit | None:
    """
    Map one Nominatim JSON object to ``GeocodeHit`` or ``None`` when fields are unusable.

    ``place_id_mode``: ``\"reverse\"`` uses ``rev-`` prefix when ``place_id`` is missing;
    ``\"search\"`` matches forward search fallback (``type-id``).
    """
    try:
        rlat = float(row.get("lat"))
        rlng = float(row.get("lon"))
    except (TypeError, ValueError):
        return None
    addr = row.get("address")
    dn = row.get("display_name")
    if isinstance(dn, str) and dn.strip():
        label = dn.strip()[:500]
    elif isinstance(addr, dict):
        parts = [addr.get(k) for k in ("road", "suburb", "city", "state", "country") if addr.get(k)]
        label = ", ".join(str(p) for p in parts if p)[:500] or f"{rlat}, {rlng}"
    else:
        label = f"{rlat}, {rlng}"
    pid = row.get("place_id")
    osm_id = row.get("osm_id")
    osm_type = row.get("osm_type")
    if pid is not None:
        place_id = str(pid)
    elif place_id_mode == "search":
        frag = f"{osm_type or ''}-{osm_id or ''}".strip("-")
        place_id = frag if frag else "search"
    else:
        frag = f"{osm_type or ''}-{osm_id or ''}".strip("-")
        place_id = f"rev-{frag}" if frag else "rev-unknown"
    return GeocodeHit(lat=rlat, lng=rlng, display_name=label, place_id=str(place_id)[:80])
