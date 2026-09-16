import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, DollarSign, Scale, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { AsyncStatePanel } from "@/components/AsyncStatePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import {
  percentDelta,
  seriesFromSummary,
  topDebtors,
  type DashboardSummaryResponse,
  type DebtAccountLite,
  type PeriodKey,
} from "@/lib/dashboard-analytics";
import { formatNumber, formatVND } from "@/lib/format";
import { CUSTOMER_SEGMENT_LABEL, type CustomerSegmentBucket } from "@/lib/customer-segment";

type ChartMode = "revenue" | "units";

interface ProductRow {
  id: number;
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
  sell_price: string | number;
  cost_price?: string | number;
}

const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Hôm nay",
  "7d": "7 ngày",
  "30d": "30 ngày",
  mtd: "Từ đầu tháng",
};

const COMPARISON_LABEL: Record<PeriodKey, string> = {
  today: "so với hôm qua",
  "7d": "so với 7 ngày trước",
  "30d": "so với 30 ngày trước",
  mtd: "so với cùng kỳ tháng trước",
};

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccountLite[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [chartMode, setChartMode] = useState<ChartMode>("revenue");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bundle, accounts, summaryData] = await Promise.all([
        apiGet<{ products: ProductRow[] }>("/api/dashboard"),
        apiGet<DebtAccountLite[]>("/api/debt-accounts?status=all&limit=200"),
        apiGet<DashboardSummaryResponse>(`/api/dashboard/summary?range=${period}`),
      ]);
      setProducts(bundle.products ?? []);
      setDebtAccounts(accounts ?? []);
      setSummary(summaryData);
    } catch (e) {
      setSummary(null);
      setProducts([]);
      setDebtAccounts([]);
      setError(e instanceof Error ? e.message : "Không tải được số liệu tổng quan");
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentSeries = useMemo(
    () => (summary ? seriesFromSummary(summary.series) : []),
    [summary],
  );
  const currentMetrics = useMemo(() => {
    if (!summary) return { revenue: 0, orderCount: 0, outstanding: 0, profit: 0 };
    return {
      revenue: Number(summary.revenue || 0),
      orderCount: summary.order_count,
      outstanding: Number(summary.outstanding || 0),
      profit: Number(summary.profit || 0),
    };
  }, [summary]);

  const previousMetrics = useMemo(() => {
    const prev = summary?.previous;
    if (!prev) return { revenue: 0, profit: 0 };
    return {
      revenue: Number(prev.revenue || 0),
      profit: Number(prev.profit || 0),
    };
  }, [summary]);

  const debtTotal = useMemo(
    () => debtAccounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0),
    [debtAccounts],
  );
  const openDebtors = useMemo(
    () => debtAccounts.filter((a) => Number(a.current_balance || 0) > 0).length,
    [debtAccounts],
  );

  const deltaChip = (current: number, previous: number) => {
    if (previous <= 0 && current > 0) {
      return <span className="text-xs text-muted-foreground">Mới trong kỳ</span>;
    }
    if (previous <= 0 && current <= 0) {
      return <span className="text-xs text-muted-foreground">Không đổi</span>;
    }
    const value = percentDelta(current, previous);
    if (value === null) {
      return <span className="text-xs text-muted-foreground">Chưa đủ dữ liệu kỳ trước</span>;
    }
    const positive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
        {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(value).toFixed(1)}% {COMPARISON_LABEL[period]}
      </span>
    );
  };

  const bestDay = useMemo(() => {
    const candidates = currentSeries.filter((d) => d.orderCount > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, row) => (row.revenue > best.revenue ? row : best));
  }, [currentSeries]);

  const weakDay = useMemo(() => {
    const candidates = currentSeries.filter((d) => d.orderCount > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((low, row) => (row.revenue < low.revenue ? row : low));
  }, [currentSeries]);

  const inventoryInsights = useMemo(() => {
    const lowStock = products.filter((p) => p.stock_quantity <= p.low_stock_threshold);
    const outOfStock = products.filter((p) => p.stock_quantity <= 0);
    const sellValue = products.reduce((sum, p) => sum + Number(p.sell_price) * p.stock_quantity, 0);
    const costValue = products.reduce((sum, p) => sum + Number(p.cost_price ?? 0) * p.stock_quantity, 0);
    return { lowStock, outOfStock, sellValue, costValue };
  }, [products]);

  const chartInterval = Math.max(0, Math.ceil(currentSeries.length / 8) - 1);
  const lowStockChart = useMemo(
    () =>
      inventoryInsights.lowStock
        .slice()
        .sort((a, b) => a.stock_quantity - b.stock_quantity)
        .slice(0, 6)
        .map((p) => ({ name: p.name, stock: p.stock_quantity })),
    [inventoryInsights.lowStock],
  );
  const debtStatusChart = useMemo(() => {
    const paid = debtAccounts.filter((a) => Number(a.current_balance || 0) <= 0).length;
    const open = debtAccounts.filter((a) => Number(a.current_balance || 0) > 0).length;
    return [
      { name: "Đã trả", value: paid, color: "hsl(var(--success))" },
      { name: "Còn nợ", value: open, color: "hsl(var(--destructive))" },
    ];
  }, [debtAccounts]);
  const topDebtorData = useMemo(() => topDebtors(debtAccounts, 5), [debtAccounts]);
  const segmentChart = useMemo(() => {
    const rows = summary?.customer_segments ?? [];
    const totalOrders = rows.reduce((sum, row) => sum + row.order_count, 0);
    const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const colors: Record<CustomerSegmentBucket, string> = {
      wholesale: "hsl(var(--primary))",
      restaurant: "hsl(var(--accent-foreground))",
      retail: "hsl(var(--warning))",
      unspecified: "hsl(var(--muted-foreground))",
    };
    return rows.map((row) => ({
      segment: row.segment,
      name: CUSTOMER_SEGMENT_LABEL[row.segment],
      value: row.order_count,
      revenue: Number(row.revenue || 0),
      color: colors[row.segment],
      orderShare: totalOrders > 0 ? (row.order_count / totalOrders) * 100 : 0,
      revenueShare: totalRevenue > 0 ? (Number(row.revenue || 0) / totalRevenue) * 100 : 0,
    }));
  }, [summary]);

  return (
    <AppLayout
      title="Tổng quan"
      description="Doanh thu và lời theo kỳ đang chọn; nợ chưa thu khớp tổng Sổ nợ hiện tại."
      actions={
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-4"
          onClick={() => void loadData()}
          disabled={loading}
        >
          Làm mới
        </Button>
      }
    >
      <AsyncStatePanel
        state={error ? "error" : loading ? "loading" : (summary?.order_count ?? 0) === 0 ? "empty" : "success"}
        title={error ? "Không tải được số liệu tổng quan" : "Đang tải số liệu tổng quan"}
        description={error ?? "Chưa có đơn hàng để hiển thị dashboard chart-first."}
        onRetry={error ? () => void loadData() : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <TabsList className="h-11">
            <TabsTrigger value="today" className="min-h-11 px-4">Hôm nay</TabsTrigger>
            <TabsTrigger value="7d" className="min-h-11 px-4">7 ngày</TabsTrigger>
            <TabsTrigger value="30d" className="min-h-11 px-4">30 ngày</TabsTrigger>
            <TabsTrigger value="mtd" className="min-h-11 px-4">
              {PERIOD_LABEL.mtd}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
          <TabsList className="h-11">
            <TabsTrigger value="revenue" className="min-h-11 px-4">Biểu đồ doanh thu</TabsTrigger>
            <TabsTrigger value="units" className="min-h-11 px-4">Biểu đồ số bình gas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Doanh thu ({PERIOD_LABEL[period]})</p>
                  <p className="mt-2 text-2xl font-semibold">{formatVND(currentMetrics.revenue)}</p>
                  {deltaChip(currentMetrics.revenue, previousMetrics.revenue)}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Tiền lời ({PERIOD_LABEL[period]})</p>
                  <p className="mt-2 text-2xl font-semibold">{formatVND(currentMetrics.profit)}</p>
                  {deltaChip(currentMetrics.profit, previousMetrics.profit)}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Nợ chưa thu (Sổ nợ)</p>
                  <p className="mt-2 text-2xl font-semibold">{formatVND(debtTotal)}</p>
                  <span className="text-xs text-muted-foreground">
                    {openDebtors} khách còn nợ ·{" "}
                    <Link to="/tai-chinh-quan-tri" className="text-primary underline-offset-2 hover:underline">
                      Xem Sổ nợ
                    </Link>
                  </span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground" aria-hidden>
                  <Scale className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">
                {chartMode === "revenue" ? "Doanh thu theo ngày" : "Số bình theo ngày"}
              </h3>
              <p className="text-xs text-muted-foreground">Kỳ {PERIOD_LABEL[period]}</p>
            </div>
            <Badge variant="outline">Đơn hàng trong kỳ: {PERIOD_LABEL[period]}</Badge>
          </div>
          <figure className="h-72">
            <figcaption className="sr-only">
              {chartMode === "revenue"
                ? `Biểu đồ doanh thu theo ngày trong kỳ ${PERIOD_LABEL[period]}.`
                : `Biểu đồ số bình gas theo ngày trong kỳ ${PERIOD_LABEL[period]}.`}
            </figcaption>
            {loading ? (
              <div className="h-full animate-pulse rounded-lg bg-muted" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={currentSeries} margin={{ top: 8, right: 10, left: 0, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" interval={chartInterval} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) =>
                      chartMode === "units"
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
                      chartMode === "units" ? formatNumber(value) : formatVND(value),
                      chartMode === "units" ? "Số bình" : "Doanh thu",
                    ]}
                    labelFormatter={(label) => `Ngày ${label}`}
                  />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    name={chartMode === "units" ? "Số bình" : "Doanh thu"}
                    dataKey={chartMode === "units" ? "unitQuantity" : "revenue"}
                    stroke={chartMode === "units" ? "hsl(var(--accent-foreground))" : "hsl(var(--primary))"}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </figure>
        </Card>

        <Card className="p-5 shadow-card">
          <h3 className="text-base font-semibold">Cơ cấu trạng thái nợ</h3>
          <p className="sr-only">
            Số tài khoản nợ theo trạng thái: đã trả và còn nợ, tính trên danh sách khách hiện tại.
          </p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={debtStatusChart} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {debtStatusChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatNumber(value), "Số tài khoản"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {debtStatusChart.map((item) => (
              <div key={item.name} className="rounded border p-2">
                <p className="text-muted-foreground">{item.name}</p>
                <p className="font-semibold">{formatNumber(item.value)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5 shadow-card">
        <h3 className="text-base font-semibold">Cơ cấu tệp khách</h3>
        <p className="text-xs text-muted-foreground">
          Tỉ lệ số đơn và doanh thu theo tệp trong kỳ {PERIOD_LABEL[period]}. Đơn cũ chưa gắn tệp nằm ở Chưa phân loại.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={segmentChart} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {segmentChart.map((entry) => (
                    <Cell key={entry.segment} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatNumber(value), "Số đơn"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {segmentChart.map((item) => (
              <div key={item.segment} className="rounded border p-2">
                <p className="text-muted-foreground">{item.name}</p>
                <p className="font-semibold">
                  {formatNumber(item.value)} đơn · {item.orderShare.toFixed(0)}%
                </p>
                <p className="text-muted-foreground">
                  {formatVND(item.revenue)} · {item.revenueShare.toFixed(0)}% DT
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Top SKU cảnh báo tồn</h3>
                <Link to="/san-pham" className="text-sm font-medium text-primary hover:underline">
                  Quản lý kho →
                </Link>
              </div>
              <p className="sr-only">Biểu đồ cột: mặt hàng có tồn kho thấp nhất trong nhóm cảnh báo.</p>
              {lowStockChart.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có SKU cần cảnh báo tồn kho.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={lowStockChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" interval={0} angle={-20} height={52} textAnchor="end" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [`${formatNumber(value)} bình`, "Tồn kho"]} />
                      <Bar dataKey="stock" fill="hsl(var(--warning))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {inventoryInsights.outOfStock.length > 0 ? `${inventoryInsights.outOfStock.length} SKU đã hết hàng` : "Chưa có SKU hết hàng"}
              </p>
            </Card>

            <Card className="p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Top khách còn nợ</h3>
                <Link to="/tai-chinh-quan-tri" className="text-sm font-medium text-primary hover:underline">
                  Mở sổ nợ →
                </Link>
              </div>
              <p className="sr-only">Biểu đồ cột: năm khách có dư nợ cao nhất hiện tại.</p>
              {topDebtorData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có khách còn nợ trong kỳ hiện tại.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topDebtorData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" interval={0} angle={-20} height={52} textAnchor="end" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}tr` : String(v))} />
                      <Tooltip formatter={(value: number) => [formatVND(value), "Nợ chưa thu"]} />
                      <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card className="mt-4 p-5 shadow-card">
            <h3 className="text-base font-semibold">Điểm cần lưu ý</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <p className="text-xs text-muted-foreground">Giá vốn: {formatVND(inventoryInsights.costValue)}</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
