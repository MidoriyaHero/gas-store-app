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
        if "created_by_user_id" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN created_by_user_id INTEGER"))
        if "payment_mode" not in so:
            default = "'cash'"
            conn.execute(text(f"ALTER TABLE sales_orders ADD COLUMN payment_mode VARCHAR(16) NOT NULL DEFAULT {default}"))
        if "paid_amount" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0"))
        if "outstanding_amount" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0"))

        table_names = set(inspect(engine).get_table_names())
        if "cylinder_templates" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE cylinder_templates (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name VARCHAR(255) NOT NULL,
                            owner_name VARCHAR(255),
                            import_source TEXT,
                            inspection_expiry DATE,
                            import_date DATE,
                            is_active BOOLEAN NOT NULL DEFAULT 1,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )

        if "order_notes" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE order_notes (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            created_by_user_id INTEGER NOT NULL,
                            title VARCHAR(255),
                            note_type VARCHAR(16) NOT NULL DEFAULT 'text',
                            raw_text TEXT,
                            structured_payload TEXT NOT NULL DEFAULT '{}',
                            status VARCHAR(32) NOT NULL DEFAULT 'draft',
                            voice_enabled_stub BOOLEAN NOT NULL DEFAULT 0,
                            parser_status VARCHAR(32) NOT NULL DEFAULT 'idle',
                            audio_path TEXT,
                            audio_duration_sec INTEGER,
                            mime_type TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE order_notes (
                            id SERIAL PRIMARY KEY,
                            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
                            title VARCHAR(255),
                            note_type VARCHAR(16) NOT NULL DEFAULT 'text',
                            raw_text TEXT,
                            structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                            status VARCHAR(32) NOT NULL DEFAULT 'draft',
                            voice_enabled_stub BOOLEAN NOT NULL DEFAULT false,
                            parser_status VARCHAR(32) NOT NULL DEFAULT 'idle',
                            audio_path VARCHAR(512),
                            audio_duration_sec INTEGER,
                            mime_type VARCHAR(128),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
        if "shift_settlements" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE shift_settlements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        shift_date DATE NOT NULL,
                        shift_label VARCHAR(64) NOT NULL DEFAULT 'ca-ngay',
                        expected_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
                        actual_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
                        delta_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
                        note TEXT,
                        created_by_user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "finance_kpi_baselines" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE finance_kpi_baselines (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        kpi_key VARCHAR(80) NOT NULL,
                        label VARCHAR(255) NOT NULL,
                        target_value VARCHAR(120) NOT NULL,
                        data_source TEXT NOT NULL,
                        period_start DATE,
                        period_end DATE,
                        measured_value NUMERIC(14,4),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "customer_journey_events" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE customer_journey_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_name VARCHAR(255) NOT NULL,
                        step_key VARCHAR(40) NOT NULL,
                        step_label VARCHAR(120) NOT NULL,
                        channel VARCHAR(40),
                        order_id INTEGER,
                        status VARCHAR(32) NOT NULL DEFAULT 'done',
                        note TEXT,
                        happened_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "complaint_tickets" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE complaint_tickets (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_name VARCHAR(255) NOT NULL,
                        issue_text TEXT NOT NULL,
                        owner_name VARCHAR(255) NOT NULL,
                        status VARCHAR(32) NOT NULL DEFAULT 'open',
                        sla_due_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "safety_checklist_runs" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE safety_checklist_runs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        run_date DATE NOT NULL,
                        shift_label VARCHAR(64) NOT NULL DEFAULT 'ca-ngay',
                        valve_ok BOOLEAN NOT NULL DEFAULT 0,
                        seal_ok BOOLEAN NOT NULL DEFAULT 0,
                        leak_ok BOOLEAN NOT NULL DEFAULT 0,
                        inspection_ok BOOLEAN NOT NULL DEFAULT 0,
                        inspection_expiry DATE,
                        completed BOOLEAN NOT NULL DEFAULT 0,
                        created_by_user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "capa_items" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE capa_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title VARCHAR(255) NOT NULL,
                        owner_name VARCHAR(255) NOT NULL,
                        detail TEXT,
                        status VARCHAR(32) NOT NULL DEFAULT 'open',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "audit_log_entries" not in table_names and dialect == "sqlite":
            conn.execute(
                text(
                    """
                    CREATE TABLE audit_log_entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        actor_user_id INTEGER,
                        action VARCHAR(80) NOT NULL,
                        target_type VARCHAR(80) NOT NULL,
                        target_id VARCHAR(80),
                        detail TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
        if "debt_accounts" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_accounts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            customer_key VARCHAR(32) NOT NULL UNIQUE,
                            customer_name VARCHAR(255) NOT NULL,
                            phone VARCHAR(32) NOT NULL,
                            current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
                            status VARCHAR(16) NOT NULL DEFAULT 'active',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_accounts (
                            id SERIAL PRIMARY KEY,
                            customer_key VARCHAR(32) NOT NULL UNIQUE,
                            customer_name VARCHAR(255) NOT NULL,
                            phone VARCHAR(32) NOT NULL,
                            current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
                            status VARCHAR(16) NOT NULL DEFAULT 'active',
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
        if "debt_ledger_entries" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_ledger_entries (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            debt_account_id INTEGER NOT NULL,
                            entry_type VARCHAR(32) NOT NULL,
                            amount_signed NUMERIC(14,2) NOT NULL,
                            note TEXT,
                            reference_type VARCHAR(64),
                            reference_id VARCHAR(80),
                            created_by_user_id INTEGER,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_ledger_entries (
                            id SERIAL PRIMARY KEY,
                            debt_account_id INTEGER NOT NULL REFERENCES debt_accounts(id),
                            entry_type VARCHAR(32) NOT NULL,
                            amount_signed NUMERIC(14,2) NOT NULL,
                            note TEXT,
                            reference_type VARCHAR(64),
                            reference_id VARCHAR(80),
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
        if "debt_payments" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_payments (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            debt_account_id INTEGER NOT NULL,
                            amount NUMERIC(14,2) NOT NULL,
                            payment_method VARCHAR(40) NOT NULL DEFAULT 'cash',
                            paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            collector_name VARCHAR(255),
                            note TEXT,
                            created_by_user_id INTEGER,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_payments (
                            id SERIAL PRIMARY KEY,
                            debt_account_id INTEGER NOT NULL REFERENCES debt_accounts(id),
                            amount NUMERIC(14,2) NOT NULL,
                            payment_method VARCHAR(40) NOT NULL DEFAULT 'cash',
                            paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            collector_name VARCHAR(255),
                            note TEXT,
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
        if "debt_write_offs" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_write_offs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            debt_account_id INTEGER NOT NULL,
                            amount NUMERIC(14,2) NOT NULL,
                            reason TEXT NOT NULL,
                            approved_by_user_id INTEGER NOT NULL,
                            created_by_user_id INTEGER,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE debt_write_offs (
                            id SERIAL PRIMARY KEY,
                            debt_account_id INTEGER NOT NULL REFERENCES debt_accounts(id),
                            amount NUMERIC(14,2) NOT NULL,
                            reason TEXT NOT NULL,
                            approved_by_user_id INTEGER NOT NULL REFERENCES users(id),
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
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

        products = cols("products")
        if products and "is_active" not in products:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))
            else:
                conn.execute(text("ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))

        on = cols("order_notes")
        if on:
            if "note_type" not in on:
                default = "'text'"
                conn.execute(text(f"ALTER TABLE order_notes ADD COLUMN note_type VARCHAR(16) NOT NULL DEFAULT {default}"))
            if "audio_path" not in on:
                conn.execute(
                    text(
                        "ALTER TABLE order_notes ADD COLUMN audio_path VARCHAR(512)"
                        if dialect != "sqlite"
                        else "ALTER TABLE order_notes ADD COLUMN audio_path TEXT"
                    )
                )
            if "audio_duration_sec" not in on:
                conn.execute(text("ALTER TABLE order_notes ADD COLUMN audio_duration_sec INTEGER"))
            if "mime_type" not in on:
                conn.execute(
                    text(
                        "ALTER TABLE order_notes ADD COLUMN mime_type VARCHAR(128)"
                        if dialect != "sqlite"
                        else "ALTER TABLE order_notes ADD COLUMN mime_type TEXT"
                    )
                )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_accounts_balance ON debt_accounts(current_balance)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_accounts_status ON debt_accounts(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_ledger_account ON debt_ledger_entries(debt_account_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_ledger_created ON debt_ledger_entries(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_ledger_type ON debt_ledger_entries(entry_type)"))
        conn.commit()
