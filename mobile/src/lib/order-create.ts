import { cylinderTypeFromProductName, DEFAULT_OWNER, type CylinderLineDefaults } from "@/lib/cylinder-template";

export const DEFAULT_STORE_CONTACT = "Gas Huy Hoàng";

export type CreateCartLine = {
  lineKey: string;
  product_id: number;
  name: string;
  unit_price: number;
  quantity: number;
  owner_name: string;
  cylinder_type: string;
  cylinder_serial: string;
  inspection_expiry: string;
  import_date: string;
};

export type CreateOrderForm = {
  customerName: string;
  phone: string;
  address: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  note: string;
  deliveryDate: string;
  assignedToUserId: string;
  paymentMode: "cash" | "debt" | "partial";
  paidAmount: number;
  vatRate: number;
  borrowedShellUnits: number;
};

/** Order totals for preview and payload paid_amount. */
export function computeOrderTotals(
  cart: CreateCartLine[],
  vatRate: number,
  paymentMode: CreateOrderForm["paymentMode"],
  paidAmount: number,
) {
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const vatAmount = Math.round((subtotal * vatRate) / 100);
  const total = subtotal + vatAmount;
  const paidForPayload =
    paymentMode === "cash" ? total : paymentMode === "debt" ? 0 : Math.max(0, paidAmount);
  const outstanding = total - paidForPayload;
  return { subtotal, vatAmount, total, paidForPayload, outstanding };
}

/** Build SalesOrderCreate body for POST /api/orders or sync push. */
export function buildCreateOrderPayload(form: CreateOrderForm, cart: CreateCartLine[]) {
  const { paidForPayload } = computeOrderTotals(cart, form.vatRate, form.paymentMode, form.paidAmount);
  return {
    customer_name: form.customerName.trim(),
    phone: form.phone.trim(),
    address: form.address.trim() || null,
    note: form.note.trim() || null,
    delivery_date: form.deliveryDate || null,
    store_contact: DEFAULT_STORE_CONTACT,
    vat_rate: form.vatRate,
    payment_mode: form.paymentMode,
    paid_amount: paidForPayload,
    assigned_to_user_id: form.assignedToUserId ? Number(form.assignedToUserId) : null,
    delivery_latitude: form.deliveryLatitude,
    delivery_longitude: form.deliveryLongitude,
    delivery_status: "in_transit" as const,
    borrowed_shell_units: form.borrowedShellUnits,
    lines: cart.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      owner_name: i.owner_name.trim() || DEFAULT_OWNER,
      cylinder_type: i.cylinder_type.trim() || cylinderTypeFromProductName(i.name),
      cylinder_serial: i.cylinder_serial.trim() || null,
      inspection_expiry: i.inspection_expiry || null,
      import_source: null,
      import_date: i.import_date || null,
    })),
  };
}

/** New cart line with product + template defaults. */
export function newCartLine(
  product: { id: number; name: string; sellPrice: string },
  quantity: number,
  defaults: CylinderLineDefaults,
): CreateCartLine {
  return {
    lineKey: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    product_id: product.id,
    name: product.name,
    unit_price: Number(product.sellPrice.replace(/[^\d.-]/g, "") || 0),
    quantity,
    owner_name: defaults.owner_name,
    cylinder_type: cylinderTypeFromProductName(product.name),
    cylinder_serial: "",
    inspection_expiry: defaults.inspection_expiry,
    import_date: defaults.import_date,
  };
}
