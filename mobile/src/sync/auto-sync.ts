import { AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { isSyncEligible } from "@/lib/network";
import { countPendingOutbox } from "@/sync/outbox";
import { registerPendingCountRefresh } from "@/sync/sync-notify";
import { runSyncCycle } from "@/sync/engine";

const FAST_INTERVAL_MS = 30_000;
const SLOW_INTERVAL_MS = 2 * 60_000;

export type AutoSyncSnapshot = {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

type Listener = (snap: AutoSyncSnapshot) => void;

let started = false;
let syncing = false;
let online = false;
let pending = 0;
let lastSyncAt: string | null = null;
let lastError: string | null = null;
let fastTimer: ReturnType<typeof setInterval> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  const snap: AutoSyncSnapshot = { online, syncing, pending, lastSyncAt, lastError };
  listeners.forEach((fn) => fn(snap));
}

let refreshingPending = false;

async function refreshPending(): Promise<void> {
  if (refreshingPending) {
    return;
  }
  refreshingPending = true;
  try {
    pending = await countPendingOutbox();
    emit();
  } finally {
    refreshingPending = false;
  }
}

/** Re-read outbox count for banner after enqueue or direct runSyncCycle. */
export async function refreshAutoSyncPending(): Promise<void> {
  await refreshPending();
}

/** Run one sync cycle when network allows; skips if already syncing. */
export async function triggerAutoSync(_reason?: string): Promise<boolean> {
  if (syncing || !online) {
    return false;
  }
  syncing = true;
  lastError = null;
  emit();
  try {
    await runSyncCycle();
    lastSyncAt = new Date().toISOString();
    await refreshPending();
    return true;
  } catch (e) {
    lastError = e instanceof Error ? e.message : "Đồng bộ thất bại";
    await refreshPending();
    return false;
  } finally {
    syncing = false;
    emit();
  }
}

function onConnectivity(state: NetInfoState): void {
  const next = isSyncEligible(state);
  const wasOffline = !online && next;
  online = next;
  emit();
  if (wasOffline) {
    void triggerAutoSync("connectivity");
  }
}

function onAppState(next: AppStateStatus): void {
  if (next === "active" && online) {
    void triggerAutoSync("foreground");
  }
}

function startTimers(): void {
  if (fastTimer) {
    clearInterval(fastTimer);
  }
  if (slowTimer) {
    clearInterval(slowTimer);
  }
  fastTimer = setInterval(() => {
    if (online && pending > 0) {
      void triggerAutoSync("interval-pending");
    }
  }, FAST_INTERVAL_MS);
  slowTimer = setInterval(() => {
    if (online) {
      void triggerAutoSync("interval-pull");
    }
  }, SLOW_INTERVAL_MS);
}

/** Subscribe to auto-sync state (banner, outbox screen). */
export function subscribeAutoSync(listener: Listener): () => void {
  listeners.add(listener);
  listener({ online, syncing, pending, lastSyncAt, lastError });
  return () => listeners.delete(listener);
}

/** Start WiFi/cellular listeners and periodic sync — call once from root layout. */
export function startAutoSync(): () => void {
  if (started) {
    return () => undefined;
  }
  started = true;
  registerPendingCountRefresh(refreshPending);

  void NetInfo.fetch().then((state) => {
    online = isSyncEligible(state);
    emit();
    if (online) {
      void triggerAutoSync("bootstrap");
    }
  });
  void refreshPending();

  const netUnsub = NetInfo.addEventListener(onConnectivity);
  const appSub = AppState.addEventListener("change", onAppState);
  startTimers();

  return () => {
    started = false;
    netUnsub();
    appSub.remove();
    if (fastTimer) {
      clearInterval(fastTimer);
    }
    if (slowTimer) {
      clearInterval(slowTimer);
    }
    listeners.clear();
  };
}
