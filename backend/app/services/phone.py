"""Phone normalization helpers used by order and debt flows."""


def normalize_phone(raw: str) -> str:
    """Normalize phone to a compact key with optional leading plus."""
    text = raw.strip()
    if not text:
        raise ValueError("Phone is required")
    if text.startswith("+"):
        digits = "".join(ch for ch in text[1:] if ch.isdigit())
        out = f"+{digits}"
    else:
        digits = "".join(ch for ch in text if ch.isdigit())
        out = digits
    plain_len = len(out.replace("+", ""))
    if plain_len < 9 or plain_len > 15:
        raise ValueError("Phone format is invalid")
    return out
