"""Additive ALTER for existing DB volumes after new columns are introduced."""

from sqlalchemy import inspect, text

from app.database import engine


def ensure_gas_schema() -> None:
    """
    Add gas-related columns when upgrading from older schemas.

    ``Base.metadata.create_all`` does not alter existing tables; this fills gaps.
    """
    insp = inspect(engine)

    def cols(table: str) -> set[str]:
        try:
            return {c["name"] for c in insp.get_columns(table)}
        except Exception:
            return set()

    dialect = engine.dialect.name
    with engine.connect() as conn:
        so = cols("sales_orders")
        if "delivery_date" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN delivery_date DATE"))
        if "store_contact" not in so:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE sales_orders ADD COLUMN store_contact TEXT"))
            else:
                conn.execute(text("ALTER TABLE sales_orders ADD COLUMN store_contact TEXT"))

        si = cols("sales_order_items")
        adds: list[tuple[str, str]] = [
            ("owner_name", "VARCHAR(255)" if dialect != "sqlite" else "TEXT"),
            ("cylinder_type", "VARCHAR(255)" if dialect != "sqlite" else "TEXT"),
            ("cylinder_serial", "VARCHAR(255)" if dialect != "sqlite" else "TEXT"),
            ("inspection_expiry", "DATE"),
            ("import_source", "TEXT"),
            ("import_date", "DATE"),
        ]
        for name, sqltype in adds:
            if name not in si:
                conn.execute(text(f"ALTER TABLE sales_order_items ADD COLUMN {name} {sqltype}"))

        users = cols("users")
        user_adds: list[tuple[str, str]] = [
            ("template_owner_name", "VARCHAR(255)" if dialect != "sqlite" else "TEXT"),
            ("template_import_source", "TEXT"),
            ("template_inspection_expiry", "DATE"),
            ("template_import_date", "DATE"),
        ]
        for name, sqltype in user_adds:
            if name not in users:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {sqltype}"))
        conn.commit()
