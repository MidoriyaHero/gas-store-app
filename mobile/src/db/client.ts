import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";

import * as schema from "./schema";

const expo = openDatabaseSync("gas_store.db");

/** Shared Drizzle SQLite client. */
export const db = drizzle(expo, { schema });

const DDL = `
CREATE TABLE IF NOT EXISTS sales_orders (
  id INTEGER PRIMARY KEY,
  client_id TEXT,
  order_code TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT,
  delivery_status TEXT NOT NULL,
  delivery_date TEXT,
  delivery_address TEXT,
  delivery_latitude REAL,
  delivery_longitude REAL,
  total TEXT NOT NULL,
  borrowed_shell_units INTEGER DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sell_price TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_notes (
  id INTEGER,
  client_id TEXT PRIMARY KEY,
  server_id INTEGER,
  sales_order_id INTEGER,
  title TEXT,
  raw_text TEXT,
  voice_path TEXT,
  mime_type TEXT,
  voice_duration_sec INTEGER,
  upload_status TEXT DEFAULT 'pending',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_mutation_id TEXT NOT NULL UNIQUE,
  entity TEXT NOT NULL,
  operation TEXT NOT NULL,
  client_id TEXT,
  server_id INTEGER,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  processing_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Add column when upgrading older local DB files. */
function ensureColumn(table: string, column: string, definition: string): void {
  const cols = expo.getAllSync(`PRAGMA table_info(${table})`) as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    expo.execSync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

/** Create local tables on first launch. */
export function migrateLocalDb(): void {
  expo.execSync(DDL);
  ensureColumn("order_notes", "sales_order_id", "sales_order_id INTEGER");
  ensureColumn("sales_orders", "delivery_address", "delivery_address TEXT");
  ensureColumn("sales_orders", "delivery_latitude", "delivery_latitude REAL");
  ensureColumn("sales_orders", "delivery_longitude", "delivery_longitude REAL");
  ensureColumn("sales_orders", "created_at", "created_at TEXT");
  ensureColumn("order_notes", "voice_duration_sec", "voice_duration_sec INTEGER");
  ensureColumn("order_notes", "audio_url", "audio_url TEXT");
  backfillSalesOrderCreatedAt();
}

/** Backfill created_at from payload or updated_at for upgraded DBs. */
function backfillSalesOrderCreatedAt(): void {
  const rows = expo.getAllSync("SELECT id, payload_json, updated_at, created_at FROM sales_orders") as {
    id: number;
    payload_json: string;
    updated_at: string;
    created_at: string | null;
  }[];
  for (const row of rows) {
    if (row.created_at) continue;
    let created = row.updated_at;
    try {
      const payload = JSON.parse(row.payload_json) as { created_at?: string };
      if (payload.created_at) created = payload.created_at;
    } catch {
      /* keep updated_at fallback */
    }
    expo.runSync("UPDATE sales_orders SET created_at = ? WHERE id = ?", created, row.id);
  }
}
