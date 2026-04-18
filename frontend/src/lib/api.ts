/**
 * HTTP helpers for the FastAPI backend (`/api/*`).
 * Dev: Vite proxies `/api` → uvicorn. Production: nginx proxies the same path.
 */
const prefix = import.meta.env.VITE_API_BASE ?? "";

/**
 * Build an absolute URL for file downloads (CSV/HTML) used with ``<a href>`` or ``download``.
 */
export function apiExportPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${p}`;
}

async function errorBody(r: Response): Promise<string> {
  try {
    const j = await r.json();
    const d = j?.detail;
    return typeof d === "string" ? d : JSON.stringify(d ?? j);
  } catch {
    return await r.text();
  }
}

/**
 * Perform fetch with cookie credentials and one-time refresh retry on ``401``.
 */
async function request(path: string, init?: RequestInit, canRetry = true): Promise<Response> {
  const r = await fetch(`${prefix}${path}`, {
    credentials: "include",
    ...init,
  });
  if (r.status !== 401 || !canRetry || path.startsWith("/api/auth/")) return r;
  const refresh = await fetch(`${prefix}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!refresh.ok) return r;
  return request(path, init, false);
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await request(path);
  if (!r.ok) throw new Error(await errorBody(r));
  return r.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await errorBody(r));
  return r.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await errorBody(r));
  return r.json();
}

export async function apiDelete(path: string): Promise<void> {
  const r = await request(path, { method: "DELETE" });
  if (!r.ok) throw new Error(await errorBody(r));
}
