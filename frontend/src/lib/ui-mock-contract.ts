/**
 * Shared mock-first contract for dashboard/orders/debt/customer flows.
 */

export type OrderStatus = "draft" | "pending_approval" | "approved" | "completed" | "cancelled" | "debt_pending";
export type PaymentMode = "cash" | "partial" | "debt";
export type DebtBucket = "0-7" | "8-15" | "16-30" | "31+";
export type CustomerSegment = "new" | "returning" | "high_value";
export type ApprovalStatus = "none" | "pending" | "approved" | "rejected";

export interface MockOrder {
  id: number;
  code: string;
  customerName: string;
  phone: string;
  createdAt: string;
  totalAmount: number;
  outstandingAmount: number;
  status: OrderStatus;
  paymentMode: PaymentMode;
}

export interface MockCustomer {
  id: number;
  name: string;
  phone: string;
  segment: CustomerSegment;
  area: string;
  debtBalance: number;
  lastOrderAt: string;
}

export interface MockDebtRecord {
  id: number;
  customerId: number;
  customerName: string;
  phone: string;
  bucket: DebtBucket;
  overdueDays: number;
  balance: number;
  lastCollectedAt: string | null;
}

export interface DashboardQueueItem {
  id: string;
  label: string;
  count: number;
  route: string;
  severity: "neutral" | "warning" | "critical";
}

export interface DashboardViewModel {
  statusBreakdown: Array<{ label: string; value: number }>;
  segmentBreakdown: Array<{ label: string; value: number }>;
  debtAging: Array<{ bucket: DebtBucket; value: number }>;
  actionQueue: DashboardQueueItem[];
}

export const MOCK_ORDERS: MockOrder[] = [
  { id: 1, code: "SO-240501", customerName: "Nguyen Van A", phone: "0909000111", createdAt: "2026-05-01T09:15:00Z", totalAmount: 680000, outstandingAmount: 0, status: "completed", paymentMode: "cash" },
  { id: 2, code: "SO-240502", customerName: "Tran Thi B", phone: "0909111222", createdAt: "2026-05-02T07:55:00Z", totalAmount: 950000, outstandingAmount: 320000, status: "debt_pending", paymentMode: "partial" },
  { id: 3, code: "SO-240503", customerName: "Le Van C", phone: "0909222333", createdAt: "2026-05-03T10:40:00Z", totalAmount: 1200000, outstandingAmount: 1200000, status: "pending_approval", paymentMode: "debt" },
];

export const MOCK_CUSTOMERS: MockCustomer[] = [
  { id: 1, name: "Nguyen Van A", phone: "0909000111", segment: "returning", area: "Truong Mit", debtBalance: 0, lastOrderAt: "2026-05-01T09:15:00Z" },
  { id: 2, name: "Tran Thi B", phone: "0909111222", segment: "high_value", area: "Thuan Tan", debtBalance: 320000, lastOrderAt: "2026-05-02T07:55:00Z" },
  { id: 3, name: "Le Van C", phone: "0909222333", segment: "new", area: "Hoa Thanh", debtBalance: 1200000, lastOrderAt: "2026-05-03T10:40:00Z" },
];

export const MOCK_DEBTS: MockDebtRecord[] = [
  { id: 1, customerId: 2, customerName: "Tran Thi B", phone: "0909111222", bucket: "8-15", overdueDays: 12, balance: 320000, lastCollectedAt: "2026-04-26T08:00:00Z" },
  { id: 2, customerId: 3, customerName: "Le Van C", phone: "0909222333", bucket: "31+", overdueDays: 36, balance: 1200000, lastCollectedAt: null },
];

/**
 * Adapter from shared mock entities to dashboard presentation data.
 */
export function toDashboardViewModel(
  orders: MockOrder[] = MOCK_ORDERS,
  customers: MockCustomer[] = MOCK_CUSTOMERS,
  debts: MockDebtRecord[] = MOCK_DEBTS,
): DashboardViewModel {
  const statusCounter = new Map<string, number>();
  for (const order of orders) {
    statusCounter.set(order.status, (statusCounter.get(order.status) ?? 0) + 1);
  }
  const segmentCounter = new Map<string, number>();
  for (const customer of customers) {
    segmentCounter.set(customer.segment, (segmentCounter.get(customer.segment) ?? 0) + 1);
  }
  const agingCounter: Record<DebtBucket, number> = { "0-7": 0, "8-15": 0, "16-30": 0, "31+": 0 };
  for (const debt of debts) {
    agingCounter[debt.bucket] += debt.balance;
  }

  const pendingApproval = orders.filter((o) => o.status === "pending_approval").length;
  const debtPending = orders.filter((o) => o.status === "debt_pending").length;
  const highRiskDebt = debts.filter((d) => d.overdueDays >= 30).length;

  return {
    statusBreakdown: Array.from(statusCounter.entries()).map(([label, value]) => ({ label, value })),
    segmentBreakdown: Array.from(segmentCounter.entries()).map(([label, value]) => ({ label, value })),
    debtAging: Object.entries(agingCounter).map(([bucket, value]) => ({ bucket: bucket as DebtBucket, value })),
    actionQueue: [
      { id: "pending-approval", label: "Đơn chờ duyệt", count: pendingApproval, route: "/don-hang", severity: pendingApproval > 0 ? "warning" : "neutral" },
      { id: "debt-pending", label: "Đơn còn nợ", count: debtPending, route: "/tai-chinh-quan-tri", severity: debtPending > 0 ? "warning" : "neutral" },
      { id: "high-risk-debt", label: "Khách nợ 30+ ngày", count: highRiskDebt, route: "/tai-chinh-quan-tri", severity: highRiskDebt > 0 ? "critical" : "neutral" },
    ],
  };
}
