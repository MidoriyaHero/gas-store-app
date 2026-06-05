/**
 * Shared chart-first analytics helpers for dashboard pages.
 */

export type PeriodKey = "today" | "7d" | "30d" | "mtd";

export interface TimeOrderRow {
  created_at: string;
  total?: number | string;
  outstanding_amount?: number | string;
}

export interface DebtAccountLite {
  customer_name: string;
  current_balance: number | string;
}

export interface DailyMetricRow {
  date: string;
  revenue: number | string;
  outstanding: number | string;
  profit: number | string;
  order_count: number;
}

export interface DashboardSummaryResponse {
  range: string;
  revenue: number | string;
  outstanding: number | string;
  profit: number | string;
  order_count: number;
  series: DailyMetricRow[];
}

export interface DailySeriesRow {
  dateKey: string;
  label: string;
  revenue: number;
  orderCount: number;
  outstanding: number;
  profit: number;
}

export interface RangeWindow {
  start: Date;
  end: Date;
}

/** Map API summary range keys used by finance overview selectors. */
export function financeRangeToSummaryKey(days: string): "today" | "7d" | "30d" | "90d" | "mtd" {
  if (days === "today") return "today";
  if (days === "7") return "7d";
  if (days === "30") return "30d";
  if (days === "90") return "90d";
  return "30d";
}

/** ``YYYY-MM-DD`` key in local timezone for grouping. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Create day-level range from today by selected period. */
export function currentWindow(period: PeriodKey, today: Date): RangeWindow {
  if (period === "today") return { start: today, end: today };
  if (period === "7d") return { start: addDays(today, -6), end: today };
  if (period === "30d") return { start: addDays(today, -29), end: today };
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
}

/** Previous window with equal day count for delta comparison. */
export function previousWindow(period: PeriodKey, current: RangeWindow): RangeWindow {
  const dayCount = enumerateDays(current.start, current.end).length;
  if (period === "today") {
    const prev = addDays(current.start, -1);
    return { start: prev, end: prev };
  }
  if (period === "mtd") {
    const previousMonthStart = new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1);
    return { start: previousMonthStart, end: addDays(previousMonthStart, dayCount - 1) };
  }
  const prevEnd = addDays(current.start, -1);
  return { start: addDays(prevEnd, -(dayCount - 1)), end: prevEnd };
}

/** Convert dashboard summary series into chart rows. */
export function seriesFromSummary(rows: DailyMetricRow[]): DailySeriesRow[] {
  return rows.map((row) => {
    const d = new Date(`${row.date}T12:00:00`);
    return {
      dateKey: row.date,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      revenue: Number(row.revenue || 0),
      orderCount: row.order_count,
      outstanding: Number(row.outstanding || 0),
      profit: Number(row.profit || 0),
    };
  });
}

/** Summarize daily series with revenue, order count, and outstanding debt by day. */
export function summarizeSeries(range: RangeWindow, orders: TimeOrderRow[]): DailySeriesRow[] {
  const rows = enumerateDays(range.start, range.end).map((d) => ({
    dateKey: localDateKey(d),
    label: `${d.getDate()}/${d.getMonth() + 1}`,
    revenue: 0,
    orderCount: 0,
    outstanding: 0,
    profit: 0,
  }));
  const byDate = new Map(rows.map((row) => [row.dateKey, row]));
  for (const order of orders) {
    const key = localDateKey(new Date(order.created_at));
    const row = byDate.get(key);
    if (!row) continue;
    row.revenue += Number(order.total || 0);
    row.orderCount += 1;
    row.outstanding += Number(order.outstanding_amount || 0);
  }
  return rows;
}

/** Percentage delta; null when baseline is not positive. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Row for top-debtor bar charts; `id` present when source accounts include it (e.g. finance drill-down). */
export interface TopDebtorChartRow {
  id?: number;
  name: string;
  value: number;
}

type DebtAccountForTop = DebtAccountLite & { id?: number };

/** Build top N debtors for bar chart usage. */
export function topDebtors(accounts: DebtAccountForTop[], topN = 7): TopDebtorChartRow[] {
  return [...accounts]
    .map((a) => {
      const row: TopDebtorChartRow = { name: a.customer_name, value: Number(a.current_balance || 0) };
      if (typeof a.id === "number") row.id = a.id;
      return row;
    })
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

function enumerateDays(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
