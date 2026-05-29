/** Fields used for client-side order search on cached SQLite rows. */
export type OrderSearchFields = {
  orderCode: string;
  customerName: string;
  phone?: string | null;
};

/**
 * Return true when ``order`` matches a trimmed search query on code, customer name, or phone.
 */
export function orderMatchesSearch(order: OrderSearchFields, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return (
    order.orderCode.toLowerCase().includes(term) ||
    order.customerName.toLowerCase().includes(term) ||
    (order.phone ?? "").includes(term)
  );
}

/** Sort orders by ``updatedAt`` descending (newest first; mobile cache has no ``createdAt``). */
export function sortOrdersNewestFirst<T extends { updatedAt: string }>(orders: T[]): T[] {
  return [...orders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

type AdminStatusFilter = "all" | "active" | "completed";

type AdminOrderFilterFields = OrderSearchFields & {
  updatedAt: string;
  deliveryStatus?: string | null;
};

/**
 * Filter admin order list by status chip and search query; always sorted newest first.
 */
export function filterAdminOrders<T extends AdminOrderFilterFields>(
  orders: T[],
  opts: { search?: string; status?: AdminStatusFilter },
): T[] {
  let out = sortOrdersNewestFirst(orders);
  const status = opts.status ?? "all";
  if (status === "active") out = out.filter((o) => o.deliveryStatus !== "completed");
  if (status === "completed") out = out.filter((o) => o.deliveryStatus === "completed");
  const q = opts.search ?? "";
  if (q.trim()) out = out.filter((o) => orderMatchesSearch(o, q));
  return out;
}
