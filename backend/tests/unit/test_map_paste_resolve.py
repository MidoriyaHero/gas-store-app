"""Unit tests for Google Maps paste parsing (no network)."""

from app.services.map_paste_resolve import (
    extract_lat_lng_from_maps_html,
    extract_lat_lng_from_maps_url,
    extract_place_query_from_maps_url,
    parse_decimal_pair_line,
    parse_dms_pair,
    parse_plus_code_area,
    place_query_variants,
    resolve_paste_to_lat_lng,
)


def test_extract_at_coord_from_maps_url() -> None:
    """``@lat,lng`` appears in shared desktop Maps URLs without a separate pin."""
    u = "https://www.google.com/maps/place/X/@11.2036875,106.2860625,17z/data=!3m1!4b1"
    got = extract_lat_lng_from_maps_url(u)
    assert got is not None
    la, lo = got
    assert abs(la - 11.2036875) < 1e-9
    assert abs(lo - 106.2860625) < 1e-9


def test_extract_pin_over_viewport_for_maps_app_short_url() -> None:
    """``maps.app.goo.gl`` expands to URLs with both ``@`` viewport and ``!3d!4d`` pin."""
    final = (
        "https://www.google.com/maps/place/CHI+NH%C3%81NH+C%C3%94NG+TY+TNHH+TRINITY+VI%E1%BB%86T+NAM/"
        "@11.1930275,106.2915278,880m/data=!3m2!1e3!4b1!4m6!3m5!1s0x310b3947e7a03289:0xe5e8f8143e87adcc"
        "!8m2!3d11.1930275!4d106.2941027!16s%2Fg%2F11ltgnp7hw?entry=tts"
    )
    got = extract_lat_lng_from_maps_url(final)
    assert got == (11.1930275, 106.2941027)


def test_resolve_maps_app_short_url_uses_pin_coords(monkeypatch) -> None:
    """Full paste resolve for a short link uses expanded pin, not viewport ``@``."""
    final = (
        "https://www.google.com/maps/place/CHI+NH%C3%81NH+C%C3%94NG+TY+TNHH+TRINITY+VI%E1%BB%86T+NAM/"
        "@11.1930275,106.2915278,880m/data=!3m2!1e3!4b1!4m6!3m5!1s0x310b3947e7a03289:0xe5e8f8143e87adcc"
        "!8m2!3d11.1930275!4d106.2941027!16s%2Fg%2F11ltgnp7hw?entry=tts"
    )
    short = "https://maps.app.goo.gl/vGZXLRP7WFzvCPj28"

    def _fake_follow(url: str, *, user_agent: str, timeout_sec: float = 12.0) -> str:
        assert url == short
        return final

    monkeypatch.setattr(
        "app.services.map_paste_resolve.follow_maps_url",
        _fake_follow,
    )
    ua = "GasStoreTest/1.0"
    assert resolve_paste_to_lat_lng(short, user_agent=ua) == (11.1930275, 106.2941027)


def test_extract_bang_d3d() -> None:
    """Legacy ``!3d..!4d..`` embed style."""
    u = "https://www.google.com/maps?q=foo&data=!3d10.5!4d105.25"
    got = extract_lat_lng_from_maps_url(u)
    assert got == (10.5, 105.25)


def test_parse_dms_pair() -> None:
    """Degrees–minutes–seconds with Unicode degree symbols."""
    t = '11°12\'07.6"N 106°17\'16.5"E'
    got = parse_dms_pair(t)
    assert got is not None
    la, lo = got
    assert abs(la - (11 + 12 / 60 + 7.6 / 3600)) < 1e-6
    assert abs(lo - (106 + 17 / 60 + 16.5 / 3600)) < 1e-6


def test_parse_decimal_pair_line() -> None:
    """Whole-line decimal pair."""
    assert parse_decimal_pair_line("11.2 , 106.28 ") == (11.2, 106.28)
    assert parse_decimal_pair_line("11.2 abc 106.28") is None


def test_plus_code_short() -> None:
    """Short Plus Code resolves near Tây Ninh reference."""
    got = parse_plus_code_area("673P+FC Truong Mit, Tay Ninh")
    assert got is not None
    la, lo = got
    assert 10.9 < la < 11.6
    assert 105.9 < lo < 106.5


def test_extract_staticmap_center_from_html() -> None:
    """Place-only Maps pages expose coords via og staticmap preview."""
    html = (
        '<meta content="https://maps.google.com/maps/api/staticmap'
        '?center=11.1935488%2C106.2862848&amp;zoom=14&amp;size=900x900">'
    )
    got = extract_lat_lng_from_maps_html(html)
    assert got == (11.1935488, 106.2862848)


def test_extract_place_query_from_maps_url() -> None:
    """Place-only redirect URLs still expose a geocodable label in the path."""
    u = (
        "https://www.google.com/maps/place/GAS+Huy+Ho%C3%A0ng,+199+%C4%90T784,"
        "+T%C3%A2y+Ninh,+Vietnam/data=!4m2!3m1!1s0x310b39ee50e0a661:0xc0801bda119e916d"
    )
    q = extract_place_query_from_maps_url(u)
    assert q is not None
    assert "GAS Huy Hoàng" in q
    assert "Tây Ninh" in q


def test_place_query_variants_shortens_suffix() -> None:
    """Fallback tries commune/province when the full business label misses."""
    full = "GAS Huy Hoàng, 199 ĐT784, Trường Mít, Tây Ninh, Vietnam"
    variants = place_query_variants(full)
    assert variants[0] == full
    assert "Trường Mít, Tây Ninh, Vietnam" in variants


def test_resolve_paste_decimal_without_network() -> None:
    """``resolve_paste_to_lat_lng`` uses decimal path without opening URLs."""
    ua = "GasStoreTest/1.0"
    assert resolve_paste_to_lat_lng("10.5, 105.25", user_agent=ua) == (10.5, 105.25)
