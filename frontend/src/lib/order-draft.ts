import type { CustomerSegment } from "@/lib/customer-segment";

/** One item line the OCR model read from a handwritten slip (mirrors backend ``OrderDraftLine``). */
export interface OrderDraftLine {
  raw_text: string;
  /** Active product id or null when the model could not match the catalog. */
  product_id: number | null;
  quantity: number | null;
}

/** One order read from a handwritten order sheet (mirrors backend ``OrderDraftExtraction``). */
export interface OrderDraftExtraction {
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  delivery_date: string | null;
  customer_segment: CustomerSegment | null;
  /** Amount written on the sheet for this order (VND). */
  total_amount: string | number | null;
  debt_amount: string | number | null;
  paid_amount: string | number | null;
  borrowed_shell_units: number | null;
  lines: OrderDraftLine[];
  /** Original text of this order on the sheet (one or more lines). */
  transcript: string;
  warnings: string[];
}

/** API row from ``/api/order-drafts`` (mirrors backend ``OrderDraftResponse``). */
export interface OrderDraft {
  id: number;
  /** ``processing``: placeholder while the photo is read in the background (poll until it settles). */
  status: "processing" | "parsed" | "error" | "converted";
  image_url: string;
  extraction: OrderDraftExtraction;
  error_message: string | null;
  model_name: string | null;
  sales_order_id: number | null;
  created_by_user_id: number;
  created_at: string;
  updated_at: string | null;
}

/**
 * Map the "nợ" / "đã trả" amounts on the slip to the order form's payment mode.
 * ``debt`` is the unpaid amount of this order; it wins over ``paid`` when both are present.
 */
export function paymentFromDraft(
  total: number,
  debt: number | null,
  paid: number | null
): { mode: "cash" | "debt" | "partial"; paidAmount: number } {
  if (debt != null && debt > 0) {
    if (debt >= total) return { mode: "debt", paidAmount: 0 };
    return { mode: "partial", paidAmount: total - debt };
  }
  if (paid != null && paid < total) return { mode: "partial", paidAmount: paid };
  return { mode: "cash", paidAmount: total };
}
