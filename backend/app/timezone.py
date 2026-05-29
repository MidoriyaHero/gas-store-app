"""Business calendar helpers for Vietnam (UTC+7 / Asia/Ho_Chi_Minh)."""

from datetime import date, datetime, timedelta, timezone

BUSINESS_TZ = timezone(timedelta(hours=7))


def utc_now() -> datetime:
    """Return current instant as timezone-aware UTC."""
    return datetime.now(timezone.utc)


def business_date_now() -> date:
    """Today's calendar date in UTC+7."""
    return datetime.now(BUSINESS_TZ).date()


def to_business_date(dt: datetime | None) -> date | None:
    """Map an aware or naive UTC instant to calendar date in UTC+7."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(BUSINESS_TZ).date()
