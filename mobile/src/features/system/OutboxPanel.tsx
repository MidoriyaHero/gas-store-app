import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { ConflictSheet } from "@/components/ui/ConflictSheet";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { subscribeAutoSync, triggerAutoSync } from "@/sync/auto-sync";
import {
  discardOutboxRow,
  listOutboxRows,
  outboxRowLabel,
  retryOutboxRow,
  type OutboxRow,
} from "@/sync/outbox";
import { colors, spacing } from "@/theme/tokens";

/** Pending and failed outbox mutations; sync runs automatically when online. */
export function OutboxPanel() {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoOnline, setAutoOnline] = useState(true);
  const [conflictRow, setConflictRow] = useState<OutboxRow | null>(null);

  const loadRows = useCallback(async () => {
    setRows(await listOutboxRows());
  }, []);

  const prevSyncingRef = useRef(false);
  const prevPendingRef = useRef<number | null>(null);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(
    () =>
      subscribeAutoSync((snap) => {
        setSyncing(snap.syncing);
        setAutoOnline(snap.online);
        const wasSyncing = prevSyncingRef.current;
        prevSyncingRef.current = snap.syncing;
        const pendingChanged =
          prevPendingRef.current !== null && prevPendingRef.current !== snap.pending;
        prevPendingRef.current = snap.pending;
        if ((wasSyncing && !snap.syncing) || (!snap.syncing && pendingChanged)) {
          void loadRows();
        }
      }),
    [loadRows],
  );

  async function onRefresh() {
    setRefreshing(true);
    await triggerAutoSync("pull-refresh");
    await loadRows();
    setRefreshing(false);
  }

  async function syncNow() {
    await triggerAutoSync("manual-button");
    await loadRows();
  }

  async function keepServer() {
    if (!conflictRow) return;
    await discardOutboxRow(conflictRow.id);
    await triggerAutoSync("after-discard");
    setConflictRow(null);
    await loadRows();
  }

  async function retryLocal() {
    if (!conflictRow) return;
    await retryOutboxRow(conflictRow.id);
    setConflictRow(null);
    await syncNow();
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText variant="h2">Chờ đồng bộ</AppText>
            <AppText variant="caption" muted>
              {rows.length} thao tác · {autoOnline ? "tự động gửi khi có WiFi/4G" : "offline — chờ mạng"}
            </AppText>
            <Button label="Đồng bộ ngay" variant="secondary" loading={syncing} onPress={() => void syncNow()} style={{ marginTop: spacing.sm }} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="cloud-done-outline"
            title="Hàng đợi trống"
            description="Mọi thay đổi đã được gửi lên server."
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => item.status === "error" && setConflictRow(item)}>
            <Card style={styles.card}>
            <View style={styles.row}>
              <AppText variant="bodyMedium" style={{ flex: 1 }}>
                {outboxRowLabel(item)}
              </AppText>
              <StatusBadge
                label={item.status === "error" ? "Lỗi" : "Chờ gửi"}
                tone={item.status === "error" ? "error" : "warning"}
              />
            </View>
            <AppText variant="caption" muted>
              {new Date(item.createdAt).toLocaleString("vi-VN")}
            </AppText>
            {item.lastError ? (
              <AppText variant="caption" style={{ color: colors.error, marginTop: 4 }}>
                {item.lastError}
              </AppText>
            ) : null}
            {item.status === "error" ? (
              <AppText variant="caption" style={{ color: colors.primary, marginTop: 4 }}>
                Chạm để xử lý xung đột ›
              </AppText>
            ) : null}
            </Card>
          </Pressable>
        )}
      />

      <ConflictSheet
        visible={!!conflictRow}
        row={conflictRow}
        onKeepServer={() => void keepServer()}
        onRetryLocal={() => void retryLocal()}
        onCancel={() => setConflictRow(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.md, gap: 4 },
  card: { marginBottom: spacing.sm, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
