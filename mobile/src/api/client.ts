import { API_BASE_URL } from "@/config";
import { getAccessToken } from "@/auth/session";
import { SessionExpiredError, notifySessionExpired } from "@/auth/session-events";
import { clearTokens, getRefreshToken, saveTokens } from "@/auth/session";

type JsonBody = Record<string, unknown>;

/** Rotate refresh token and persist new pair. */
export async function refreshSession(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) {
    return false;
  }
  const res = await fetch(`${API_BASE_URL}/api/auth/mobile/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    await clearTokens();
    return false;
  }
  const body = (await res.json()) as { access_token: string; refresh_token: string };
  await saveTokens(body.access_token, body.refresh_token);
  return true;
}

/** Minimal fetch wrapper with Bearer auth and JSON helpers. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch(path, init);
    }
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Mobile login; stores tokens on success. */
export async function mobileLogin(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login failed (${res.status})`);
  }
  const body = (await res.json()) as { access_token: string; refresh_token: string };
  await saveTokens(body.access_token, body.refresh_token);
}

/** POST one sync mutation. */
export async function syncPush(mutation: JsonBody): Promise<JsonBody> {
  return apiFetch("/api/sync/push", { method: "POST", body: JSON.stringify(mutation) });
}

/** GET sync pull delta. */
export async function syncPull(cursor: string | null, entities: string): Promise<JsonBody> {
  const q = new URLSearchParams({ entities });
  if (cursor) {
    q.set("cursor", cursor);
  }
  return apiFetch(`/api/sync/pull?${q.toString()}`);
}

/** Upload recorded voice note (multipart). */
export async function uploadVoiceOrderNote(
  fileUri: string,
  mimeType = "audio/mp4",
  durationSec?: number,
): Promise<{ id: number; client_id?: string | null; audio_url?: string | null }> {
  const token = await getAccessToken();
  if (!token) {
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  const form = new FormData();
  form.append("file", {
    uri: fileUri,
    name: "recording.m4a",
    type: mimeType,
  } as unknown as Blob);
  if (durationSec != null && durationSec > 0) {
    form.append("duration_sec", String(Math.round(durationSec)));
  }
  const res = await fetch(`${API_BASE_URL}/api/order-notes/voice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return uploadVoiceOrderNote(fileUri, mimeType, durationSec);
    }
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { id: number; client_id?: string | null; audio_url?: string | null };
  return body;
}

/** Admin debt accounts list. */
export async function fetchDebtAccounts(): Promise<
  Array<{ id: number; customer_name: string; phone: string; current_balance: string; status: string }>
> {
  return apiFetch("/api/debt-accounts?status=all&limit=100");
}

/** Admin users list. */
export async function fetchUsers(): Promise<Array<{ id: number; username: string; role: string; is_active: boolean }>> {
  return apiFetch("/api/users");
}

/** Current authenticated user profile. */
export async function fetchCurrentUser(): Promise<{
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}> {
  const res = await apiFetch<{ user: { id: number; username: string; role: string; is_active: boolean } }>("/api/auth/me");
  return res.user;
}

/** PATCH admin order (full SalesOrderCreate body). */
export async function patchOrder(orderId: number, payload: JsonBody): Promise<JsonBody> {
  return apiFetch(`/api/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export type DailyCylinderAuditPayload = {
  record: {
    morning_full: number;
    morning_shell: number;
    import_full: number;
    supplier_shell_units: number;
    evening_full: number;
    evening_shell: number;
    note: string | null;
  } | null;
  computed: {
    delivered_full: number;
    borrowed_shell_total: number;
    returned_shells_debt: number;
    expected_evening_full: number;
    expected_evening_shell: number;
    variance_full: number | null;
    variance_shell: number | null;
  };
};

/** Load daily cylinder audit for one business date. */
export async function fetchDailyCylinderAudit(auditDate: string): Promise<DailyCylinderAuditPayload> {
  return apiFetch(`/api/operations/daily-cylinder-audit?audit_date=${encodeURIComponent(auditDate)}`);
}

/** Upsert daily cylinder audit (online). */
export async function putDailyCylinderAudit(
  businessDate: string,
  payload: JsonBody,
): Promise<DailyCylinderAuditPayload> {
  return apiFetch(`/api/operations/daily-cylinder-audit/${businessDate}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Record debt collection payment. */
export async function createDebtPayment(payload: {
  debt_account_id: number;
  amount: string;
  payment_method?: string;
  returned_shell_units?: number;
  note?: string | null;
}): Promise<JsonBody> {
  return apiFetch("/api/debt-payments", { method: "POST", body: JSON.stringify(payload) });
}

/** Admin create sales order (online). */
export async function createOrder(payload: JsonBody): Promise<{ id: number; order_code: string }> {
  return apiFetch("/api/orders", { method: "POST", body: JSON.stringify(payload) });
}

/** Cylinder field presets for order lines. */
export async function fetchCylinderTemplates(): Promise<
  Array<{
    id: number;
    name: string;
    owner_name: string | null;
    import_source: string | null;
    inspection_expiry: string | null;
    import_date: string | null;
    is_active: boolean;
  }>
> {
  return apiFetch("/api/cylinder-templates?active_only=true");
}

/** Forward geocode search (Nominatim proxy). */
export async function geocodeSearch(q: string, limit = 6): Promise<
  Array<{ lat: number; lng: number; display_name: string; place_id: string }>
> {
  const res = await apiFetch<{ items: Array<{ lat: number; lng: number; display_name: string; place_id: string }> }>(
    `/api/geocode?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return res.items;
}

/** Reverse geocode lat/lng (Nominatim proxy). */
export async function geocodeReverse(lat: number, lng: number): Promise<{
  lat: number;
  lng: number;
  display_name: string;
  place_id: string;
}> {
  return apiFetch(`/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`);
}

/** Parse Google Maps paste (link, Plus Code, coords) into a geocode hit. */
export async function geocodeFromPaste(raw: string): Promise<{ lat: number; lng: number; display_name: string; place_id: string }> {
  return apiFetch("/api/geocode/from-paste", { method: "POST", body: JSON.stringify({ raw }) });
}

/** Debt account detail with ledger history. */
export async function fetchDebtAccountDetail(
  accountId: number,
): Promise<{
  account: { id: number; customer_name: string; phone: string; current_balance: string; status: string };
  ledger: Array<{
    id: number;
    entry_type: string;
    amount_signed: string;
    note: string | null;
    created_at: string;
    returned_shell_units?: number;
  }>;
}> {
  return apiFetch(`/api/debt-accounts/${accountId}?ledger_limit=80`);
}

/** Global delivery notes list. */
export async function fetchOrderNotes(allNotes = false): Promise<
  Array<{
    id: number;
    title: string | null;
    note_type: string;
    raw_text: string | null;
    audio_url: string | null;
    created_at: string;
  }>
> {
  const q = allNotes ? "?mine=false" : "";
  return apiFetch(`/api/order-notes${q}`);
}

export async function createOrderNote(rawText: string): Promise<JsonBody> {
  return apiFetch("/api/order-notes", { method: "POST", body: JSON.stringify({ raw_text: rawText }) });
}

export async function patchOrderNote(noteId: number, rawText: string): Promise<JsonBody> {
  return apiFetch(`/api/order-notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ raw_text: rawText }) });
}

export async function deleteOrderNote(noteId: number): Promise<void> {
  await apiFetch(`/api/order-notes/${noteId}`, { method: "DELETE" });
}

/** Regulatory gas ledger rows. */
export async function fetchGasLedger(): Promise<
  Array<{
    owner_name: string | null;
    cylinder_type: string | null;
    cylinder_serial: string | null;
    customer_name_and_address: string;
    delivery_date: string | null;
  }>
> {
  return apiFetch("/api/gas-ledger");
}

/** VAT tax report rows for date range. */
export async function fetchTaxReport(from: string, to: string): Promise<
  Array<{
    order_code: string;
    customer_name: string;
    subtotal: string;
    vat_amount: string;
    total: string;
    created_at: string;
  }>
> {
  return apiFetch(`/api/orders/tax-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export async function fetchProductsList(): Promise<
  Array<{ id: number; name: string; sell_price: string; stock_quantity: number; is_active: boolean }>
> {
  return apiFetch("/api/products");
}

export async function createProduct(payload: {
  name: string;
  sell_price: string;
  stock_quantity: number;
}): Promise<JsonBody> {
  return apiFetch("/api/products", { method: "POST", body: JSON.stringify(payload) });
}

export async function patchProduct(productId: number, payload: JsonBody): Promise<JsonBody> {
  return apiFetch(`/api/products/${productId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteProduct(productId: number): Promise<void> {
  await apiFetch(`/api/products/${productId}`, { method: "DELETE" });
}

export async function createStockReceipt(
  productId: number,
  quantity: number,
  note?: string,
  receiptDate?: string,
): Promise<JsonBody> {
  const date = receiptDate ?? new Date().toISOString().slice(0, 10);
  return apiFetch(`/api/products/${productId}/stock-receipts`, {
    method: "POST",
    body: JSON.stringify({ quantity, note: note ?? null, receipt_date: date }),
  });
}

export async function createUser(payload: JsonBody): Promise<JsonBody> {
  return apiFetch("/api/users", { method: "POST", body: JSON.stringify(payload) });
}

export async function patchUser(userId: number, payload: JsonBody): Promise<JsonBody> {
  return apiFetch(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteUser(userId: number): Promise<void> {
  await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
}

export async function fetchCylinderTemplatesAll(): Promise<
  Array<{
    id: number;
    name: string;
    owner_name: string | null;
    import_source: string | null;
    inspection_expiry: string | null;
    import_date: string | null;
    is_active: boolean;
  }>
> {
  return apiFetch("/api/cylinder-templates?include_inactive=true");
}

export async function createCylinderTemplate(payload: JsonBody): Promise<JsonBody> {
  return apiFetch("/api/cylinder-templates", { method: "POST", body: JSON.stringify(payload) });
}

export async function patchCylinderTemplate(templateId: number, payload: JsonBody): Promise<JsonBody> {
  return apiFetch(`/api/cylinder-templates/${templateId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteCylinderTemplate(templateId: number): Promise<void> {
  await apiFetch(`/api/cylinder-templates/${templateId}`, { method: "DELETE" });
}

export async function deleteOrder(orderId: number): Promise<void> {
  await apiFetch(`/api/orders/${orderId}`, { method: "DELETE" });
}

export async function fetchDashboard(): Promise<{
  orders: Array<{ total: string; created_at: string }>;
  products: Array<{ id: number; name: string; stock_quantity: number; sell_price: string }>;
}> {
  return apiFetch("/api/dashboard");
}

export async function fetchDeliveryDaySummary(datesCsv: string): Promise<{
  dates: string[];
  orders: unknown[];
  total_amount: string;
  total_line_quantity: number;
}> {
  return apiFetch(`/api/operations/delivery-day-summary?dates=${encodeURIComponent(datesCsv)}`);
}

export async function patchDebtPayment(paymentId: number, payload: JsonBody): Promise<JsonBody> {
  return apiFetch(`/api/debt-payments/${paymentId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteDebtPayment(paymentId: number): Promise<void> {
  await apiFetch(`/api/debt-payments/${paymentId}`, { method: "DELETE" });
}
