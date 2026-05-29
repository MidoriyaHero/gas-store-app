/** Lightweight hook so engine/outbox can refresh banner without circular imports. */

type PendingRefreshFn = () => Promise<void>;
type SyncCompleteListener = () => void;

let refreshPendingCount: PendingRefreshFn | null = null;
const syncCompleteListeners = new Set<SyncCompleteListener>();

/** Register handler from auto-sync at app bootstrap. */
export function registerPendingCountRefresh(fn: PendingRefreshFn): void {
  refreshPendingCount = fn;
}

/** Subscribe to successful sync cycles — screens reload SQLite-backed lists. */
export function subscribeSyncComplete(listener: SyncCompleteListener): () => void {
  syncCompleteListeners.add(listener);
  return () => syncCompleteListeners.delete(listener);
}

/** Notify all mounted screens after ``runSyncCycle`` finishes. */
export function notifySyncComplete(): void {
  syncCompleteListeners.forEach((fn) => fn());
}

/** Notify banner after enqueue, apply, or sync cycle. */
export async function notifyOutboxChanged(): Promise<void> {
  await refreshPendingCount?.();
}
