import { clearLocalDb } from "@/lib/clear-local-db";

import { clearTokens } from "./session";

/** End session and drop all local mirrors tied to the previous user. */
export async function logoutSession(): Promise<void> {
  await clearLocalDb();
  await clearTokens();
}
