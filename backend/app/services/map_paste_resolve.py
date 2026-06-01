"""Parse pasted Google Maps snippets (link, Plus Code, DMS, decimal) into WGS84.

Used by ``POST /api/geocode/from-paste`` after SSRF-safe redirect handling for
short ``maps.app.goo.gl`` / ``goo.gl`` links.
"""

from __future__ import annotations

import re
import urllib.error
import urllib.parse
import urllib.request
from urllib.parse import ParseResult, urlparse
from urllib.request import HTTPRedirectHandler, build_opener

import openlocationcode.openlocationcode as olc

# Reference for recovering short Plus Codes (store region — Tây Ninh).
_REF_LAT = 11.3182
_REF_LNG = 106.0988

_SHORTENER_HOSTS = frozenset({"goo.gl", "maps.app.goo.gl", "maps.goo.gl"})

_OLC_FULL_RE = re.compile(
    r"\b([23456789CFGHJMPQRVWX]{8,11}\+[23456789CFGHJMPQRVWX]{2,3})\b",
    re.IGNORECASE,
)
_OLC_SHORT_RE = re.compile(
    r"\b([23456789CFGHJMPQRVWX]{2,7}\+[23456789CFGHJMPQRVWX]{2,3})\b",
    re.IGNORECASE,
)

_AT_COORD_RE = re.compile(r"@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)")
_D3D_RE = re.compile(r"!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)", re.IGNORECASE)
_LL_RE = re.compile(r"[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)", re.IGNORECASE)
_Q_PAIR_RE = re.compile(r"[?&]q=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)(?:\b|&)", re.IGNORECASE)
_CENTER_RE = re.compile(r"[?&]center=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)", re.IGNORECASE)
_STATICMAP_CENTER_RE = re.compile(
    r"staticmap\?center=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)",
    re.IGNORECASE,
)

_DMS_BLOCK_RE = re.compile(
    r"""
    (?P<la_sign>-?)\s*(?P<la_d>\d+)\s*[°º]\s*
    (?P<la_m>\d+)\s*['′]\s*
    (?P<la_s>\d+(?:\.\d+)?)\s*["″]?\s*(?P<la_h>[NnSs])
    \s+
    (?P<lo_sign>-?)\s*(?P<lo_d>\d+)\s*[°º]\s*
    (?P<lo_m>\d+)\s*['′]\s*
    (?P<lo_s>\d+(?:\.\d+)?)\s*["″]?\s*(?P<lo_h>[EeWw])
    """,
    re.VERBOSE | re.IGNORECASE,
)

_DECIMAL_PAIR_RE = re.compile(
    r"^\s*(-?\d+[\.,]\d+|-?\d+)\s*[,;\s]+\s*(-?\d+[\.,]\d+|-?\d+)\s*$",
)


def _host_ok_for_redirect(p: ParseResult) -> bool:
    """Return True when ``p`` is an acceptable redirect hop for Maps paste."""
    if p.scheme not in ("http", "https"):
        return False
    host = (p.hostname or "").lower()
    if not host:
        return False
    if host in _SHORTENER_HOSTS:
        return p.scheme == "https"
    if host == "maps.google.com":
        return True
    if host in ("www.google.com", "google.com", "www.google.com.vn", "google.com.vn", "m.google.com"):
        path = (p.path or "").lower()
        if path.startswith("/maps") or "/maps/" in path or path.startswith("/dir"):
            return True
        if path.startswith("/url"):
            return True
        return False
    return False


class _MapsOnlyRedirectHandler(HTTPRedirectHandler):
    """Reject redirect targets that are not Google Maps–related."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        parsed = urlparse(newurl)
        if not _host_ok_for_redirect(parsed):
            raise urllib.error.HTTPError(newurl, 403, "redirect not allowed", hdrs=headers, fp=fp)
        return HTTPRedirectHandler.redirect_request(self, req, fp, code, msg, headers, newurl)


def follow_maps_url(url: str, *, user_agent: str, timeout_sec: float = 12.0) -> str:
    """
    Follow redirects from a pasted Maps URL and return the final URL string.

    Raises ``urllib.error.URLError`` / ``HTTPError`` on network failure or blocked redirect.
    """
    trimmed = (url or "").strip()
    parsed = urlparse(trimmed)
    if not _host_ok_for_redirect(parsed):
        raise ValueError("Chỉ hỗ trợ link Google Maps / goo.gl / maps.app.goo.gl (https)")
    opener = build_opener(_MapsOnlyRedirectHandler())
    req = urllib.request.Request(trimmed, headers={"User-Agent": user_agent})
    with opener.open(req, timeout=timeout_sec) as resp:
        final = resp.geturl()
        _ = resp.read(8192)
    fin_p = urlparse(final)
    if not _host_ok_for_redirect(fin_p):
        raise ValueError("Link sau redirect không thuộc Google Maps")
    return final


def _parse_lat_lng_groups(g1: str, g2: str) -> tuple[float, float] | None:
    """Parse two coordinate strings when both fall in valid WGS84 ranges."""
    try:
        la = float(g1.replace(",", "."))
        lo = float(g2.replace(",", "."))
    except (TypeError, ValueError):
        return None
    if -90 <= la <= 90 and -180 <= lo <= 180:
        return la, lo
    return None


def extract_lat_lng_from_maps_url(url: str) -> tuple[float, float] | None:
    """Try common Google Maps URL patterns for WGS84 decimal degrees.

    Prefer ``!3d…!4d`` (place pin) over ``@lat,lng`` (map viewport) — short links
    often expand to URLs where both appear but viewport lng/lat can be offset.
    """
    u = url.strip()
    for rx in (_D3D_RE, _AT_COORD_RE, _LL_RE, _Q_PAIR_RE, _CENTER_RE):
        m = rx.search(u)
        if not m:
            continue
        hit = _parse_lat_lng_groups(m.group(1), m.group(2))
        if hit:
            return hit
    return None


def extract_lat_lng_from_maps_html(html: str) -> tuple[float, float] | None:
    """
    Parse coordinates embedded in a Google Maps HTML page.

    Short ``maps.app.goo.gl`` links often redirect to place-only URLs without
    ``@lat,lng``; Google still exposes ``staticmap?center=…`` in ``og:*`` meta.
    """
    body = html or ""
    hit = extract_lat_lng_from_maps_url(body)
    if hit:
        return hit
    m = _STATICMAP_CENTER_RE.search(body)
    if m:
        return _parse_lat_lng_groups(m.group(1), m.group(2))
    return None


def fetch_coords_from_maps_page(url: str, *, user_agent: str, timeout_sec: float = 12.0) -> tuple[float, float] | None:
    """GET a Maps URL and parse coordinates from the HTML body (SSRF-safe host check)."""
    trimmed = (url or "").strip()
    if not trimmed or not _host_ok_for_redirect(urlparse(trimmed)):
        return None
    req = urllib.request.Request(trimmed, headers={"User-Agent": user_agent})
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            chunk = resp.read(262_144)
    except (urllib.error.URLError, OSError, ValueError):
        return None
    html = chunk.decode("utf-8", errors="replace")
    return extract_lat_lng_from_maps_html(html)


def _dms_component(deg: str, minutes: str, sec: str, hemi: str, sign_prefix: str) -> float:
    d = float(deg)
    m = float(minutes)
    s = float(sec)
    if sign_prefix.strip() == "-":
        d = -abs(d)
    v = abs(d) + m / 60.0 + s / 3600.0
    if d < 0 or hemi.upper() in ("S", "W"):
        v = -v
    return v


def parse_dms_pair(text: str) -> tuple[float, float] | None:
    """Parse a single-line ``11°12'07.6\"N 106°17'16.5\"E`` style pair."""
    m = _DMS_BLOCK_RE.search((text or "").strip())
    if not m:
        return None
    try:
        la = _dms_component(
            m.group("la_d"),
            m.group("la_m"),
            m.group("la_s"),
            m.group("la_h"),
            m.group("la_sign") or "",
        )
        lo = _dms_component(
            m.group("lo_d"),
            m.group("lo_m"),
            m.group("lo_s"),
            m.group("lo_h"),
            m.group("lo_sign") or "",
        )
    except (TypeError, ValueError, IndexError):
        return None
    if -90 <= la <= 90 and -180 <= lo <= 180:
        return la, lo
    return None


def parse_decimal_pair_line(text: str) -> tuple[float, float] | None:
    """Parse ``11.2, 106.28`` or ``11.2;106.28`` when the whole trimmed line is only that pair."""
    t = (text or "").strip()
    m = _DECIMAL_PAIR_RE.match(t)
    if not m:
        return None
    try:
        la = float(m.group(1).replace(",", "."))
        lo = float(m.group(2).replace(",", "."))
    except (TypeError, ValueError):
        return None
    if -90 <= la <= 90 and -180 <= lo <= 180:
        return la, lo
    return None


def parse_plus_code_area(text: str) -> tuple[float, float] | None:
    """Decode Open Location Code (Plus Code) substring using library + local reference."""
    raw = text or ""
    for rx in (_OLC_FULL_RE, _OLC_SHORT_RE):
        m = rx.search(raw)
        if not m:
            continue
        code = m.group(1).upper()
        try:
            if olc.isFull(code):
                area = olc.decode(code)
            elif olc.isShort(code):
                full = olc.recoverNearest(code, _REF_LAT, _REF_LNG)
                area = olc.decode(full)
            else:
                continue
        except (ValueError, KeyError, TypeError):
            continue
        la = float(area.latitudeCenter)
        lo = float(area.longitudeCenter)
        if -90 <= la <= 90 and -180 <= lo <= 180:
            return la, lo
    return None


def extract_place_query_from_maps_url(url: str) -> str | None:
    """Decode ``/maps/place/…`` slug into a human address string for Nominatim."""
    m = re.search(r"/maps/place/([^/@?]+)", url, re.IGNORECASE)
    if not m:
        return None
    slug = urllib.parse.unquote(m.group(1).replace("+", " ")).split("/data=")[0].strip()
    slug = " ".join(slug.split())
    return slug if len(slug) >= 8 else None


def place_query_variants(place_q: str) -> list[str]:
    """Try full pasted place label, then shorter suffixes (commune / province)."""
    base = " ".join((place_q or "").split()).strip()
    if not base:
        return []
    parts = [p.strip() for p in base.split(",") if p.strip()]
    variants: list[str] = [base]
    if len(parts) > 2:
        variants.append(", ".join(parts[-3:]))
    if len(parts) > 1:
        variants.append(", ".join(parts[-2:]))
    out: list[str] = []
    for v in variants:
        if v and v not in out:
            out.append(v)
    return out


def resolve_place_query_from_paste(raw: str, *, user_agent: str) -> str | None:
    """Follow a pasted Maps URL and decode the ``/place/`` label when present."""
    url = _first_url_in_text(raw)
    if not url:
        return None
    try:
        final = follow_maps_url(url, user_agent=user_agent)
    except (urllib.error.URLError, ValueError, OSError):
        final = url
    return extract_place_query_from_maps_url(final)


def _first_url_in_text(text: str) -> str | None:
    m = re.search(r"https?://[^\s<>\"']+", (text or "").strip(), re.IGNORECASE)
    return m.group(0) if m else None


def resolve_paste_to_lat_lng(raw: str, *, user_agent: str) -> tuple[float, float] | None:
    """
    Best-effort WGS84 from pasted text: URL (with redirects), DMS, decimal pair, Plus Code.

    Returns ``None`` when no coordinates could be derived (caller may try Nominatim search).
    """
    text = " ".join((raw or "").split()).strip()
    if not text:
        return None

    dec = parse_decimal_pair_line(text)
    if dec:
        return dec

    dms = parse_dms_pair(text)
    if dms:
        return dms

    olc_hit = parse_plus_code_area(text)
    if olc_hit:
        return olc_hit

    url = _first_url_in_text(text)
    if url:
        try:
            final = follow_maps_url(url, user_agent=user_agent)
        except (urllib.error.URLError, ValueError, OSError):
            final = url
        hit = extract_lat_lng_from_maps_url(final)
        if hit:
            return hit
        hit2 = extract_lat_lng_from_maps_url(url)
        if hit2:
            return hit2

    return None
