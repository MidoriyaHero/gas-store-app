/** Mobile dashboard analytics (aligned with web dashboard-analytics). */

export type PeriodKey = "7d" | "30d" | "mtd";

export interface OrderAnalyticsRow {
  createdAt: string;
  total: string;
  borrowedShellUnits?: number | null;
}

export interface DailySeriesRow {
  dateKey: string;
  label: string;
  revenue: number;
  orderCount: number;
}

export interface RangeWindow {
  start: Date;
  end: Date;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function enumerateDays(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cur <= endDay) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Local calendar date key for grouping orders. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Day range from today for the selected period. */
export function currentWindow(period: PeriodKey, today: Date): RangeWindow {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  if (period === "7d") return { start: addDays(t, -6), end: t };
  if (period === "30d") return { start: addDays(t, -29), end: t };
  return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: t };
}

/** Previous window with equal length for delta comparison. */
export function previousWindow(period: PeriodKey, current: RangeWindow): RangeWindow {
  const dayCount = enumerateDays(current.start, current.end).length;
  if (period === "mtd") {
    const prevStart = new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1);
    return { start: prevStart, end: addDays(prevStart, dayCount - 1) };
  }
  const prevEnd = addDays(current.start, -1);
  return { start: addDays(prevEnd, -(dayCount - 1)), end: prevEnd };
}

/** Aggregate orders into daily revenue and count series. */
export function summarizeSeries(range: RangeWindow, orders: OrderAnalyticsRow[]): DailySeriesRow[] {
  const rows = enumerateDays(range.start, range.end).map((d) => ({
    dateKey: localDateKey(d),
    label: `${d.getDate()}/${d.getMonth() + 1}`,
    revenue: 0,
    orderCount: 0,
  }));
  const byDate = new Map(rows.map((row) => [row.dateKey, row]));
  for (const order of orders) {
    const key = localDateKey(new Date(order.createdAt));
    const row = byDate.get(key);
    if (!row) continue;
    row.revenue += Number(order.total || 0);
    row.orderCount += 1;
  }
  return rows;
}

/** Percent change; null when baseline is zero. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Sum revenue and order count in a window. */
export function windowTotals(range: RangeWindow, orders: OrderAnalyticsRow[]) {
  const series = summarizeSeries(range, orders);
  return {
    revenue: series.reduce((s, r) => s + r.revenue, 0),
    orderCount: series.reduce((s, r) => s + r.orderCount, 0),
    outstanding: orders
      .filter((o) => {
        const d = new Date(o.createdAt);
        return d >= range.start && d <= range.end;
      })
      .reduce((s, o) => s + (o.borrowedShellUnits ?? 0), 0),
  };
}

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  mtd: "Từ đầu tháng",
};
