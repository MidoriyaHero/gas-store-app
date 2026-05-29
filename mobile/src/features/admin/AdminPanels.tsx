import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";

import { fetchDailyCylinderAudit, patchOrder, putDailyCylinderAudit } from "@/api/client";
import { OrderCard } from "@/components/OrderCard";
import { AppText, SectionLabel } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { salesOrders } from "@/db/schema";
import { isOnline } from "@/lib/network";
import { filterAdminOrders } from "@/lib/order-list";
import { buildOrderPatchPayload, enqueueSalesOrderPatch } from "@/lib/order-patch";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { triggerAutoSync } from "@/sync/auto-sync";
import { runSyncCycle } from "@/sync/engine";
import { enqueueMutation } from "@/sync/outbox";
import { businessDateLabel } from "@/utils/date";
import { colors, spacing } from "@/theme/tokens";

type StatusFilter = "all" | "active" | "completed";

/** Admin order list with status filters, quick complete, and compact cards. */
export function AdminOrdersPanel() {
  const toast = useToast();
  const [orders, setOrders] = useState<(typeof salesOrders.$inferSelect)[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [completingId, setCompletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setOrders(await db.select().from(salesOrders));
  }, []);

  useAutoSyncScreen(load);

  const filtered = useMemo(
    () =>
      filterAdminOrders(orders, {
        search,
        status: filter,
      }),
    [orders, filter, search],
  );

  async function onRefresh() {
    setRefreshing(true);
    const ok = await triggerAutoSync("pull");
    if (!ok) toast.showError("Không đồng bộ được — kiểm tra mạng");
    setRefreshing(false);
  }

  async function bumpBorrowed(order: typeof salesOrders.$inferSelect) {
    try {
      await enqueueSalesOrderPatch(order, {
        borrowed_shell_units: Number(order.borrowedShellUnits ?? 0) + 1,
      });
      await runSyncCycle();
      await load();
      toast.showSuccess("Đã +1 vỏ");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Cập nhật vỏ thất bại");
    }
  }

  async function completeOrder(order: typeof salesOrders.$inferSelect) {
    if (order.deliveryStatus === "completed") return;
    if (!(await isOnline())) {
      toast.showError("Cần mạng để hoàn thành đơn");
      return;
    }
    setCompletingId(order.id);
    try {
      const cached = JSON.parse(order.payloadJson) as Record<string, unknown>;
      const body = buildOrderPatchPayload(cached, { delivery_status: "completed" });
      await patchOrder(order.id, body);
      await runSyncCycle();
      await load();
      toast.showSuccess(`Đã hoàn thành ${order.orderCode}`);
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Hoàn thành đơn thất bại");
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <AppText variant="h2">Đơn hàng</AppText>
          <AppText variant="caption" muted>
            {filtered.length}/{orders.length} đơn · tự cập nhật khi mở tab
          </AppText>
          <TextField
            value={search}
            onChangeText={setSearch}
            placeholder="Mã đơn, tên khách hoặc SĐT…"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Tất cả" active={filter === "all"} onPress={() => setFilter("all")} />
            <FilterChip label="Đang giao" active={filter === "active"} onPress={() => setFilter("active")} />
            <FilterChip label="Hoàn thành" active={filter === "completed"} onPress={() => setFilter("completed")} />
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="receipt-outline"
          title={search.trim() ? "Không tìm thấy đơn" : "Chưa có đơn"}
          description={
            search.trim()
              ? "Thử mã khác hoặc kéo xuống để đồng bộ từ máy chủ."
              : "Kéo xuống để đồng bộ đơn từ máy chủ."
          }
          actionLabel="Thử lại"
          onAction={() => void onRefresh()}
        />
      }
      renderItem={({ item }) => (
        <OrderCard
          orderCode={item.orderCode}
          customerName={item.customerName}
          subtitle={item.phone ?? undefined}
          statusLabel={item.deliveryStatus === "completed" ? "Hoàn thành" : "Đang giao"}
          statusTone={item.deliveryStatus === "completed" ? "success" : "warning"}
          meta={[
            { icon: "cube-outline", text: `Nợ vỏ: ${item.borrowedShellUnits ?? 0}` },
            { icon: "cash-outline", text: `${item.total} đ` },
          ]}
          onPress={() => router.push(`/(admin)/order/${item.id}` as Href)}
          primaryAction={
            item.deliveryStatus !== "completed"
              ? {
                  label: "Hoàn thành",
                  loading: completingId === item.id,
                  onPress: () => void completeOrder(item),
                }
              : undefined
          }
          secondaryAction={{
            label: "+1 vỏ",
            onPress: () => void bumpBorrowed(item),
          }}
        />
      )}
    />
  );
}

/** Admin daily cylinder audit — GET load, PUT online, offline outbox fallback. */
export function AdminAuditPanel() {
  const toast = useToast();
  const businessDate = businessDateLabel();
  const [morningFull, setMorningFull] = useState("");
  const [morningShell, setMorningShell] = useState("");
  const [importFull, setImportFull] = useState("");
  const [supplierShell, setSupplierShell] = useState("");
  const [eveningFull, setEveningFull] = useState("");
  const [eveningShell, setEveningShell] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [computed, setComputed] = useState<{
    delivered_full: number;
    borrowed_shell_total: number;
    returned_shells_debt: number;
    expected_evening_full: number;
    expected_evening_shell: number;
    variance_full: number | null;
    variance_shell: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyPayload = useCallback((data: Awaited<ReturnType<typeof fetchDailyCylinderAudit>>) => {
    setComputed(data.computed);
    const r = data.record;
    if (r) {
      setMorningFull(String(r.morning_full));
      setMorningShell(String(r.morning_shell));
      setImportFull(String(r.import_full));
      setSupplierShell(String(r.supplier_shell_units));
      setEveningFull(String(r.evening_full));
      setEveningShell(String(r.evening_shell));
      setAuditNote(r.note ?? "");
    } else {
      setMorningFull("0");
      setMorningShell("0");
      setImportFull("0");
      setSupplierShell("0");
      setEveningFull("0");
      setEveningShell("0");
      setAuditNote("");
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      if (await isOnline()) {
        const data = await fetchDailyCylinderAudit(businessDate);
        applyPayload(data);
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải được kiểm kê");
    } finally {
      setLoading(false);
    }
  }, [applyPayload, businessDate, toast]);

  useAutoSyncScreen(loadAudit);

  async function saveAudit() {
    setSaving(true);
    const payload = {
      morning_full: Number(morningFull) || 0,
      morning_shell: Number(morningShell) || 0,
      import_full: Number(importFull) || 0,
      supplier_shell_units: Number(supplierShell) || 0,
      evening_full: Number(eveningFull) || 0,
      evening_shell: Number(eveningShell) || 0,
      note: auditNote.trim() || null,
    };
    try {
      if (await isOnline()) {
        const data = await putDailyCylinderAudit(businessDate, payload);
        applyPayload(data);
        toast.showSuccess(`Đã lưu kiểm kê ${businessDate}`);
      } else {
        await enqueueMutation({
          entity: "daily_cylinder_audit",
          operation: "upsert",
          payload: { business_date: businessDate, ...payload },
        });
        await runSyncCycle();
        toast.showSuccess("Đã xếp hàng — đồng bộ khi có mạng");
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Lưu kiểm kê thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.auditRoot}>
      <View style={styles.listHeader}>
        <AppText variant="h2">Kiểm kê vỏ / nước</AppText>
        <AppText variant="caption" muted>
          Ngày nghiệp vụ UTC+7: {businessDate}
        </AppText>
      </View>

      {computed ? (
        <Card style={styles.formCard}>
          <SectionLabel>Đối chiếu (server)</SectionLabel>
          <AppText variant="caption" muted>
            Giao đầy: {computed.delivered_full} · Dự kiến tối đầy: {computed.expected_evening_full}
          </AppText>
          <AppText variant="caption" muted>
            Vỏ mượn (đơn): {computed.borrowed_shell_total} · Vỏ trả (thu nợ): {computed.returned_shells_debt}
          </AppText>
          <AppText variant="caption" muted>
            Dự kiến tối vỏ: {computed.expected_evening_shell}
          </AppText>
          {computed.variance_full != null ? (
            <AppText variant="bodyMedium" style={{ color: computed.variance_full === 0 ? colors.success : colors.warning }}>
              Lệch đầy: {computed.variance_full}
            </AppText>
          ) : null}
          {computed.variance_shell != null ? (
            <AppText variant="bodyMedium" style={{ color: computed.variance_shell === 0 ? colors.success : colors.warning }}>
              Lệch vỏ: {computed.variance_shell}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        <SectionLabel>Sáng</SectionLabel>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Gas đầy (sáng)" value={morningFull} onChangeText={setMorningFull} keyboardType="number-pad" />
          </View>
          <View style={styles.half}>
            <TextField label="Vỏ (sáng)" value={morningShell} onChangeText={setMorningShell} keyboardType="number-pad" />
          </View>
        </View>

        <SectionLabel>Nhập / công ty</SectionLabel>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Nhập đầy" value={importFull} onChangeText={setImportFull} keyboardType="number-pad" />
          </View>
          <View style={styles.half}>
            <TextField label="Vỏ công ty" value={supplierShell} onChangeText={setSupplierShell} keyboardType="number-pad" />
          </View>
        </View>

        <SectionLabel>Chiều / tối</SectionLabel>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Gas đầy (tối)" value={eveningFull} onChangeText={setEveningFull} keyboardType="number-pad" />
          </View>
          <View style={styles.half}>
            <TextField label="Vỏ (tối)" value={eveningShell} onChangeText={setEveningShell} keyboardType="number-pad" />
          </View>
        </View>
        <TextField label="Ghi chú" value={auditNote} onChangeText={setAuditNote} multiline />

        <Button
          label={loading ? "Đang tải…" : "Lưu kiểm kê"}
          loading={saving}
          fullWidth
          disabled={loading}
          onPress={() => void saveAudit()}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  listHeader: { marginBottom: spacing.md, gap: spacing.sm },
  chips: { gap: spacing.sm, paddingTop: spacing.xs },
  auditRoot: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  formCard: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  half: { flex: 1 },
});
