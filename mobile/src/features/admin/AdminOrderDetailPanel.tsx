import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { eq } from "drizzle-orm";

import { fetchUsers, patchOrder, deleteOrder } from "@/api/client";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterChip } from "@/components/ui/FilterChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { ShellUnitsStepper } from "@/components/ui/ShellUnitsStepper";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { salesOrders } from "@/db/schema";
import { buildOrderPatchPayload, enqueueSalesOrderPatch } from "@/lib/order-patch";
import { isOnline } from "@/lib/network";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { triggerAutoSync } from "@/sync/auto-sync";
import { resolveDeliveryTarget } from "@/lib/order-location";
import { openDeliverySlip } from "@/lib/export-open";
import { parseOrderPayload } from "@/lib/order-payload";
import { runSyncCycle } from "@/sync/engine";
import { openGoogleMapsDirections } from "@/utils/maps";
import { colors, spacing } from "@/theme/tokens";

type TabKey = "info" | "edit" | "shell";

type Props = { orderId: number };

/** Admin order detail with online edit, shell queue, and maps. */
export function AdminOrderDetailPanel({ orderId }: Props) {
  const toast = useToast();
  const [order, setOrder] = useState<(typeof salesOrders.$inferSelect) | null>(null);
  const [tab, setTab] = useState<TabKey>("info");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"in_transit" | "completed">("in_transit");
  const [assigneeId, setAssigneeId] = useState("");
  const [shellUnits, setShellUnits] = useState(0);
  const [users, setUsers] = useState<Array<{ id: number; username: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const rows = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
    const row = rows[0] ?? null;
    setOrder(row);
    if (row) {
      setPhone(row.phone ?? "");
      const cached = JSON.parse(row.payloadJson) as Record<string, unknown>;
      setNote(String(cached.note ?? ""));
      setStatus(row.deliveryStatus === "completed" ? "completed" : "in_transit");
      setAssigneeId(cached.assigned_to_user_id != null ? String(cached.assigned_to_user_id) : "");
      setShellUnits(Number(row.borrowedShellUnits ?? 0));
    }
  }, [orderId]);

  useEffect(() => {
    void fetchUsers()
      .then((list) => setUsers(list.filter((u) => u.is_active && u.role === "user")))
      .catch(() => setUsers([]));
  }, []);

  useAutoSyncScreen(load);

  async function onRefresh() {
    setRefreshing(true);
    await triggerAutoSync("pull");
    setRefreshing(false);
  }

  async function saveShellUnits() {
    if (!order) return;
    setBusy(true);
    try {
      await enqueueSalesOrderPatch(order, { borrowed_shell_units: shellUnits });
      await runSyncCycle();
      await load();
      toast.showSuccess("Đã cập nhật nợ vỏ");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Cập nhật vỏ thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!order) return;
    if (!(await isOnline())) {
      toast.showError("Cần mạng để sửa đơn trên server");
      return;
    }
    setSaving(true);
    try {
      const cached = JSON.parse(order.payloadJson) as Record<string, unknown>;
      const body = buildOrderPatchPayload(cached, {
        phone,
        note: note.trim() || null,
        delivery_status: status,
        assigned_to_user_id: assigneeId ? Number(assigneeId) : null,
      });
      await patchOrder(order.id, body);
      await runSyncCycle();
      await load();
      toast.showSuccess("Đã cập nhật đơn");
      setTab("info");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Sửa đơn thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder() {
    if (!order) return;
    if (!(await isOnline())) {
      toast.showError("Cần mạng để xóa đơn");
      return;
    }
    setDeleting(true);
    try {
      await deleteOrder(order.id);
      await runSyncCycle();
      toast.showSuccess("Đã xóa đơn");
      setDeleteOpen(false);
      router.back();
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Xóa đơn thất bại");
    } finally {
      setDeleting(false);
    }
  }

  async function openMaps() {
    if (!order) return;
    const target = resolveDeliveryTarget(order);
    if (!target) return;
    const ok = await openGoogleMapsDirections(target.destination);
    if (!ok) {
      toast.showError("Không mở được Google Maps");
    }
  }

  if (!order) {
    return (
      <View style={styles.missing}>
        <AppText variant="body" muted>
          Đơn #{orderId} không còn trên server — có thể đã bị xóa trên web.
        </AppText>
        <Button label="Thử đồng bộ lại" loading={refreshing} onPress={() => void onRefresh()} style={{ marginTop: spacing.sm }} />
        <Button label="Về danh sách" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xs }} />
      </View>
    );
  }

  const target = resolveDeliveryTarget(order);
  const payload = parseOrderPayload(order.payloadJson);
  const lineItems = (payload.order_items as Array<{ product_name: string; quantity: number; subtotal: string | number }> | undefined) ?? [];
  const statusTone = order.deliveryStatus === "completed" ? "success" : "warning";
  const statusLabel = order.deliveryStatus === "completed" ? "Hoàn thành" : "Đang giao";

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
    >
      <View style={styles.chips}>
        <FilterChip label="Thông tin" active={tab === "info"} onPress={() => setTab("info")} />
        <FilterChip label="Sửa" active={tab === "edit"} onPress={() => setTab("edit")} />
        <FilterChip label="Nợ vỏ" active={tab === "shell"} onPress={() => setTab("shell")} />
      </View>

      {tab === "info" ? (
        <Card style={styles.card}>
          <View style={styles.row}>
            <AppText variant="h3">{order.orderCode}</AppText>
            <StatusBadge label={statusLabel} tone={statusTone} />
          </View>
          <AppText variant="bodyMedium">{order.customerName}</AppText>
          {order.phone ? <AppText variant="caption" muted>{order.phone}</AppText> : null}
          {target ? <AppText variant="body" muted style={{ marginTop: spacing.sm }}>{target.label}</AppText> : null}
          <View style={styles.kv}>
            <AppText variant="caption" muted>Tổng tiền</AppText>
            <AppText variant="bodyMedium">{order.total} đ</AppText>
          </View>
          {Number(order.borrowedShellUnits ?? 0) > 0 ? (
            <AppText variant="caption" muted>Nợ vỏ: {order.borrowedShellUnits} bình</AppText>
          ) : null}
          {payload.payment_mode ? (
            <AppText variant="caption" muted>Thanh toán: {String(payload.payment_mode)}</AppText>
          ) : null}
          {lineItems.length > 0 ? (
            <View style={{ marginTop: spacing.sm, gap: 4 }}>
              <AppText variant="caption" muted>Hàng hóa</AppText>
              {lineItems.map((li, i) => (
                <AppText key={i} variant="body">
                  {li.product_name} × {li.quantity} — {li.subtotal} đ
                </AppText>
              ))}
            </View>
          ) : null}
          {target ? (
            <Button label="Mở Google Maps" variant="secondary" onPress={() => void openMaps()} style={{ marginTop: spacing.sm }} />
          ) : null}
          <Button label="Phiếu giao" variant="secondary" onPress={() => void openDeliverySlip(order.id).catch((e) => toast.showError(String(e)))} />
          <Button label="Xóa đơn" variant="ghost" onPress={() => setDeleteOpen(true)} />
        </Card>
      ) : null}

      {tab === "edit" ? (
        <Card style={styles.card}>
          <AppText variant="caption" muted>
            Cần mạng · PATCH server rồi đồng bộ cache
          </AppText>
          <TextField label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextField label="Ghi chú đơn" value={note} onChangeText={setNote} multiline />
          <AppText variant="caption" muted style={{ marginTop: spacing.xs }}>
            Trạng thái giao
          </AppText>
          <View style={styles.chips}>
            <FilterChip label="Đang giao" active={status === "in_transit"} onPress={() => setStatus("in_transit")} />
            <FilterChip label="Hoàn thành" active={status === "completed"} onPress={() => setStatus("completed")} />
          </View>
          <AppText variant="caption" muted>
            Nhân viên giao (ID)
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip label="Không assign" active={!assigneeId} onPress={() => setAssigneeId("")} />
            {users.map((u) => (
              <FilterChip
                key={u.id}
                label={u.username}
                active={assigneeId === String(u.id)}
                onPress={() => setAssigneeId(String(u.id))}
              />
            ))}
          </ScrollView>
          <Button label="Lưu thay đổi" variant="accent" loading={saving} onPress={() => void saveEdit()} />
        </Card>
      ) : null}

      {tab === "shell" ? (
        <Card style={styles.card}>
          <AppText variant="bodyMedium">Nợ vỏ hiện tại</AppText>
          <ShellUnitsStepper value={shellUnits} onChange={setShellUnits} disabled={busy} />
          <Button label="Lưu nợ vỏ" variant="accent" loading={busy} onPress={() => void saveShellUnits()} />
        </Card>
      ) : null}
      <ConfirmSheet
        visible={deleteOpen}
        title="Xóa đơn hàng?"
        message="Thao tác không hoàn tác. Đơn sẽ biến mất trên web và app sau đồng bộ."
        confirmLabel="Xóa"
        loading={deleting}
        onConfirm={() => void removeOrder()}
        onCancel={() => setDeleteOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  missing: { padding: spacing.lg, gap: spacing.xs },
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  card: { gap: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kv: { marginTop: spacing.sm, gap: 2 },
});
