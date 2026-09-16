import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { fetchDashboard } from "@/api/client";
import { logoutSession } from "@/auth/logout";
import {
  ChartCard,
  CompactKpi,
  MobileDonutChart,
  MobileHBarChart,
  MobileLineChart,
  MobileVBarChart,
} from "@/components/charts/MobileCharts";
import { AppText } from "@/components/ui/AppText";
import { FilterChip } from "@/components/ui/FilterChip";
import { Screen } from "@/components/ui/Screen";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { products, salesOrders } from "@/db/schema";
import {
  currentWindow,
  percentDelta,
  PERIOD_LABEL,
  previousWindow,
  summarizeSeries,
  summarizeCustomerSegments,
  unitQuantityFromPayload,
  windowTotals,
  type PeriodKey,
} from "@/lib/dashboard-analytics";
import { CUSTOMER_SEGMENT_COLOR, CUSTOMER_SEGMENT_LABEL } from "@/lib/customer-segment";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { triggerAutoSync } from "@/sync/auto-sync";
import { countPendingOutbox } from "@/sync/outbox";
import { formatVnd, formatVndCompact } from "@/utils/format";
import { colors, spacing } from "@/theme/tokens";

/** Admin chart-first dashboard: API orders when online, SQLite fallback offline. */
export default function AdminHome() {
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [chartMode, setChartMode] = useState<"revenue" | "units">("revenue");
  const [orders, setOrders] = useState<(typeof salesOrders.$inferSelect)[]>([]);
  const [apiOrders, setApiOrders] = useState<
    Array<{
      total: string;
      created_at: string;
      delivery_date?: string | null;
      line_quantity: number;
      customer_segment?: string | null;
    }>
  > | null>(null);
  const [productRows, setProductRows] = useState<(typeof products.$inferSelect)[]>([]);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setOrders(await db.select().from(salesOrders));
    setProductRows(await db.select().from(products));
    setPending(await countPendingOutbox());
    try {
      const data = await fetchDashboard();
      setApiOrders(data.orders ?? []);
    } catch {
      setApiOrders(null);
    }
  }, []);

  useAutoSyncScreen(load);

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const cacheSince = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return d;
  }, [now]);

  const analyticsOrders = useMemo(() => {
    if (apiOrders) {
      return apiOrders.map((o) => ({
        createdAt: o.created_at,
        deliveryDate: o.delivery_date ?? null,
        total: String(o.total),
        unitQuantity: Number(o.line_quantity ?? 0),
        borrowedShellUnits: 0,
        customerSegment: o.customer_segment ?? null,
      }));
    }
    return orders
      .filter((o) => o.createdAt && new Date(o.createdAt) >= cacheSince)
      .map((o) => ({
        createdAt: o.createdAt,
        deliveryDate: o.deliveryDate ?? null,
        total: o.total,
        unitQuantity: unitQuantityFromPayload(o.payloadJson),
        borrowedShellUnits: o.borrowedShellUnits,
        customerSegment: o.customerSegment ?? null,
      }));
  }, [apiOrders, orders, cacheSince]);

  const current = currentWindow(period, now);
  const previous = previousWindow(period, current);
  const currentSeries = useMemo(() => summarizeSeries(current, analyticsOrders), [current, analyticsOrders]);
  const previousSeries = useMemo(() => summarizeSeries(previous, analyticsOrders), [previous, analyticsOrders]);
  const segmentShares = useMemo(
    () => summarizeCustomerSegments(current, analyticsOrders),
    [current, analyticsOrders],
  );

  const currentMetrics = useMemo(() => {
    const revenue = currentSeries.reduce((s, r) => s + r.revenue, 0);
    const unitQuantity = currentSeries.reduce((s, r) => s + r.unitQuantity, 0);
    const shells = orders.filter((o) => (o.borrowedShellUnits ?? 0) > 0).reduce((s, o) => s + (o.borrowedShellUnits ?? 0), 0);
    return { revenue, unitQuantity, shells };
  }, [currentSeries, orders]);

  const previousMetrics = useMemo(() => {
    const revenue = previousSeries.reduce((s, r) => s + r.revenue, 0);
    const unitQuantity = previousSeries.reduce((s, r) => s + r.unitQuantity, 0);
    return { revenue, unitQuantity };
  }, [previousSeries]);

  const lowStockChart = useMemo(
    () =>
      productRows
        .filter((p) => p.stockQuantity <= 5)
        .sort((a, b) => a.stockQuantity - b.stockQuantity)
        .slice(0, 5)
        .map((p) => ({ label: p.name.slice(0, 8), value: p.stockQuantity })),
    [productRows],
  );

  const debtByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const debt = o.borrowedShellUnits ?? 0;
      if (debt <= 0) continue;
      map.set(o.customerName, (map.get(o.customerName) ?? 0) + debt);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [orders]);

  const completed = orders.filter((o) => o.deliveryStatus === "completed").length;
  const inTransit = orders.length - completed;

  const todayWindow = useMemo(() => ({ start: now, end: now }), [now]);
  const yesterdayWindow = useMemo(() => {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { start: y, end: y };
  }, [now]);
  const todayMetrics = useMemo(
    () => windowTotals(todayWindow, analyticsOrders),
    [todayWindow, analyticsOrders],
  );
  const yesterdayMetrics = useMemo(
    () => windowTotals(yesterdayWindow, analyticsOrders),
    [yesterdayWindow, analyticsOrders],
  );
  const todayLabel = useMemo(() => {
    const d = now;
    return `Hôm nay (${d.getDate()}/${d.getMonth() + 1})`;
  }, [now]);

  async function logout() {
    await logoutSession();
    router.replace("/login");
  }

  async function onRefresh() {
    setRefreshing(true);
    const ok = await triggerAutoSync("pull");
    if (!ok) toast.showError("Không đồng bộ được — kiểm tra mạng");
    await load();
    setRefreshing(false);
  }

  return (
    <Screen scroll padded={false} safeTop>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <AppText variant="h2">Tổng quan</AppText>
          <Pressable
            onPress={() => void logout()}
            style={styles.logoutBtn}
            accessibilityRole="button"
            accessibilityLabel="Đăng xuất"
          >
            <Ionicons name="log-out-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.kpiRow}>
          <CompactKpi
            label={todayLabel}
            value={formatVndCompact(todayMetrics.revenue)}
            delta={percentDelta(todayMetrics.revenue, yesterdayMetrics.revenue)}
          />
          <CompactKpi
            label="Bình hôm nay"
            value={String(todayMetrics.unitQuantity)}
            delta={percentDelta(todayMetrics.unitQuantity, yesterdayMetrics.unitQuantity)}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((key) => (
            <FilterChip key={key} label={PERIOD_LABEL[key]} active={period === key} onPress={() => setPeriod(key)} />
          ))}
          <FilterChip
            label="Doanh thu"
            active={chartMode === "revenue"}
            onPress={() => setChartMode("revenue")}
          />
          <FilterChip
            label="Số bình"
            active={chartMode === "units"}
            onPress={() => setChartMode("units")}
          />
        </ScrollView>

        <View style={styles.kpiRow}>
          <CompactKpi
            label="Doanh thu"
            value={formatVndCompact(currentMetrics.revenue)}
            delta={percentDelta(currentMetrics.revenue, previousMetrics.revenue)}
          />
          <CompactKpi
            label="Số bình"
            value={String(currentMetrics.unitQuantity)}
            delta={percentDelta(currentMetrics.unitQuantity, previousMetrics.unitQuantity)}
          />
          <CompactKpi label="Chờ sync" value={String(pending)} />
        </View>

        <View style={styles.charts}>
          <ChartCard
            title={chartMode === "revenue" ? "Doanh thu theo ngày" : "Số bình theo ngày"}
            subtitle={PERIOD_LABEL[period]}
          >
            <MobileLineChart data={currentSeries} dataKey={chartMode === "revenue" ? "revenue" : "unitQuantity"} />
          </ChartCard>

          <ChartCard title="Trạng thái giao" subtitle={`${completed} hoàn thành · ${inTransit} đang giao`}>
            <MobileDonutChart
              slices={[
                { label: "Hoàn thành", value: completed, color: colors.success },
                { label: "Đang giao", value: inTransit, color: colors.warning },
              ]}
            />
          </ChartCard>

          <ChartCard title="Cơ cấu tệp khách" subtitle={PERIOD_LABEL[period]}>
            <MobileDonutChart
              slices={segmentShares.map((row) => ({
                label: CUSTOMER_SEGMENT_LABEL[row.segment],
                value: row.orderCount,
                color: CUSTOMER_SEGMENT_COLOR[row.segment],
              }))}
            />
          </ChartCard>

          {lowStockChart.length > 0 ? (
            <ChartCard title="Tồn kho thấp" subtitle="≤ 5 bình">
              <MobileVBarChart rows={lowStockChart} />
            </ChartCard>
          ) : null}

          {debtByCustomer.length > 0 ? (
            <ChartCard title="Nợ vỏ theo khách" subtitle="Từ cache local">
              <MobileHBarChart rows={debtByCustomer} />
            </ChartCard>
          ) : null}
        </View>

        <AppText variant="caption" muted style={styles.foot}>
          Tự cập nhật khi mở tab · {orders.length} đơn · {formatVnd(currentMetrics.revenue)} trong kỳ
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logoutBtn: { padding: spacing.xs },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  kpiRow: { flexDirection: "row", gap: spacing.sm },
  charts: { gap: spacing.sm, marginTop: spacing.xs },
  foot: { marginTop: spacing.sm, textAlign: "center" },
});
