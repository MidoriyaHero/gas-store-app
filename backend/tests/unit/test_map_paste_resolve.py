"""Unit tests for Google Maps paste parsing (no network)."""

from app.services.map_paste_resolve import (
    extract_lat_lng_from_maps_url,
    parse_decimal_pair_line,
    parse_dms_pair,
    parse_plus_code_area,
    resolve_paste_to_lat_lng,
)


def test_extract_at_coord_from_maps_url() -> None:
    """``@lat,lng`` appears in shared desktop Maps URLs."""
    u = "https://www.google.com/maps/place/X/@11.2036875,106.2860625,17z/data=!3m1!4b1"
    got = extract_lat_lng_from_maps_url(u)
    assert got is not None
    la, lo = got
    assert abs(la - 11.2036875) < 1e-9
    assert abs(lo - 106.2860625) < 1e-9


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


def test_resolve_paste_decimal_without_network() -> None:
    """``resolve_paste_to_lat_lng`` uses decimal path without opening URLs."""
    ua = "GasStoreTest/1.0"
    assert resolve_paste_to_lat_lng("10.5, 105.25", user_agent=ua) == (10.5, 105.25)
