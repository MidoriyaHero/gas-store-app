/**
 * Shared UI foundation constants for responsive, accessibility, and consistent status semantics.
 */
export const UI_BREAKPOINTS = {
  mobile: 375,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

/**
 * Canonical async view states used across feature screens.
 */
export type AsyncViewState = "idle" | "loading" | "success" | "empty" | "error" | "permission-denied";

/**
 * Normalized business status for badges. Every status has text + icon + semantic color.
 */
export type BusinessStatus =
  | "ready"
  | "missing"
  | "overdue"
  | "paid"
  | "unpaid"
  | "open"
  | "in_progress"
  | "closed";

/**
 * Standard quick ranges for reporting/filter bars.
 */
export const REPORT_RANGES = [
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "90 ngày", value: "90d" },
  { label: "MTD", value: "mtd" },
] as const;
