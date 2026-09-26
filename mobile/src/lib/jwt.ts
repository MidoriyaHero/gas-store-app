/** Decode role claim from JWT access token (routing only; signature verified by API). */
export function roleFromAccessToken(token: string): "admin" | "user" | null {
  try {
    const payload = decodeJwtPayload(token);
    if (payload.role === "admin") return "admin";
    if (payload.role === "user") return "user";
    return null;
  } catch {
    return null;
  }
}

/** True when JWT ``exp`` is in the past (or missing / unreadable). */
export function isAccessTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    if (typeof payload.exp !== "number") {
      return true;
    }
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function decodeJwtPayload(token: string): { role?: string; exp?: number } {
  const part = token.split(".")[1];
  if (!part) {
    throw new Error("Invalid JWT");
  }
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = globalThis.atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return JSON.parse(json) as { role?: string; exp?: number };
}
