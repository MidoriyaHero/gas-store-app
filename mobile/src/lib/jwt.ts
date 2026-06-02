/** Decode role claim from JWT access token (routing only; signature verified by API). */
export function roleFromAccessToken(token: string): "admin" | "user" | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = globalThis.atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    const payload = JSON.parse(json) as { role?: string };
    if (payload.role === "admin") return "admin";
    if (payload.role === "user") return "user";
    return null;
  } catch {
    return null;
  }
}
