import type { Href } from "expo-router";

import { apiFetch, refreshSession } from "@/api/client";
import { SessionExpiredError } from "@/auth/session-events";
import { clearTokens, getAccessToken, getRefreshToken } from "@/auth/session";
import { roleFromAccessToken } from "@/lib/jwt";

type SessionRoute = "/login" | "/(admin)/(tabs)" | "/(staff)/(tabs)";

function routeForRole(role: string): SessionRoute {
  return role === "admin" ? "/(admin)/(tabs)" : "/(staff)/(tabs)";
}

/** Resolve post-launch route; refresh tokens on cold start when possible. */
export async function resolveSessionRoute(): Promise<SessionRoute> {
  const refresh = await getRefreshToken();
  if (!refresh) {
    return "/login";
  }

  await refreshSession();

  try {
    const me = await apiFetch<{ user: { role: string } }>("/api/auth/me");
    return routeForRole(me.user.role);
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      await clearTokens();
      return "/login";
    }
    const access = await getAccessToken();
    const role = access ? roleFromAccessToken(access) : null;
    if (role) {
      return routeForRole(role);
    }
    return "/login";
  }
}

/** Typed href for expo-router Redirect. */
export function sessionHref(route: SessionRoute): Href {
  return route as Href;
}
