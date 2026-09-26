/**
 * Customer mix tagged on sales orders for dashboard ratios.
 */

export type CustomerSegment = "wholesale" | "restaurant" | "retail";
export type CustomerSegmentBucket = CustomerSegment | "unspecified";

export const CUSTOMER_SEGMENT_OPTIONS: Array<{ value: CustomerSegment; label: string }> = [
  { value: "wholesale", label: "Đại lý sỉ" },
  { value: "restaurant", label: "Quán ăn" },
  { value: "retail", label: "Khách lẻ" },
];

export const CUSTOMER_SEGMENT_LABEL: Record<CustomerSegmentBucket, string> = {
  wholesale: "Đại lý sỉ",
  restaurant: "Quán ăn",
  retail: "Khách lẻ",
  unspecified: "Chưa phân loại",
};

/** True when the value is a persisted segment (not legacy null). */
export function isCustomerSegment(value: string | null | undefined): value is CustomerSegment {
  return value === "wholesale" || value === "restaurant" || value === "retail";
}

/** Compact digits for matching stored phones against the form input. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Whether two phone strings refer to the same customer key. */
export function phonesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}
