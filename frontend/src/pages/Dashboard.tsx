import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, DollarSign, ShoppingCart } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiGet } from "@/lib/api";
import { formatNumber, formatVND } from "@/lib/format";

type PeriodKey = "7d" | "30d" | "mtd";
type ChartMode = "revenue" | "orders";

interface OrderRow {
  total: string;
  created_at: string;
}

interface ProductRow {
  id: number;
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
  sell_price: string | number;
  cost_price?: string | number;
}

interface DailyPoint {
  dateKey: string;
  label: string;
  revenue: number;
  orderCount: number;
}

interface RangeWindow {
  start: Date;
  end: Date;
}

interface WindowMetrics {
  revenue: number;
  orderCount: number;
  aov: number;
  dailySeries: DailyPoint[];
}

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  mtd: "MTD",
};

/** ``YYYY-MM-DD`` theo local timezone để gom số liệu theo ngày hiển thị. */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Trả về bản sao Date đã được set về 00:00 local time. */
function startOfDay(input: Date): Date {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Cộng/trừ số ngày theo local timezone. */
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Sinh list ngày liên tục từ start đến end (bao gồm end). */
function enumerateDays(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Xác định khung ngày hiện tại theo period user chọn. */
function currentWindow(period: PeriodKey, today: Date): RangeWindow {
  if (period === "7d") return { start: addDays(today, -6), end: today };
  if (period === "30d") return { start: addDays(today, -29), end: today };
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
}

/** Khung so sánh kỳ trước có độ dài tương đương kỳ hiện tại. */
function previousWindow(period: PeriodKey, current: RangeWindow): RangeWindow {
  if (period === "mtd") {
    const dayCount = enumerateDays(current.start, current.end).length;
    const previousMonthStart = new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1);
    return { start: previousMonthStart, end: addDays(previousMonthStart, dayCount - 1) };
  }
  const dayCount = enumerateDays(current.start, current.end).length;
  const prevEnd = addDays(current.start, -1);
  return { start: addDays(prevEnd, -(dayCount - 1)), end: prevEnd };
}

/** Tổng hợp doanh thu/số đơn/AOV và chuỗi theo ngày từ dataset orders. */
function summarizeWindow(range: RangeWindow, orders: OrderRow[]): WindowMetrics {
  const series = enumerateDays(range.start, range.end).map((d) => ({
    dateKey: localDateKey(d),
    label: `${d.getDate()}/${d.getMonth() + 1}`,
    revenue: 0,
    orderCount: 0,
  }));
  const byDate = new Map(series.map((row) => [row.dateKey, row]));
  for (const order of orders) {
    const key = localDateKey(new Date(order.created_at));
    const row = byDate.get(key);
    if (!row) continue;
    row.revenue += Number(order.total);
    row.orderCount += 1;
  }
  const revenue = series.reduce((sum, row) => sum + row.revenue, 0);
  const orderCount = series.reduce((sum, row) => sum + row.orderCount, 0);
  return { revenue, orderCount, aov: orderCount > 0 ? revenue / orderCount : 0, dailySeries: series };
}

/** Tính phần trăm tăng/giảm; trả null khi kỳ trước bằng 0 để tránh lệch nghĩa. */
function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export default function Dashboard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [chartMode, setChartMode] = useState<ChartMode>("revenue");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ orders: OrderRow[]; products: ProductRow[] }>("/api/dashboard");
      setOrders(data.orders ?? []);
      setProducts(data.products ?? []);
    } catch (e) {
      setOrders([]);
      setProducts([]);
      setError(e instanceof Error ? e.message : "Không tải được số liệu tổng quan");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const now = startOfDay(new Date());
  const current = currentWindow(period, now);
  const previous = previousWindow(period, current);

  const currentMetrics = useMemo(() => summarizeWindow(current, orders), [current, orders]);
  const previousMetrics = useMemo(() => summarizeWindow(previous, orders), [previous, orders]);

  const revenueDelta = percentDelta(currentMetrics.revenue, previousMetrics.revenue);
  const orderDelta = percentDelta(currentMetrics.orderCount, previousMetrics.orderCount);
  const aovDelta = percentDelta(currentMetrics.aov, previousMetrics.aov);

  const bestDay = useMemo(() => {
    const candidates = currentMetrics.dailySeries.filter((d) => d.orderCount > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, row) => (row.revenue > best.revenue ? row : best));
  }, [currentMetrics.dailySeries]);

  const weakDay = useMemo(() => {
    const candidates = currentMetrics.dailySeries.filter((d) => d.orderCount > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((low, row) => (row.revenue < low.revenue ? row : low));
  }, [currentMetrics.dailySeries]);

  const inventoryInsights = useMemo(() => {
    const lowStock = products.filter((p) => p.stock_quantity <= p.low_stock_threshold);
    const outOfStock = products.filter((p) => p.stock_quantity <= 0);
    const sellValue = products.reduce((sum, p) => sum + Number(p.sell_price) * p.stock_quantity, 0);
    const costValue = products.reduce((sum, p) => sum + Number(p.cost_price ?? 0) * p.stock_quantity, 0);
    return { lowStock, outOfStock, sellValue, costValue };
  }, [products]);

  const chartInterval = Math.max(0, Math.ceil(currentMetrics.dailySeries.length / 8) - 1);

  const deltaChip = (value: number | null) => {
    if (value === null) return <span className="text-xs text-muted-foreground">Chưa đủ dữ liệu kỳ trước</span>;
    const positive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
        {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  return (
    <AppLayout
      title="Tổng quan"
      description="Bảng insight bán hàng theo 7 ngày, 30 ngày và MTD"
      actions={
        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
          Làm mới
        </Button>
      }
    >
      {error && (
        <Alert className="mb-4 border-destructive/40">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertTitle>Không tải được số liệu tổng quan</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void loadData()}>
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <TabsList className="h-11">
            <TabsTrigger value="7d">7 ngày</TabsTrigger>
            <TabsTrigger value="30d">30 ngày</TabsTrigger>
            <TabsTrigger value="mtd">MTD</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
          <TabsList className="h-11">
            <TabsTrigger value="revenue">Biểu đồ doanh thu</TabsTrigger>
            <TabsTrigger value="orders">Biểu đồ số đơn</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="p-5 shadow-card">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-8 w-36 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-4 w-32 animate-pulse rounded bg-muted" />
            </Card>
          ))
        ) : (
          <>
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Doanh thu ({PERIOD_LABEL[period]})</p>
                  <p className="mt-2 text-2xl font-semibold">{formatVND(currentMetrics.revenue)}</p>
                  {deltaChip(revenueDelta)}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Số đơn ({PERIOD_LABEL[period]})</p>
                  <p className="mt-2 text-2xl font-semibold">{formatNumber(currentMetrics.orderCount)}</p>
                  {deltaChip(orderDelta)}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">AOV ({PERIOD_LABEL[period]})</p>
                  <p className="mt-2 text-2xl font-semibold">{formatVND(currentMetrics.aov)}</p>
                  {deltaChip(aovDelta)}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">SKU sắp hết hàng</p>
                  <p className="mt-2 text-2xl font-semibold">{formatNumber(inventoryInsights.lowStock.length)}</p>
                  <span className="text-xs text-muted-foreground">{inventoryInsights.outOfStock.length} SKU đã hết</span>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">
                {chartMode === "revenue" ? "Doanh thu theo ngày" : "Số đơn theo ngày"}
              </h3>
              <p className="text-xs text-muted-foreground">Kỳ {PERIOD_LABEL[period]}</p>
            </div>
            <Badge variant="outline">Dữ liệu đơn hàng 30 ngày gần nhất</Badge>
          </div>
          <div className="h-72">
            {loading ? (
              <div className="h-full animate-pulse rounded-lg bg-muted" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={currentMetrics.dailySeries} margin={{ top: 8, right: 10, left: 0, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" interval={chartInterval} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) =>
                      chartMode === "orders"
                        ? String(v)
                        : v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}tr`
                          : v >= 1000
                            ? `${Math.round(v / 1000)}k`
                            : String(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [
                      chartMode === "orders" ? formatNumber(value) : formatVND(value),
                      chartMode === "orders" ? "Số đơn" : "Doanh thu",
                    ]}
                    labelFormatter={(label) => `Ngày ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey={chartMode === "orders" ? "orderCount" : "revenue"}
                    stroke={chartMode === "orders" ? "hsl(var(--accent-foreground))" : "hsl(var(--primary))"}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5 shadow-card">
          <h3 className="text-base font-semibold">Insight nhanh</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Ngày tốt nhất</p>
              <p className="mt-1 font-medium">{bestDay ? `Ngày ${bestDay.label}` : "Chưa có đơn"}</p>
              <p className="text-xs text-muted-foreground">{bestDay ? formatVND(bestDay.revenue) : "Không có dữ liệu"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Ngày cần chú ý</p>
              <p className="mt-1 font-medium">{weakDay ? `Ngày ${weakDay.label}` : "Chưa có đơn"}</p>
              <p className="text-xs text-muted-foreground">{weakDay ? formatVND(weakDay.revenue) : "Không có dữ liệu"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Giá trị tồn kho (giá bán)</p>
              <p className="mt-1 font-medium">{formatVND(inventoryInsights.sellValue)}</p>
              <p className="text-xs text-muted-foreground">Giá vốn ước tính: {formatVND(inventoryInsights.costValue)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Cảnh báo tồn kho</h3>
          <Link to="/kho" className="text-sm font-medium text-primary hover:underline">
            Quản lý kho →
          </Link>
        </div>
        {inventoryInsights.lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hiện chưa có sản phẩm nào dưới ngưỡng cảnh báo.</p>
        ) : (
          <ul className="space-y-2">
            {inventoryInsights.lowStock.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">Ngưỡng cảnh báo: {p.low_stock_threshold}</p>
                </div>
                <Badge variant={p.stock_quantity === 0 ? "destructive" : "secondary"}>Còn {p.stock_quantity}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}
