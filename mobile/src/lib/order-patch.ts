import { enqueueMutation } from "@/sync/outbox";

/** Build full SalesOrderCreate body from cached pull JSON + field overrides. */

export type OrderFieldPatch = {
  phone?: string;
  note?: string | null;
  delivery_status?: "in_transit" | "completed";
  assigned_to_user_id?: number | null;
  borrowed_shell_units?: number;
};

/** Map cached order response to PATCH /api/orders payload. */
export function buildOrderPatchPayload(
  cached: Record<string, unknown>,
  patch: OrderFieldPatch = {},
): Record<string, unknown> {
  const items = (cached.order_items as Array<Record<string, unknown>> | undefined) ?? [];
  const lines = items.map((item) => ({
    product_id: Number(item.product_id),
    quantity: Number(item.quantity),
    owner_name: item.owner_name ?? null,
    cylinder_type: item.cylinder_type ?? null,
    cylinder_serial: item.cylinder_serial ?? null,
    inspection_expiry: item.inspection_expiry ?? null,
    import_source: item.import_source ?? null,
    import_date: item.import_date ?? null,
  }));

  const phone = patch.phone ?? String(cached.phone ?? "");
  if (!phone.trim()) {
    throw new Error("Đơn thiếu số điện thoại — không thể cập nhật");
  }
  if (lines.length === 0) {
    throw new Error("Đơn thiếu dòng hàng trong cache — đồng bộ lại");
  }

  return {
    customer_name: cached.customer_name,
    phone: phone.trim(),
    address: cached.address ?? null,
    note: patch.note !== undefined ? patch.note : (cached.note ?? null),
    delivery_date: cached.delivery_date ?? null,
    store_contact: cached.store_contact ?? null,
    vat_rate: cached.vat_rate ?? 10,
    payment_mode: cached.payment_mode ?? "cash",
    paid_amount: cached.paid_amount ?? null,
    assigned_to_user_id:
      patch.assigned_to_user_id !== undefined ? patch.assigned_to_user_id : (cached.assigned_to_user_id ?? null),
    delivery_latitude: cached.delivery_latitude ?? null,
    delivery_longitude: cached.delivery_longitude ?? null,
    delivery_status: patch.delivery_status ?? cached.delivery_status ?? "in_transit",
    borrowed_shell_units:
      patch.borrowed_shell_units !== undefined
        ? patch.borrowed_shell_units
        : Number(cached.borrowed_shell_units ?? 0),
    lines,
  };
}

/** Queue a sales_order update with a valid SalesOrderCreate-shaped payload. */
export async function enqueueSalesOrderPatch(
  order: { id: number; payloadJson: string },
  patch: OrderFieldPatch = {},
): Promise<void> {
  const cached = JSON.parse(order.payloadJson) as Record<string, unknown>;
  const payload = buildOrderPatchPayload(cached, patch);
  await enqueueMutation({
    entity: "sales_order",
    operation: "update",
    serverId: order.id,
    payload,
  });
}
