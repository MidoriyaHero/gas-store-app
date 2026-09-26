"""Resolve catalog sell price from customer segment."""

from decimal import Decimal

from app.models import CustomerSegment, Product


def unit_price_for_segment(product: Product, segment: str | None) -> Decimal:
    """Wholesale/restaurant list prices; retail and unknown values use ``sell_price``."""
    retail = Decimal(str(product.sell_price or 0))
    if segment == CustomerSegment.WHOLESALE.value:
        tagged = Decimal(str(product.wholesale_price or 0))
        return tagged if tagged > 0 else retail
    if segment == CustomerSegment.RESTAURANT.value:
        tagged = Decimal(str(product.restaurant_price or 0))
        return tagged if tagged > 0 else retail
    return retail
