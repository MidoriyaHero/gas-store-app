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

export const CUSTOMER_SEGMENT_COLOR: Record<CustomerSegmentBucket, string> = {
  wholesale: "#1d4ed8",
  restaurant: "#b45309",
  retail: "#15803d",
  unspecified: "#6b7280",
};

/** True when the value is a persisted segment (not legacy null). */
export function isCustomerSegment(value: string | null | undefined): value is CustomerSegment {
  return value === "wholesale" || value === "restaurant" || value === "retail";
}

/** Map stored/API values onto a dashboard bucket. */
export function segmentBucket(value: string | null | undefined): CustomerSegmentBucket {
  return isCustomerSegment(value) ? value : "unspecified";
}
