import type { Href } from "expo-router";

import { apiFetch, refreshSession } from "@/api/client";
import { evaluateOfflineGate } from "@/auth/offline-policy";
import { SessionExpiredError } from "@/auth/session-events";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getSessionProfile,
  saveSessionProfile,
  touchLastOnlineAuth,
  type SessionRole,
} from "@/auth/session";
import { roleFromAccessToken } from "@/lib/jwt";
import { isOnline } from "@/lib/network";

export type SessionRoute = "/login" | "/locked-session" | "/(admin)/(tabs)" | "/(staff)/(tabs)";

function routeForRole(role: string): SessionRoute {
  return role === "admin" ? "/(admin)/(tabs)" : "/(staff)/(tabs)";
}

function roleFromProfile(role: SessionRole | null, access: string | null): SessionRoute | null {
  if (role === "admin" || role === "user") {
    return routeForRole(role);
  }
  if (access) {
    const decoded = roleFromAccessToken(access);
    if (decoded) {
      return routeForRole(decoded);
    }
  }
  return null;
}

/** Resolve post-launch route with online refresh and offline timebox policy. */
export async function resolveSessionRoute(): Promise<SessionRoute> {
  const access = await getAccessToken();
  const refresh = await getRefreshToken();
  const profile = await getSessionProfile();

  if (!access && !refresh && !profile) {
    return "/login";
  }

  const online = await isOnline();

  if (online) {
    if (refresh) {
      try {
        const refreshed = await refreshSession();
        if (refreshed) {
          await touchLastOnlineAuth();
        }
      } catch {
        /* transient — keep cached tokens */
      }
    }

    try {
      const me = await apiFetch<{ user: { role: string; username: string } }>("/api/auth/me");
      const role: SessionRole = me.user.role === "admin" ? "admin" : "user";
      const now = new Date().toISOString();
      await saveSessionProfile({ role, username: me.user.username, lastOnlineAuthAt: now });
      return routeForRole(me.user.role);
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await clearTokens();
        return "/login";
      }
    }
  }

  const gate = evaluateOfflineGate(access, profile?.lastOnlineAuthAt ?? null);
  if (gate.kind === "locked") {
    return online ? "/login" : "/locked-session";
  }

  const route = roleFromProfile(profile?.role ?? null, access);
  if (route) {
    return route;
  }

  return online ? "/login" : "/locked-session";
}

/** Typed href for expo-router Redirect. */
export function sessionHref(route: SessionRoute): Href {
  return route as Href;
}
