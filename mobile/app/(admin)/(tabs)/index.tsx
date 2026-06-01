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
  windowTotals,
  type PeriodKey,
} from "@/lib/dashboard-analytics";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { triggerAutoSync } from "@/sync/auto-sync";
import { countPendingOutbox } from "@/sync/outbox";
import { formatVnd, formatVndCompact } from "@/utils/format";
import { colors, spacing } from "@/theme/tokens";

/** Admin chart-first dashboard: API orders when online, SQLite fallback offline. */
export default function AdminHome() {
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [orders, setOrders] = useState<(typeof salesOrders.$inferSelect)[]>([]);
  const [apiOrders, setApiOrders] = useState<Array<{ total: string; created_at: string }> | null>(null);
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
        total: String(o.total),
        borrowedShellUnits: 0,
      }));
    }
    return orders
      .filter((o) => o.createdAt && new Date(o.createdAt) >= cacheSince)
      .map((o) => ({
        createdAt: o.createdAt,
        total: o.total,
        borrowedShellUnits: o.borrowedShellUnits,
      }));
  }, [apiOrders, orders, cacheSince]);

  const current = currentWindow(period, now);
  const previous = previousWindow(period, current);
  const currentSeries = useMemo(() => summarizeSeries(current, analyticsOrders), [current, analyticsOrders]);
  const previousSeries = useMemo(() => summarizeSeries(previous, analyticsOrders), [previous, analyticsOrders]);

  const currentMetrics = useMemo(() => {
    const revenue = currentSeries.reduce((s, r) => s + r.revenue, 0);
    const orderCount = currentSeries.reduce((s, r) => s + r.orderCount, 0);
    const shells = orders.filter((o) => (o.borrowedShellUnits ?? 0) > 0).reduce((s, o) => s + (o.borrowedShellUnits ?? 0), 0);
    return { revenue, orderCount, shells };
  }, [currentSeries, orders]);

  const previousMetrics = useMemo(() => {
    const revenue = previousSeries.reduce((s, r) => s + r.revenue, 0);
    const orderCount = previousSeries.reduce((s, r) => s + r.orderCount, 0);
    return { revenue, orderCount };
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
            label="Đơn hôm nay"
            value={String(todayMetrics.orderCount)}
            delta={percentDelta(todayMetrics.orderCount, yesterdayMetrics.orderCount)}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((key) => (
            <FilterChip key={key} label={PERIOD_LABEL[key]} active={period === key} onPress={() => setPeriod(key)} />
          ))}
        </ScrollView>

        <View style={styles.kpiRow}>
          <CompactKpi
            label="Doanh thu"
            value={formatVndCompact(currentMetrics.revenue)}
            delta={percentDelta(currentMetrics.revenue, previousMetrics.revenue)}
          />
          <CompactKpi
            label="Đơn hàng"
            value={String(currentMetrics.orderCount)}
            delta={percentDelta(currentMetrics.orderCount, previousMetrics.orderCount)}
          />
          <CompactKpi label="Chờ sync" value={String(pending)} />
        </View>

        <View style={styles.charts}>
          <ChartCard title="Doanh thu theo ngày" subtitle={PERIOD_LABEL[period]}>
            <MobileLineChart data={currentSeries} dataKey="revenue" />
          </ChartCard>

          <ChartCard title="Trạng thái giao" subtitle={`${completed} hoàn thành · ${inTransit} đang giao`}>
            <MobileDonutChart
              slices={[
                { label: "Hoàn thành", value: completed, color: colors.success },
                { label: "Đang giao", value: inTransit, color: colors.warning },
              ]}
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
