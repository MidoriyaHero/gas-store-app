import { runSyncCycle } from "@/sync/engine";

/**
 * Run a manual sync cycle then reload local cache.
 * Returns an error message on failure, or null on success.
 */
export async function manualSyncAndReload(reloadFn: () => Promise<void>): Promise<string | null> {
  try {
    await runSyncCycle();
    await reloadFn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Đồng bộ thất bại";
  }
}
