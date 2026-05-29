import type { Href } from "expo-router";

import { apiFetch } from "@/api/client";
import { clearTokens, getAccessToken } from "@/auth/session";

type SessionRoute = "/login" | "/(admin)/(tabs)" | "/(staff)/(tabs)";

/** Resolve post-launch route from stored Bearer token. */
export async function resolveSessionRoute(): Promise<SessionRoute> {
  const token = await getAccessToken();
  if (!token) {
    return "/login";
  }
  try {
    const me = await apiFetch<{ user: { role: string } }>("/api/auth/me");
    return me.user.role === "admin" ? "/(admin)/(tabs)" : "/(staff)/(tabs)";
  } catch {
    await clearTokens();
    return "/login";
  }
}

/** Typed href for expo-router Redirect. */
export function sessionHref(route: SessionRoute): Href {
  return route as Href;
}
