import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { db } from "@/db/client";
import { salesOrders } from "@/db/schema";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { resolveDeliveryTarget } from "@/lib/order-location";
import { triggerAutoSync } from "@/sync/auto-sync";
import { openGoogleMapsDirections } from "@/utils/maps";
import { useToast } from "@/components/ui/ToastProvider";
import { colors, spacing } from "@/theme/tokens";

/** Staff delivery stops list — opens Google Maps externally (no in-app map). */
export function StaffDirectionsPanel() {
  const toast = useToast();
  const [orders, setOrders] = useState<(typeof salesOrders.$inferSelect)[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.deliveryStatus !== "completed"),
    [orders],
  );

  const load = useCallback(async () => {
    setOrders(await db.select().from(salesOrders));
  }, []);

  useAutoSyncScreen(load);

  async function onRefresh() {
    setRefreshing(true);
    await triggerAutoSync("pull");
    setRefreshing(false);
  }

  async function openMaps(order: (typeof salesOrders.$inferSelect)) {
    const target = resolveDeliveryTarget(order);
    if (!target) return;
    setOpeningId(order.id);
    try {
      const ok = await openGoogleMapsDirections(target.destination);
      if (!ok) {
        toast.showError("Không mở được Google Maps");
      }
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <FlatList
      data={activeOrders}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <AppText variant="h2">Điểm giao</AppText>
          <AppText variant="caption" muted>
            {activeOrders.length} đơn · mở Google Maps (không nhúng bản đồ)
          </AppText>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="navigate-outline"
          title="Không còn điểm giao"
          description="Các đơn đang giao sẽ hiện ở đây. Kéo xuống để đồng bộ."
          actionLabel="Đồng bộ"
          onAction={() => void onRefresh()}
        />
      }
      renderItem={({ item, index }) => {
        const target = resolveDeliveryTarget(item);
        return (
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={styles.pin}>
                <AppText variant="caption" style={styles.pinText}>
                  {index + 1}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">{item.orderCode}</AppText>
                <AppText variant="caption" muted>
                  {item.customerName}
                </AppText>
                {target ? (
                  <>
                    <AppText variant="caption" muted style={{ marginTop: 4 }}>
                      {target.label}
                    </AppText>
                    <AppText variant="caption" muted style={{ fontSize: 11 }}>
                      {target.hasGps ? "GPS có sẵn" : "Dùng địa chỉ text"}
                    </AppText>
                  </>
                ) : (
                  <AppText variant="caption" style={{ color: colors.warning, marginTop: 4 }}>
                    Chưa có địa chỉ / GPS
                  </AppText>
                )}
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                label="Mở Google Maps"
                variant="secondary"
                loading={openingId === item.id}
                disabled={!target}
                onPress={() => void openMaps(item)}
                style={styles.actionBtn}
              />
              <Button
                label="Chi tiết"
                variant="ghost"
                onPress={() => router.push(`/(staff)/order/${item.id}`)}
                style={styles.actionBtn}
              />
            </View>
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.md, gap: 4 },
  card: { marginBottom: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: { color: "#fff", fontFamily: "Inter_700Bold" },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { flex: 1 },
});
