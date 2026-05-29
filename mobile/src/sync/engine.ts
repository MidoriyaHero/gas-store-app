import { eq } from "drizzle-orm";

import { apiFetch, syncPull, syncPush } from "@/api/client";
import { SessionExpiredError } from "@/auth/session-events";
import { db } from "@/db/client";
import { orderNotes, products, salesOrders, syncMeta } from "@/db/schema";
import { isTransientSyncError } from "@/lib/network";
import {
  markMutationApplied,
  markMutationError,
  markMutationProcessing,
  peekPendingMutation,
  releaseMutationPending,
  releaseStuckMutations,
  requeueTransientErrors,
} from "@/sync/outbox";
import { notifyOutboxChanged, notifySyncComplete } from "@/sync/sync-notify";
import { uploadPendingVoiceNotes } from "@/sync/voice-upload";

let pushing = false;
let cycleRunning = false;

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map API sales_order payload into SQLite row shape. */
function salesOrderRowFromPull(d: Record<string, unknown>, updatedAt: string) {
  return {
    id: Number(d.id),
    clientId: (d.client_id as string | null) ?? null,
    orderCode: String(d.order_code),
    customerName: String(d.customer_name),
    phone: (d.phone as string | null) ?? null,
    deliveryStatus: String(d.delivery_status),
    deliveryDate: (d.delivery_date as string | null) ?? null,
    deliveryAddress: (d.address as string | null) ?? null,
    deliveryLatitude: numOrNull(d.delivery_latitude),
    deliveryLongitude: numOrNull(d.delivery_longitude),
    total: String(d.total),
    borrowedShellUnits: Number(d.borrowed_shell_units ?? 0),
    payloadJson: JSON.stringify(d),
    createdAt: String(d.created_at ?? updatedAt),
    updatedAt,
  };
}

async function getMeta(key: string): Promise<string | null> {
  const row = await db.select().from(syncMeta).where(eq(syncMeta.key, key));
  return row[0]?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const existing = await getMeta(key);
  if (existing === null) {
    await db.insert(syncMeta).values({ key, value });
  } else {
    await db.update(syncMeta).set({ value }).where(eq(syncMeta.key, key));
  }
}

/** Apply one pull delta into SQLite mirrors. */
async function applyPull(entities: string): Promise<void> {
  const cursor = (await getMeta("pull_cursor")) ?? "0";
  const body = (await syncPull(cursor, entities)) as {
    cursor: string;
    changes: Array<{
      entity: string;
      op?: string;
      server_id?: number | null;
      data?: Record<string, unknown> | null;
      updated_at: string;
    }>;
  };
  for (const ch of body.changes) {
    if (ch.entity === "sales_order" && ch.op === "delete" && ch.server_id != null) {
      await db.delete(salesOrders).where(eq(salesOrders.id, Number(ch.server_id)));
      continue;
    }
    if (ch.entity === "product") {
      const d = ch.data;
      if (!d) continue;
      await db
        .insert(products)
        .values({
          id: Number(d.id),
          name: String(d.name),
          sellPrice: String(d.sell_price),
          stockQuantity: Number(d.stock_quantity),
          updatedAt: ch.updated_at,
        })
        .onConflictDoUpdate({
          target: products.id,
          set: {
            name: String(d.name),
            sellPrice: String(d.sell_price),
            stockQuantity: Number(d.stock_quantity),
            updatedAt: ch.updated_at,
          },
        });
    }
    if (ch.entity === "sales_order") {
      const d = ch.data;
      if (!d) continue;
      const row = salesOrderRowFromPull(d, ch.updated_at);
      await db.insert(salesOrders).values(row).onConflictDoUpdate({
        target: salesOrders.id,
        set: {
          orderCode: row.orderCode,
          customerName: row.customerName,
          phone: row.phone,
          deliveryStatus: row.deliveryStatus,
          deliveryDate: row.deliveryDate,
          deliveryAddress: row.deliveryAddress,
          deliveryLatitude: row.deliveryLatitude,
          deliveryLongitude: row.deliveryLongitude,
          total: row.total,
          borrowedShellUnits: row.borrowedShellUnits,
          payloadJson: row.payloadJson,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      });
    }
    if (ch.entity === "order_note") {
      const d = ch.data;
      if (!d) continue;
      const clientId = (d.client_id as string | null) ?? `srv-${d.id}`;
      await db
        .insert(orderNotes)
        .values({
          id: Number(d.id),
          clientId,
          serverId: Number(d.id),
          title: (d.title as string | null) ?? null,
          rawText: (d.raw_text as string | null) ?? null,
          mimeType: (d.mime_type as string | null) ?? null,
          uploadStatus: "synced",
          updatedAt: ch.updated_at,
        })
        .onConflictDoUpdate({
          target: orderNotes.clientId,
          set: {
            serverId: Number(d.id),
            title: (d.title as string | null) ?? null,
            rawText: (d.raw_text as string | null) ?? null,
            uploadStatus: "synced",
            updatedAt: ch.updated_at,
          },
        });
    }
  }
  await setMeta("pull_cursor", body.cursor);
  if (entities.includes("sales_orders")) {
    try {
      await purgeStaleSalesOrders();
    } catch {
      /* Older API builds may lack /sync/sales-order-ids — pull deltas still apply. */
    }
  }
}

/** Drop local orders removed on server (covers hard-deletes before soft-delete sync). */
async function purgeStaleSalesOrders(): Promise<void> {
  const res = await apiFetch<{ ids: number[] }>("/api/sync/sales-order-ids");
  const active = new Set(res.ids ?? []);
  const local = await db.select({ id: salesOrders.id }).from(salesOrders);
  for (const row of local) {
    if (!active.has(row.id)) {
      await db.delete(salesOrders).where(eq(salesOrders.id, row.id));
    }
  }
}

/** Push oldest outbox row; single-flight mutex on client. */
async function pushOne(): Promise<boolean> {
  if (pushing) {
    return false;
  }
  const row = await peekPendingMutation();
  if (!row) {
    return false;
  }
  pushing = true;
  try {
    await markMutationProcessing(row.id);
    const result = (await syncPush({
      client_mutation_id: row.clientMutationId,
      entity: row.entity,
      operation: row.operation,
      client_id: row.clientId ?? undefined,
      server_id: row.serverId ?? undefined,
      payload: JSON.parse(row.payloadJson),
    })) as { status: string; error_message?: string };
    if (result.status === "applied") {
      await markMutationApplied(row.id);
    } else {
      await markMutationError(row.id, result.error_message ?? "rejected");
    }
    return true;
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      await releaseMutationPending(row.id);
      throw err;
    }
    const msg = err instanceof Error ? err.message : "push failed";
    if (isTransientSyncError(err)) {
      await releaseMutationPending(row.id);
    } else {
      await markMutationError(row.id, msg);
    }
    return false;
  } finally {
    pushing = false;
  }
}

/** Run push loop then pull when queue drains (no concurrent pull during push). */
export async function runSyncCycle(entities = "products,sales_orders,order_notes"): Promise<void> {
  if (cycleRunning) {
    return;
  }
  cycleRunning = true;
  try {
    await releaseStuckMutations();
    await requeueTransientErrors();
    await uploadPendingVoiceNotes();
    let again = true;
    while (again) {
      again = await pushOne();
    }
    await applyPull(entities);
    await notifyOutboxChanged();
  } finally {
    cycleRunning = false;
    notifySyncComplete();
  }
}

/** Whether sync engine is currently pushing. */
export function isSyncPushing(): boolean {
  return pushing;
}
