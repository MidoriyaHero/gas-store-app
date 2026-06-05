import { isAccessTokenExpired } from "@/lib/jwt";

/** Hours allowed offline after the last successful online auth. */
export const OFFLINE_MAX_HOURS = 72;

export type OfflineGateKind = "full" | "restricted" | "locked";

export interface OfflineGate {
  kind: OfflineGateKind;
}

/** Decide whether a cached session may open the app without network. */
export function evaluateOfflineGate(access: string | null, lastOnlineAt: string | null): OfflineGate {
  if (!access && !lastOnlineAt) {
    return { kind: "locked" };
  }

  if (access && !isAccessTokenExpired(access)) {
    return { kind: "full" };
  }

  if (lastOnlineAt && hoursSince(lastOnlineAt) <= OFFLINE_MAX_HOURS) {
    return { kind: "restricted" };
  }

  return { kind: "locked" };
}

function hoursSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60);
}
