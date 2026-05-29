import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { createDebtPayment, fetchDebtAccounts, fetchDeliveryDaySummary, fetchUsers } from "@/api/client";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { DebtPaymentSheet } from "@/components/ui/DebtPaymentSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { products, salesOrders } from "@/db/schema";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { isOnline } from "@/lib/network";
import { runSyncCycle } from "@/sync/engine";
import { colors, spacing } from "@/theme/tokens";

type DebtRow = { id: number; customer_name: string; current_balance: string; status: string };

/** Admin debt list with tap-to-collect bottom sheet. */
export function AdminDebtPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DebtRow | null>(null);
  const [amount, setAmount] = useState("");
  const [returnedShells, setReturnedShells] = useState("0");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchDebtAccounts();
      setRows(data.filter((r) => Number(r.current_balance) > 0));
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Không tải được công nợ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openSheet(row: DebtRow) {
    setSelected(row);
    setAmount(row.current_balance);
    setReturnedShells("0");
    setNote("");
  }

  function closeSheet() {
    setSelected(null);
  }

  async function submitPayment() {
    if (!selected) return;
    if (!(await isOnline())) {
      toast.showError("Cần mạng để thu nợ");
      return;
    }
    const parsed = Number(amount.replace(/[^\d.-]/g, ""));
    if (!parsed || parsed <= 0) {
      toast.showError("Nhập số tiền hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      await createDebtPayment({
        debt_account_id: selected.id,
        amount: String(parsed),
        payment_method: "cash",
        returned_shell_units: Number(returnedShells) || 0,
        note: note.trim() || null,
      });
      closeSheet();
      await load();
      toast.showSuccess(`Đã thu nợ ${selected.customer_name}`);
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Thu nợ thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
        ListHeaderComponent={
          <AppText variant="caption" muted style={{ marginBottom: spacing.sm }}>
            Chạm tài khoản để thu nợ · cần mạng
          </AppText>
        }
        ListEmptyComponent={
          error ? (
            <EmptyState icon="cloud-offline-outline" title="Không tải được" description={error} actionLabel="Thử lại" onAction={() => void load()} />
          ) : (
            <EmptyState icon="wallet-outline" title="Không có công nợ" description="Hoặc chưa kết nối server" />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openSheet(item)}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <AppText variant="bodyMedium">{item.customer_name}</AppText>
                <StatusBadge label={item.status === "overdue" ? "Quá hạn" : "Đang theo"} tone={item.status === "overdue" ? "warning" : "info"} />
              </View>
              <AppText variant="h3">{Number(item.current_balance).toLocaleString("vi-VN")} đ</AppText>
              <AppText variant="caption" muted>
                Chạm để thu nợ
              </AppText>
            </Card>
          </Pressable>
        )}
      />
      <DebtPaymentSheet
        visible={selected != null}
        customerName={selected?.customer_name ?? ""}
        maxBalance={selected?.current_balance ?? "0"}
        amount={amount}
        returnedShells={returnedShells}
        note={note}
        loading={submitting}
        onChangeAmount={setAmount}
        onChangeReturnedShells={setReturnedShells}
        onChangeNote={setNote}
        onConfirm={() => void submitPayment()}
        onCancel={closeSheet}
      />
    </>
  );
}

/** Admin inventory from local product cache. */
export function AdminInventoryPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<(typeof products.$inferSelect)[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRows(await db.select().from(products));
  }, []);

  useAutoSyncScreen(load);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await runSyncCycle("products,sales_orders,order_notes");
      await load();
      toast.showSuccess("Đã đồng bộ kho");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Đồng bộ thất bại");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      ListEmptyComponent={<EmptyState icon="cube-outline" title="Chưa có sản phẩm" description="Kéo xuống để đồng bộ kho" actionLabel="Đồng bộ" onAction={() => void onRefresh()} />}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <View style={styles.row}>
            <AppText variant="bodyMedium">{item.name}</AppText>
            <StatusBadge label={item.stockQuantity <= 5 ? "Tồn thấp" : "OK"} tone={item.stockQuantity <= 5 ? "warning" : "success"} />
          </View>
          <AppText variant="caption" muted>
            Tồn: {item.stockQuantity} · Giá: {item.sellPrice} đ
          </AppText>
        </Card>
      )}
    />
  );
}

/** Admin users list from API. */
export function AdminUsersPanel() {
  const [rows, setRows] = useState<Array<{ username: string; role: string; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchUsers());
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Lỗi tải users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.username}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
      ListEmptyComponent={
        <EmptyState icon="people-outline" title="Không có user" description={error || "Cần quyền admin + mạng"} actionLabel="Thử lại" onAction={() => void load()} />
      }
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <View style={styles.row}>
            <View>
              <AppText variant="bodyMedium">{item.username}</AppText>
              <AppText variant="caption" muted>{item.role}</AppText>
            </View>
            <StatusBadge label={item.is_active ? "Active" : "Off"} tone={item.is_active ? "success" : "neutral"} />
          </View>
        </Card>
      )}
    />
  );
}

/** Shell debt list — orders with borrowed_shell_units from synced cache. */
export function AdminShellDebtPanel() {
  const [rows, setRows] = useState<(typeof salesOrders.$inferSelect)[]>([]);

  const load = useCallback(async () => {
    setRows(await db.select().from(salesOrders));
  }, []);

  useAutoSyncScreen(load);

  const debtors = rows.filter((o) => (o.borrowedShellUnits ?? 0) > 0);

  return (
    <FlatList
      data={debtors}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <AppText variant="caption" muted style={{ marginBottom: spacing.sm }}>
          Nợ vỏ theo đơn · tự cập nhật khi đồng bộ
        </AppText>
      }
      ListEmptyComponent={<EmptyState icon="hand-left-outline" title="Không có nợ vỏ" description="Từ cache đơn hàng local" />}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <AppText variant="bodyMedium">{item.customerName}</AppText>
          <AppText variant="caption" muted>
            Nợ vỏ: {item.borrowedShellUnits} · {item.orderCode}
          </AppText>
        </Card>
      )}
    />
  );
}

/** @deprecated Use AdminShellDebtPanel */
export const AdminCollectionPanel = AdminShellDebtPanel;

/** Daily operations snapshot from local orders + live delivery summary. */
export function AdminOperationsPanel() {
  const [orders, setOrders] = useState<(typeof salesOrders.$inferSelect)[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchDeliveryDaySummary>> | null>(null);

  const load = useCallback(async () => {
    setOrders(await db.select().from(salesOrders));
    try {
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 86400000);
        dates.push(d.toISOString().slice(0, 10));
      }
      setSummary(await fetchDeliveryDaySummary(dates.join(",")));
    } catch {
      setSummary(null);
    }
  }, []);

  useAutoSyncScreen(load);

  const inTransit = orders.filter((o) => o.deliveryStatus !== "completed").length;
  const completed = orders.length - inTransit;

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Card style={styles.card}><AppText variant="caption" muted>Đang giao</AppText><AppText variant="h2">{inTransit}</AppText></Card>
      <Card style={styles.card}><AppText variant="caption" muted>Hoàn thành (cache)</AppText><AppText variant="h2">{completed}</AppText></Card>
      <Card style={styles.card}><AppText variant="caption" muted>Tổng đơn cache</AppText><AppText variant="h2">{orders.length}</AppText></Card>
      {summary ? (
        <Card style={styles.card}>
          <AppText variant="bodyMedium">Tóm tắt giao (7 ngày · live API)</AppText>
          <AppText variant="caption" muted>
            {summary.orders.length} đơn · {Number(summary.total_amount).toLocaleString("vi-VN")} đ · {summary.total_line_quantity} chai
          </AppText>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: { marginBottom: spacing.sm, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
