import type { NetInfoState } from "@react-native-community/netinfo";
import NetInfo from "@react-native-community/netinfo";

/** Best-effort online check; null isInternetReachable is treated as reachable on Android. */
export function networkIsOnline(state: NetInfoState): boolean {
  if (!state.isConnected) {
    return false;
  }
  if (state.isInternetReachable === false) {
    return false;
  }
  return true;
}

/** WiFi / mobile data / ethernet — skip offline-only transports. */
export function isSyncEligible(state: NetInfoState): boolean {
  if (!networkIsOnline(state)) {
    return false;
  }
  return state.type === "wifi" || state.type === "cellular" || state.type === "ethernet" || state.type === "unknown";
}

/** True when device can reach API (best-effort). */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return isSyncEligible(state);
}

/** True when failure looks transient (network/server blip), not business rejection. */
export function isTransientSyncError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Session expired|401|403|Forbidden|Not your order|rejected|validation|Only admin/i.test(msg)) {
    return false;
  }
  return /network|fetch|timeout|ECONNREFUSED|ENOTFOUND|Failed to fetch|Network request failed|502|503|504|HTTP 5/i.test(msg);
}
