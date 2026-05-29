import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { outbox } from "@/db/schema";
import { isTransientSyncError } from "@/lib/network";
import { newClientId } from "@/lib/ids";
import { notifyOutboxChanged } from "@/sync/sync-notify";

export type OutboxRow = typeof outbox.$inferSelect;

/** Insert one pending mutation at tail of FIFO queue. */
export async function enqueueMutation(input: {
  entity: string;
  operation: string;
  clientId?: string;
  serverId?: number;
  payload: Record<string, unknown>;
}): Promise<string> {
  const clientMutationId = newClientId();
  const now = new Date().toISOString();
  await db.insert(outbox).values({
    clientMutationId,
    entity: input.entity,
    operation: input.operation,
    clientId: input.clientId ?? null,
    serverId: input.serverId ?? null,
    payloadJson: JSON.stringify(input.payload),
    status: "pending",
    createdAt: now,
  });
  await notifyOutboxChanged();
  return clientMutationId;
}

/** Count pending + error rows for badge UI. */
export async function countPendingOutbox(): Promise<number> {
  const rows = await db.select().from(outbox);
  return rows.filter((r) => r.status === "pending" || r.status === "error").length;
}

/** List pending/error mutations for outbox screen (newest first). */
export async function listOutboxRows(): Promise<OutboxRow[]> {
  const rows = await db.select().from(outbox);
  return rows
    .filter((r) => r.status === "pending" || r.status === "error")
    .sort((a, b) => b.id - a.id);
}

/** Clear in-flight flag so FIFO can retry after crash or network drop. */
export async function releaseMutationPending(id: number): Promise<void> {
  await db.update(outbox).set({ processingAt: null }).where(eq(outbox.id, id));
}

/** Re-queue rows stuck in processing (app killed mid-push). */
export async function releaseStuckMutations(maxAgeMs = 120_000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const rows = await db.select().from(outbox).where(eq(outbox.status, "pending"));
  let released = 0;
  for (const row of rows) {
    if (!row.processingAt) {
      continue;
    }
    const at = Date.parse(row.processingAt);
    if (Number.isFinite(at) && at < cutoff) {
      await releaseMutationPending(row.id);
      released += 1;
    }
  }
  return released;
}

/** Auto-retry previous network failures when connectivity returns. */
export async function requeueTransientErrors(): Promise<number> {
  const rows = await db.select().from(outbox).where(eq(outbox.status, "error"));
  let n = 0;
  for (const row of rows) {
    if (row.lastError && isTransientSyncError(new Error(row.lastError))) {
      await retryOutboxRow(row.id);
      n += 1;
    }
  }
  return n;
}

/** Peek oldest pending mutation. */
export async function peekPendingMutation(): Promise<OutboxRow | null> {
  const rows = await db.select().from(outbox).where(eq(outbox.status, "pending"));
  rows.sort((a, b) => a.id - b.id);
  return rows[0] ?? null;
}

/** Mark row applied and remove from queue. */
export async function markMutationApplied(id: number): Promise<void> {
  await db.delete(outbox).where(eq(outbox.id, id));
  await notifyOutboxChanged();
}

/** Persist rejection for user-visible retry. */
export async function markMutationError(id: number, message: string): Promise<void> {
  await db
    .update(outbox)
    .set({ status: "error", lastError: message.slice(0, 500), processingAt: null })
    .where(eq(outbox.id, id));
}

/** Set processing timestamp to avoid double-send. */
export async function markMutationProcessing(id: number): Promise<void> {
  await db
    .update(outbox)
    .set({ processingAt: new Date().toISOString() })
    .where(eq(outbox.id, id));
}

/** Re-queue failed mutation. */
export async function retryOutboxRow(id: number): Promise<void> {
  await db
    .update(outbox)
    .set({ status: "pending", lastError: null, processingAt: null })
    .where(eq(outbox.id, id));
}

/** Drop local mutation after choosing server version. */
export async function discardOutboxRow(id: number): Promise<void> {
  await db.delete(outbox).where(eq(outbox.id, id));
  await notifyOutboxChanged();
}

/** Human label for outbox row. */
export function outboxRowLabel(row: OutboxRow): string {
  try {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    if (row.entity === "sales_order" && row.operation === "create") {
      const name = String(payload.customer_name ?? "khách");
      return `Tạo đơn · ${name}`;
    }
    if (row.entity === "sales_order" && row.operation === "update") {
      return `Cập nhật đơn #${row.serverId ?? "?"}`;
    }
    if (row.entity === "order_note") {
      return `Ghi chú ${String(payload.title ?? row.clientId ?? "")}`;
    }
    if (row.entity === "daily_cylinder_audit") {
      return `Kiểm kê ${String(payload.business_date ?? "")}`;
    }
  } catch {
    /* ignore */
  }
  return `${row.entity} · ${row.operation}`;
}
