import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { eq } from "drizzle-orm";

import { fetchCurrentUser } from "@/api/client";
import { OrderCard } from "@/components/OrderCard";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { TextField } from "@/components/ui/TextField";
import { db } from "@/db/client";
import { orderNotes, salesOrders } from "@/db/schema";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { isOrderAssignedToUser, parseOrderPayload } from "@/lib/order-payload";
import { triggerAutoSync } from "@/sync/auto-sync";
import { colors, spacing } from "@/theme/tokens";

type DeliveryTab = "in_transit" | "completed";
type PaymentFilter = "all" | "cash" | "partial" | "debt";

function deliveryTone(status: string): "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "in_transit") return "warning";
  return "info";
}

function deliveryLabel(status: string): string {
  if (status === "completed") return "Hoàn thành";
  if (status === "in_transit") return "Đang giao";
  return status;
}

function matchSearch(order: typeof salesOrders.$inferSelect, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    order.orderCode.toLowerCase().includes(needle) ||
    order.customerName.toLowerCase().includes(needle) ||
    (order.phone ?? "").toLowerCase().includes(needle)
  );
}

/** Staff delivery list scoped to assignee with web-like tabs and filters. */
export function StaffOrdersPanel() {
  const [orders, setOrders] = useState<(typeof salesOrders.$inferSelect)[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<number, number>>({});
  const [userId, setUserId] = useState<number | null>(null);
  const [tab, setTab] = useState<DeliveryTab>("in_transit");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const rows = await db.select().from(salesOrders);
    let me = userId;
    if (me == null) {
      try {
        const user = await fetchCurrentUser();
        me = user.id;
        setUserId(user.id);
      } catch {
        me = null;
      }
    }
    const scoped = me != null ? rows.filter((r) => isOrderAssignedToUser(r.payloadJson, me)) : [];
    setOrders(scoped);
    const counts: Record<number, number> = {};
    for (const row of scoped) {
      const notes = await db.select().from(orderNotes).where(eq(orderNotes.salesOrderId, row.id));
      if (notes.length > 0) counts[row.id] = notes.length;
    }
    setNoteCounts(counts);
  }, [userId]);

  useAutoSyncScreen(load);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const statusOk = tab === "completed" ? o.deliveryStatus === "completed" : o.deliveryStatus !== "completed";
      if (!statusOk) return false;
      if (!matchSearch(o, search)) return false;
      if (paymentFilter === "all") return true;
      const payload = parseOrderPayload(o.payloadJson);
      return String(payload.payment_mode ?? "cash") === paymentFilter;
    });
  }, [orders, tab, search, paymentFilter]);

  async function onRefresh() {
    setRefreshing(true);
    await triggerAutoSync("pull");
    setRefreshing(false);
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <AppText variant="h2">Đơn của tôi</AppText>
          <AppText variant="caption" muted>
            {filtered.length} đơn · chỉ đơn được giao cho bạn
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Đang giao" active={tab === "in_transit"} onPress={() => setTab("in_transit")} />
            <FilterChip label="Đã giao" active={tab === "completed"} onPress={() => setTab("completed")} />
          </ScrollView>
          <TextField value={search} onChangeText={setSearch} placeholder="Mã đơn, tên, SĐT…" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="TT: Tất cả" active={paymentFilter === "all"} onPress={() => setPaymentFilter("all")} />
            <FilterChip label="Tiền mặt" active={paymentFilter === "cash"} onPress={() => setPaymentFilter("cash")} />
            <FilterChip label="Một phần" active={paymentFilter === "partial"} onPress={() => setPaymentFilter("partial")} />
            <FilterChip label="Công nợ" active={paymentFilter === "debt"} onPress={() => setPaymentFilter("debt")} />
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="bicycle-outline"
          title={search.trim() ? "Không tìm thấy đơn" : "Chưa có đơn giao"}
          description="Kéo xuống để đồng bộ từ máy chủ."
          actionLabel="Thử đồng bộ"
          onAction={() => void onRefresh()}
        />
      }
      renderItem={({ item }) => (
        <OrderCard
          orderCode={item.orderCode}
          customerName={item.customerName}
          subtitle={item.phone ?? undefined}
          statusLabel={deliveryLabel(item.deliveryStatus)}
          statusTone={deliveryTone(item.deliveryStatus)}
          meta={[
            ...(item.deliveryDate ? [{ icon: "calendar-outline" as const, text: item.deliveryDate }] : []),
            { icon: "cash-outline" as const, text: `${item.total} đ` },
          ]}
          footer={
            noteCounts[item.id] ? (
              <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
                {noteCounts[item.id]} ghi chú
              </AppText>
            ) : undefined
          }
          onPress={() => router.push(`/(staff)/order/${item.id}` as Href)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  listHeader: { marginBottom: spacing.md, gap: spacing.sm },
  chips: { flexDirection: "row", gap: spacing.sm },
});
