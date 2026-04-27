"""Rule-based parser stub for order notes until STT + LLM is integrated."""

from decimal import Decimal, InvalidOperation

from app.schemas import OrderNoteLinePayload, OrderNoteStructuredPayload


def parse_raw_note_stub(raw_text: str | None) -> OrderNoteStructuredPayload:
    """
    Convert raw text into a structured payload using a deterministic placeholder parser.

    Expected line format:
    ``product_name | quantity | unit_price | note``
    """
    if not raw_text or not raw_text.strip():
        return OrderNoteStructuredPayload()

    items: list[OrderNoteLinePayload] = []
    for line in raw_text.splitlines():
        src = line.strip()
        if not src:
            continue
        parts = [p.strip() for p in src.split("|")]
        if len(parts) < 2:
            continue
        product_name = parts[0]
        try:
            quantity = int(parts[1])
        except ValueError:
            continue
        unit_price = None
        if len(parts) >= 3 and parts[2]:
            try:
                unit_price = Decimal(parts[2].replace(",", ""))
            except (InvalidOperation, ValueError):
                unit_price = None
        note = parts[3] if len(parts) >= 4 and parts[3] else None
        items.append(
            OrderNoteLinePayload(
                product_name=product_name,
                quantity=max(1, quantity),
                unit_price=unit_price,
                note=note,
            )
        )
    return OrderNoteStructuredPayload(items=items)
