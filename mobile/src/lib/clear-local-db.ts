import { db } from "@/db/client";
import { orderNotes, outbox, products, salesOrders, syncMeta } from "@/db/schema";

/** Wipe offline cache so the next user never sees another account's SQLite rows. */
export async function clearLocalDb(): Promise<void> {
  await db.delete(salesOrders);
  await db.delete(products);
  await db.delete(orderNotes);
  await db.delete(outbox);
  await db.delete(syncMeta);
}
