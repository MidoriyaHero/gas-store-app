import { useCallback } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { TextField } from "@/components/ui/TextField";
import { formatRelativeCallTime } from "@/lib/call-log";
import { lookupCustomerFromPhone } from "@/lib/customer-from-phone";
import { type CallHistoryRow, useCallLogPicker } from "@/hooks/useCallLogPicker";
import { colors, radius, spacing } from "@/theme/tokens";

/** Admin picker: grouped call history → create order with phone + customer prefill. */
export function CallHistoryOrderPicker() {
  const {
    permission,
    loading,
    rows,
    error,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    refresh,
    requestPermission,
  } = useCallLogPicker();

  const onSelect = useCallback(async (row: CallHistoryRow) => {
    const hint = await lookupCustomerFromPhone(row.phone);
    router.push({
      pathname: "/(admin)/order/create",
      params: {
        phone: row.phone,
        ...(hint?.customerName ? { customerName: hint.customerName } : {}),
        ...(hint?.address ? { address: hint.address } : {}),
        ...(hint?.deliveryLatitude != null && hint?.deliveryLongitude != null
          ? { lat: String(hint.deliveryLatitude), lng: String(hint.deliveryLongitude) }
          : {}),
      },
    } as Href);
  }, []);

  if (permission === "unknown" || (loading && rows.length === 0 && permission === "granted")) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <AppText variant="caption" muted style={styles.loadingCaption}>
          Đang đọc cuộc gọi…
        </AppText>
      </View>
    );
  }

  if (permission === "denied") {
    return (
      <View style={styles.deniedWrap}>
        <EmptyState
          icon="call-outline"
          title="Cần quyền lịch sử cuộc gọi"
          description="Gas Huy Hoàng cần đọc lịch sử cuộc gọi để bạn chọn số khách và tạo đơn nhanh. Dữ liệu cuộc gọi chỉ lưu trên máy, không gửi lên server."
          actionLabel="Cấp quyền"
          onAction={() => void requestPermission()}
        />
        <Button label="Mở cài đặt" variant="ghost" onPress={() => void Linking.openSettings()} style={styles.settingsBtn} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.phone}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <AppText variant="caption" muted>
            Gộp theo số · chỉ gọi đến/đi · 7 ngày gần nhất
          </AppText>
          <TextField value={search} onChangeText={setSearch} placeholder="Tìm SĐT hoặc tên khách…" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Tất cả" active={typeFilter === "all"} onPress={() => setTypeFilter("all")} />
            <FilterChip label="Gọi đến" active={typeFilter === "incoming"} onPress={() => setTypeFilter("incoming")} />
            <FilterChip label="Gọi đi" active={typeFilter === "outgoing"} onPress={() => setTypeFilter("outgoing")} />
          </ScrollView>
          {error ? (
            <View style={styles.errorRow}>
              <AppText variant="caption" style={styles.errorText}>
                {error}
              </AppText>
              <Button label="Thử lại" variant="ghost" onPress={() => void refresh()} />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="call-outline"
          title="Chưa có cuộc gọi gần đây"
          description="Chỉ hiển thị cuộc gọi đến và gọi đi trong 7 ngày. Cuộc gọi nhỡ không được liệt kê."
          actionLabel="Kéo xuống làm mới"
          onAction={() => void refresh()}
        />
      }
      renderItem={({ item }) => (
        <CallHistoryRowItem row={item} onPress={() => void onSelect(item)} />
      )}
    />
  );
}

function CallHistoryRowItem({ row, onPress }: { row: CallHistoryRow; onPress: () => void }) {
  const iconName = row.lastCallType === "incoming" ? "arrow-down-outline" : "arrow-up-outline";
  const typeLabel = row.lastCallType === "incoming" ? "Gọi đến" : "Gọi đi";
  const a11y = `Tạo đơn cho ${row.displayPhone}, ${row.callCount} cuộc gọi${row.customerName ? `, khách cũ ${row.customerName}` : ""}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={iconName} size={20} color={colors.accent} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <AppText variant="bodyMedium">{row.displayPhone}</AppText>
          {row.callCount > 1 ? (
            <View style={styles.countBadge}>
              <AppText variant="caption" style={styles.countText}>
                ×{row.callCount}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" muted>
          {formatRelativeCallTime(row.lastCallAt)} · {typeLabel}
        </AppText>
        {row.customerName ? (
          <AppText variant="caption" style={styles.customerHint}>
            Khách cũ: {row.customerName}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deniedWrap: { flex: 1 },
  settingsBtn: { alignSelf: "center", marginTop: -spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  loadingCaption: { marginTop: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  errorText: { color: colors.warning, flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowPressed: { opacity: 0.85 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countBadge: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  countText: { color: colors.accent, fontFamily: "Inter_600SemiBold" },
  customerHint: { color: colors.accent, marginTop: 2 },
});
