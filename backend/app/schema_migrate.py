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
        if "assigned_to_user_id" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN assigned_to_user_id INTEGER"))
        if "delivery_latitude" not in so:
            lat_type = "REAL" if dialect == "sqlite" else "DOUBLE PRECISION"
            conn.execute(text(f"ALTER TABLE sales_orders ADD COLUMN delivery_latitude {lat_type}"))
        if "delivery_longitude" not in so:
            lng_type = "REAL" if dialect == "sqlite" else "DOUBLE PRECISION"
            conn.execute(text(f"ALTER TABLE sales_orders ADD COLUMN delivery_longitude {lng_type}"))
        if "payment_mode" not in so:
            default = "'cash'"
            conn.execute(text(f"ALTER TABLE sales_orders ADD COLUMN payment_mode VARCHAR(16) NOT NULL DEFAULT {default}"))
        if "paid_amount" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0"))
        if "outstanding_amount" not in so:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0"))
        if "delivery_status" not in so:
            conn.execute(
                text(
                    "ALTER TABLE sales_orders ADD COLUMN delivery_status VARCHAR(24) NOT NULL DEFAULT 'in_transit'"
                )
            )
            conn.execute(text("UPDATE sales_orders SET delivery_status = 'completed'"))

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
            ("map_location", "JSONB" if dialect != "sqlite" else "TEXT"),
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
        if "stock_receipts" not in table_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE stock_receipts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            product_id INTEGER NOT NULL REFERENCES products(id),
                            receipt_date DATE NOT NULL,
                            quantity INTEGER NOT NULL,
                            receipt_kind VARCHAR(24) NOT NULL DEFAULT 'inbound',
                            note TEXT,
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE stock_receipts (
                            id SERIAL PRIMARY KEY,
                            product_id INTEGER NOT NULL REFERENCES products(id),
                            receipt_date DATE NOT NULL,
                            quantity INTEGER NOT NULL,
                            receipt_kind VARCHAR(24) NOT NULL DEFAULT 'inbound',
                            note TEXT,
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_stock_receipts_product ON stock_receipts(product_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_stock_receipts_date ON stock_receipts(receipt_date)"))
            n = conn.scalar(text("SELECT COUNT(*) FROM stock_receipts"))
            if n == 0:
                if dialect == "sqlite":
                    conn.execute(
                        text(
                            """
                            INSERT INTO stock_receipts (product_id, receipt_date, quantity, receipt_kind, note, created_by_user_id)
                            SELECT id, date(created_at), stock_quantity, 'opening', 'Tồn đầu kỳ (dữ liệu cũ)', NULL
                            FROM products
                            """
                        )
                    )
                else:
                    conn.execute(
                        text(
                            """
                            INSERT INTO stock_receipts (product_id, receipt_date, quantity, receipt_kind, note, created_by_user_id)
                            SELECT id, (created_at AT TIME ZONE 'UTC')::date, stock_quantity, 'opening', 'Tồn đầu kỳ (dữ liệu cũ)', NULL
                            FROM products
                            """
                        )
                    )

        names_now = set(inspect(engine).get_table_names())
        if "stock_receipts" in names_now:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_stock_receipts_product ON stock_receipts(product_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_stock_receipts_date ON stock_receipts(receipt_date)"))
        if "stock_receipts" in names_now and "products" in names_now:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        INSERT INTO stock_receipts (product_id, receipt_date, quantity, receipt_kind, note, created_by_user_id)
                        SELECT p.id, date(p.created_at), p.stock_quantity, 'opening', 'Tồn đầu kỳ (hệ thống)', NULL
                        FROM products p
                        WHERE p.stock_quantity > 0
                          AND NOT EXISTS (
                            SELECT 1 FROM stock_receipts r
                            WHERE r.product_id = p.id AND r.receipt_kind = 'opening'
                          )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        INSERT INTO stock_receipts (product_id, receipt_date, quantity, receipt_kind, note, created_by_user_id)
                        SELECT p.id, (p.created_at AT TIME ZONE 'UTC')::date, p.stock_quantity, 'opening', 'Tồn đầu kỳ (hệ thống)', NULL
                        FROM products p
                        WHERE p.stock_quantity > 0
                          AND NOT EXISTS (
                            SELECT 1 FROM stock_receipts r
                            WHERE r.product_id = p.id AND r.receipt_kind = 'opening'
                          )
                        """
                    )
                )

        snap_names = set(inspect(engine).get_table_names())
        if "cylinder_inventory_snapshots" not in snap_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE cylinder_inventory_snapshots (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            snapshot_date DATE NOT NULL,
                            full_units INTEGER NOT NULL DEFAULT 0,
                            empty_shells INTEGER NOT NULL DEFAULT 0,
                            note TEXT,
                            debt_account_id INTEGER REFERENCES debt_accounts(id),
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE cylinder_inventory_snapshots (
                            id SERIAL PRIMARY KEY,
                            snapshot_date DATE NOT NULL,
                            full_units INTEGER NOT NULL DEFAULT 0,
                            empty_shells INTEGER NOT NULL DEFAULT 0,
                            note TEXT,
                            debt_account_id INTEGER REFERENCES debt_accounts(id),
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_cylinder_snap_date ON cylinder_inventory_snapshots(snapshot_date)")
            )

        so_cols2 = cols("sales_orders")
        if "borrowed_shell_units" not in so_cols2:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN borrowed_shell_units INTEGER NOT NULL DEFAULT 0"))
        if "client_id" not in so_cols2:
            conn.execute(
                text(
                    "ALTER TABLE sales_orders ADD COLUMN client_id VARCHAR(36)"
                    if dialect != "sqlite"
                    else "ALTER TABLE sales_orders ADD COLUMN client_id TEXT"
                )
            )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_client_id ON sales_orders(client_id)"))
        if "updated_at" not in so_cols2:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE sales_orders ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"))
            else:
                conn.execute(text("ALTER TABLE sales_orders ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))
            conn.execute(text("UPDATE sales_orders SET updated_at = created_at WHERE updated_at IS NULL"))
        if "deleted_at" not in so_cols2:
            ts_type = "DATETIME" if dialect == "sqlite" else "TIMESTAMPTZ"
            conn.execute(text(f"ALTER TABLE sales_orders ADD COLUMN deleted_at {ts_type}"))

        on_cols = cols("order_notes")
        if on_cols and "client_id" not in on_cols:
            conn.execute(
                text(
                    "ALTER TABLE order_notes ADD COLUMN client_id VARCHAR(36)"
                    if dialect != "sqlite"
                    else "ALTER TABLE order_notes ADD COLUMN client_id TEXT"
                )
            )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_order_notes_client_id ON order_notes(client_id)"))

        final_names = set(inspect(engine).get_table_names())
        if "order_change_log" not in final_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE order_change_log (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            order_id INTEGER NOT NULL REFERENCES sales_orders(id),
                            changed_by_user_id INTEGER REFERENCES users(id),
                            changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            source VARCHAR(16) NOT NULL DEFAULT 'web',
                            mutation_id VARCHAR(36),
                            summary TEXT,
                            before_json TEXT,
                            after_json TEXT
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE order_change_log (
                            id SERIAL PRIMARY KEY,
                            order_id INTEGER NOT NULL REFERENCES sales_orders(id),
                            changed_by_user_id INTEGER REFERENCES users(id),
                            changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            source VARCHAR(16) NOT NULL DEFAULT 'web',
                            mutation_id VARCHAR(36),
                            summary TEXT,
                            before_json JSONB,
                            after_json JSONB
                        )
                        """
                    )
                )
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_order_change_log_order ON order_change_log(order_id)"))

        if "sync_applied_mutations" not in final_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE sync_applied_mutations (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            client_mutation_id VARCHAR(36) NOT NULL UNIQUE,
                            entity VARCHAR(64) NOT NULL,
                            server_id VARCHAR(64),
                            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE sync_applied_mutations (
                            id SERIAL PRIMARY KEY,
                            client_mutation_id VARCHAR(36) NOT NULL UNIQUE,
                            entity VARCHAR(64) NOT NULL,
                            server_id VARCHAR(64),
                            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
            conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_mut_client ON sync_applied_mutations(client_mutation_id)")
            )

        if dialect == "postgresql" and "order_change_log" in set(inspect(engine).get_table_names()):
            conn.execute(
                text(
                    """
                    ALTER TABLE order_change_log
                    DROP CONSTRAINT IF EXISTS order_change_log_order_id_fkey
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE order_change_log
                    ADD CONSTRAINT order_change_log_order_id_fkey
                    FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
                    """
                )
            )

        dp_cols = cols("debt_payments")
        if "returned_shell_units" not in dp_cols:
            conn.execute(text("ALTER TABLE debt_payments ADD COLUMN returned_shell_units INTEGER NOT NULL DEFAULT 0"))

        audit_names = set(inspect(engine).get_table_names())
        if "daily_cylinder_audit" not in audit_names:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE daily_cylinder_audit (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            business_date DATE NOT NULL UNIQUE,
                            morning_full INTEGER NOT NULL DEFAULT 0,
                            morning_shell INTEGER NOT NULL DEFAULT 0,
                            import_full INTEGER NOT NULL DEFAULT 0,
                            supplier_shell_units INTEGER NOT NULL DEFAULT 0,
                            evening_full INTEGER NOT NULL DEFAULT 0,
                            evening_shell INTEGER NOT NULL DEFAULT 0,
                            note TEXT,
                            created_by_user_id INTEGER REFERENCES users(id),
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
                        CREATE TABLE daily_cylinder_audit (
                            id SERIAL PRIMARY KEY,
                            business_date DATE NOT NULL UNIQUE,
                            morning_full INTEGER NOT NULL DEFAULT 0,
                            morning_shell INTEGER NOT NULL DEFAULT 0,
                            import_full INTEGER NOT NULL DEFAULT 0,
                            supplier_shell_units INTEGER NOT NULL DEFAULT 0,
                            evening_full INTEGER NOT NULL DEFAULT 0,
                            evening_shell INTEGER NOT NULL DEFAULT 0,
                            note TEXT,
                            created_by_user_id INTEGER REFERENCES users(id),
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_daily_cylinder_audit_date ON daily_cylinder_audit(business_date)"))

        try:
            dca_cols_now = {c["name"] for c in inspect(engine).get_columns("daily_cylinder_audit")}
        except Exception:
            dca_cols_now = set()
        if dca_cols_now and "supplier_shell_units" not in dca_cols_now:
            conn.execute(
                text("ALTER TABLE daily_cylinder_audit ADD COLUMN supplier_shell_units INTEGER NOT NULL DEFAULT 0")
            )
            conn.execute(text("UPDATE daily_cylinder_audit SET supplier_shell_units = import_full"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_accounts_balance ON debt_accounts(current_balance)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_accounts_status ON debt_accounts(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_ledger_account ON debt_ledger_entries(debt_account_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_ledger_created ON debt_ledger_entries(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_debt_ledger_type ON debt_ledger_entries(entry_type)"))
        conn.commit()
