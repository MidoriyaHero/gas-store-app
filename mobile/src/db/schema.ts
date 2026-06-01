import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Local mirror of server sales orders (subset for staff/admin offline read). */
export const salesOrders = sqliteTable("sales_orders", {
  id: integer("id").primaryKey(),
  clientId: text("client_id"),
  orderCode: text("order_code").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  deliveryStatus: text("delivery_status").notNull(),
  deliveryDate: text("delivery_date"),
  deliveryAddress: text("delivery_address"),
  deliveryLatitude: real("delivery_latitude"),
  deliveryLongitude: real("delivery_longitude"),
  total: text("total").notNull(),
  borrowedShellUnits: integer("borrowed_shell_units").default(0),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Cached products for offline order context. */
export const products = sqliteTable("products", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  sellPrice: text("sell_price").notNull(),
  stockQuantity: integer("stock_quantity").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Draft order notes stored locally before sync. */
export const orderNotes = sqliteTable("order_notes", {
  id: integer("id"),
  clientId: text("client_id").primaryKey(),
  serverId: integer("server_id"),
  salesOrderId: integer("sales_order_id"),
  title: text("title"),
  rawText: text("raw_text"),
  voicePath: text("voice_path"),
  audioUrl: text("audio_url"),
  mimeType: text("mime_type"),
  voiceDurationSec: integer("voice_duration_sec"),
  uploadStatus: text("upload_status").default("pending"),
  updatedAt: text("updated_at").notNull(),
});

/** FIFO outbox for offline mutations (single-flight push). */
export const outbox = sqliteTable("outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientMutationId: text("client_mutation_id").notNull().unique(),
  entity: text("entity").notNull(),
  operation: text("operation").notNull(),
  clientId: text("client_id"),
  serverId: integer("server_id"),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("pending"),
  lastError: text("last_error"),
  processingAt: text("processing_at"),
  createdAt: text("created_at").notNull(),
});

/** Key-value sync cursor and engine lock. */
export const syncMeta = sqliteTable("sync_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
