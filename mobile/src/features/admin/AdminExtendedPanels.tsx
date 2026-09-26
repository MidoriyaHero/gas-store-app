import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";

import {
  createCylinderTemplate,
  createProduct,
  createStockReceipt,
  createUser,
  deleteCylinderTemplate,
  deleteProduct,
  deleteUser,
  fetchCylinderTemplatesAll,
  fetchDebtOrderDetail,
  fetchDebtOrders,
  fetchGasLedger,
  fetchProductsList,
  fetchStockReceipts,
  fetchTaxReport,
  fetchUsers,
  patchCylinderTemplate,
  patchProduct,
  patchUser,
} from "@/api/client";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/ToastProvider";
import { openAuthenticatedExport } from "@/lib/export-open";
import { isOnline } from "@/lib/network";
import { runSyncCycle } from "@/sync/engine";
import { colors, spacing } from "@/theme/tokens";

type DebtRow = {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  delivery_date: string | null;
  outstanding_amount: string;
};

/** Live debt collection queue (web /doi-no parity). */
export function AdminDebtCollectionPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchDebtOrderDetail>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDebtOrders();
      setRows(
        data
          .filter((r) => Number(r.outstanding_amount) > 0)
          .sort((a, b) => Number(b.outstanding_amount) - Number(a.outstanding_amount)),
      );
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải công nợ");
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      return;
    }
    void fetchDebtOrderDetail(detailId)
      .then(setDetail)
      .catch((e) => toast.showError(e instanceof Error ? e.message : "Không mở chi tiết"));
  }, [detailId, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q)
        || (r.phone ?? "").includes(q)
        || r.order_code.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <AppText variant="caption" muted>
              Danh sách thu nợ tiền · live API
            </AppText>
            <TextField value={search} onChangeText={setSearch} placeholder="Mã đơn, tên hoặc SĐT…" />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="wallet-outline" title="Không có công nợ" description="Hoặc chưa kết nối mạng" />}
        renderItem={({ item }) => (
          <Pressable onPress={() => setDetailId(item.id)}>
            <Card style={styles.card}>
              <AppText variant="bodyMedium">{item.order_code}</AppText>
              <AppText variant="caption" muted>
                {item.customer_name} · {item.phone ?? "—"}
                {item.delivery_date ? ` · Giao ${item.delivery_date}` : ""}
              </AppText>
              <AppText variant="h3">{Number(item.outstanding_amount).toLocaleString("vi-VN")} đ</AppText>
            </Card>
          </Pressable>
        )}
      />
      <Modal visible={detailId != null} animationType="slide" onRequestClose={() => setDetailId(null)}>
        <ScrollView contentContainerStyle={styles.modal}>
          <View style={styles.modalHeader}>
            <AppText variant="h2">{detail?.order.order_code ?? "Chi tiết đơn"}</AppText>
            <Pressable onPress={() => setDetailId(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          {detail?.ledger.map((e) => (
            <Card key={e.id} style={styles.card}>
              <AppText variant="bodyMedium">{e.entry_type}</AppText>
              <AppText variant="caption" muted>{e.created_at}</AppText>
              <AppText variant="body">{Number(e.amount_signed).toLocaleString("vi-VN")} đ</AppText>
              {Number(e.returned_shell_units ?? 0) > 0 ? (
                <AppText variant="caption" muted>Vỏ trả: {e.returned_shell_units}</AppText>
              ) : null}
            </Card>
          )) ?? null}
          {detail ? (
            <Button
              label="Mở Maps"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${detail.order.customer_name} ${detail.order.phone ?? ""}`)}`,
                )
              }
            />
          ) : null}
        </ScrollView>
      </Modal>
    </>
  );
}

/** Gas ledger read-only list with CSV export. */
export function AdminGasLedgerPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchGasLedger>>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchGasLedger());
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải sổ gas");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          <Button label="Xuất sổ gas CSV" variant="secondary" onPress={() => void openAuthenticatedExport("/api/gas-ledger.csv", "gas-ledger.csv").catch((e) => toast.showError(String(e)))} />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="book-outline" title="Sổ gas trống" description="Chỉ dòng đủ thông tin kiểm kê" />}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <AppText variant="bodyMedium">{item.customer_name_and_address}</AppText>
          <AppText variant="caption" muted>
            {item.cylinder_type ?? "—"} · {item.delivery_date ?? "—"}
          </AppText>
        </Card>
      )}
    />
  );
}

/** VAT tax report for date range. */
export function AdminTaxPanel() {
  const toast = useToast();
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchTaxReport>>>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchTaxReport(from, to));
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải báo cáo thuế");
    } finally {
      setLoading(false);
    }
  }

  const total = rows.reduce((s, r) => s + Number(r.total), 0);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <TextField label="Từ ngày (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
      <TextField label="Đến ngày" value={to} onChangeText={setTo} />
      <Button label="Tải báo cáo" loading={loading} onPress={() => void load()} />
      <Button label="Xuất CSV thuế" variant="secondary" onPress={() => void openAuthenticatedExport(`/api/tax-export.csv?from=${from}&to=${to}`, "tax.csv").catch((e) => toast.showError(String(e)))} />
      <AppText variant="bodyMedium">Tổng: {total.toLocaleString("vi-VN")} đ · {rows.length} đơn</AppText>
      {rows.map((r) => (
        <Card key={r.order_code} style={styles.card}>
          <AppText variant="bodyMedium">{r.order_code} · {r.customer_name}</AppText>
          <AppText variant="caption" muted>VAT: {r.vat_amount} · Tổng: {r.total}</AppText>
        </Card>
      ))}
    </ScrollView>
  );
}

/** Product catalog CRUD (online). Stock inbound lives on the warehouse screen. */
export function AdminInventoryCrudPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchProductsList>>>([]);
  const [name, setName] = useState("");
  const [wholesale, setWholesale] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [retail, setRetail] = useState("");
  const [stock, setStock] = useState("0");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editWholesale, setEditWholesale] = useState("");
  const [editRestaurant, setEditRestaurant] = useState("");
  const [editRetail, setEditRetail] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchProductsList());
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải sản phẩm");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addProduct() {
    if (!name.trim()) {
      toast.showError("Nhập tên sản phẩm");
      return;
    }
    setAdding(true);
    try {
      await createProduct({
        name: name.trim(),
        sell_price: retail || "0",
        wholesale_price: wholesale || retail || "0",
        restaurant_price: restaurant || retail || "0",
        stock_quantity: Number(stock) || 0,
      });
      setName("");
      setWholesale("");
      setRestaurant("");
      setRetail("");
      setStock("0");
      await load();
      void runSyncCycle();
      toast.showSuccess("Đã thêm sản phẩm");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Thêm thất bại");
    } finally {
      setAdding(false);
    }
  }

  function openEdit(item: (typeof rows)[0]) {
    setEditId(item.id);
    setEditName(item.name);
    setEditRetail(String(item.sell_price));
    setEditWholesale(String(item.wholesale_price ?? item.sell_price));
    setEditRestaurant(String(item.restaurant_price ?? item.sell_price));
    setEditActive(item.is_active);
  }

  async function saveEdit() {
    if (editId == null || !editName.trim()) {
      toast.showError("Nhập tên sản phẩm");
      return;
    }
    setSavingEdit(true);
    try {
      await patchProduct(editId, {
        name: editName.trim(),
        sell_price: editRetail || "0",
        wholesale_price: editWholesale || "0",
        restaurant_price: editRestaurant || "0",
        is_active: editActive,
      });
      setEditId(null);
      await load();
      void runSyncCycle();
      toast.showSuccess("Đã cập nhật sản phẩm");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSavingEdit(false);
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
          <Card style={[styles.card, { gap: spacing.sm }]}>
            <AppText variant="bodyMedium">Thêm sản phẩm</AppText>
            <TextField label="Tên" value={name} onChangeText={setName} />
            <TextField label="Giá sỉ" value={wholesale} onChangeText={setWholesale} keyboardType="numeric" />
            <TextField label="Giá quán" value={restaurant} onChangeText={setRestaurant} keyboardType="numeric" />
            <TextField label="Giá lẻ" value={retail} onChangeText={setRetail} keyboardType="numeric" />
            <TextField label="Tồn ban đầu" value={stock} onChangeText={setStock} keyboardType="number-pad" />
            <Button label="Thêm" loading={adding} onPress={() => void addProduct()} />
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openEdit(item)}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <AppText variant="bodyMedium">{item.name}</AppText>
                <StatusBadge label={item.is_active ? "Active" : "Off"} tone={item.is_active ? "success" : "neutral"} />
              </View>
              <AppText variant="caption" muted>
                Tồn: {item.stock_quantity} · sỉ {item.wholesale_price ?? item.sell_price} · quán {item.restaurant_price ?? item.sell_price} · lẻ {item.sell_price}
              </AppText>
              <Button
                label="Xóa"
                variant="ghost"
                onPress={() => void deleteProduct(item.id).then(load).catch((e) => toast.showError(String(e)))}
              />
            </Card>
          </Pressable>
        )}
      />
      <FormBottomSheet
        visible={editId != null}
        title="Sửa sản phẩm"
        onClose={() => setEditId(null)}
        footer={
          <>
            <Button label="Lưu" loading={savingEdit} fullWidth onPress={() => void saveEdit()} />
            <Button label="Hủy" variant="ghost" fullWidth onPress={() => setEditId(null)} />
          </>
        }
      >
        <TextField label="Tên" value={editName} onChangeText={setEditName} />
        <TextField label="Giá sỉ" value={editWholesale} onChangeText={setEditWholesale} keyboardType="numeric" />
        <TextField label="Giá quán" value={editRestaurant} onChangeText={setEditRestaurant} keyboardType="numeric" />
        <TextField label="Giá lẻ" value={editRetail} onChangeText={setEditRetail} keyboardType="numeric" />
        <View style={styles.chips}>
          <FilterChip label="Đang bán" active={editActive} onPress={() => setEditActive(true)} />
          <FilterChip label="Ngừng bán" active={!editActive} onPress={() => setEditActive(false)} />
        </View>
      </FormBottomSheet>
    </>
  );
}

/** Inbound receipts only — syncs daily audit import_full. */
export function AdminWarehousePanel() {
  const toast = useToast();
  const [products, setProducts] = useState<Awaited<ReturnType<typeof fetchProductsList>>>([]);
  const [receipts, setReceipts] = useState<Awaited<ReturnType<typeof fetchStockReceipts>>>([]);
  const [pickId, setPickId] = useState<number | null>(null);
  const [qty, setQty] = useState("10");
  const [stockDate, setStockDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plist, rlist] = await Promise.all([fetchProductsList(), fetchStockReceipts()]);
      setProducts(plist);
      setReceipts(rlist);
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải kho");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmStockReceipt() {
    if (pickId == null) {
      toast.showError("Chọn sản phẩm");
      return;
    }
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      toast.showError("Nhập số lượng hợp lệ");
      return;
    }
    setSaving(true);
    try {
      await createStockReceipt(pickId, n, note.trim() || undefined, stockDate);
      setQty("10");
      setNote("");
      await load();
      void runSyncCycle();
      toast.showSuccess("Đã nhập kho");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Nhập kho thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FlatList
      data={receipts}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
      ListHeaderComponent={
        <Card style={[styles.card, { gap: spacing.sm }]}>
          <AppText variant="bodyMedium">Nhập gas</AppText>
          <AppText variant="caption" muted>
            Cộng tồn và cộng số nhập vào kiểm kê ngày phiếu.
          </AppText>
          <ScrollView horizontal contentContainerStyle={styles.chips}>
            {products.map((p) => (
              <FilterChip key={p.id} label={p.name} active={pickId === p.id} onPress={() => setPickId(p.id)} />
            ))}
          </ScrollView>
          <TextField label="Số lượng" value={qty} onChangeText={setQty} keyboardType="number-pad" />
          <TextField label="Ngày nhập (YYYY-MM-DD)" value={stockDate} onChangeText={setStockDate} />
          <TextField label="Ghi chú" value={note} onChangeText={setNote} />
          <Button label="Ghi nhận nhập" variant="accent" loading={saving} onPress={() => void confirmStockReceipt()} />
        </Card>
      }
      ListEmptyComponent={<EmptyState icon="cube-outline" title="Chưa có phiếu" description="Nhập số bình từ form trên" />}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <AppText variant="bodyMedium">
            {item.product_name ?? `#${item.product_id}`} · +{item.quantity}
          </AppText>
          <AppText variant="caption" muted>
            {item.receipt_date} · {item.receipt_kind === "opening" ? "Tồn đầu" : "Nhập"}
            {item.note ? ` · ${item.note}` : ""}
          </AppText>
        </Card>
      )}
    />
  );
}

/** User CRUD (online). */
export function AdminUsersCrudPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchUsers>>>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchUsers());
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải users");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addUser() {
    if (!username.trim() || password.length < 6) {
      toast.showError("Username và mật khẩu ≥6 ký tự");
      return;
    }
    try {
      await createUser({ username: username.trim(), password, role, is_active: true });
      setUsername("");
      setPassword("");
      await load();
      toast.showSuccess("Đã tạo user");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Tạo user thất bại");
    }
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
      ListHeaderComponent={
        <Card style={[styles.card, { gap: spacing.sm }]}>
          <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
          <TextField label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry />
          <ScrollView horizontal contentContainerStyle={styles.chips}>
            <FilterChip label="Staff" active={role === "user"} onPress={() => setRole("user")} />
            <FilterChip label="Admin" active={role === "admin"} onPress={() => setRole("admin")} />
          </ScrollView>
          <Button label="Tạo user" onPress={() => void addUser()} />
        </Card>
      }
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <View style={styles.row}>
            <AppText variant="bodyMedium">{item.username}</AppText>
            <StatusBadge label={item.role} tone="info" />
          </View>
          <Button
            label={item.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
            variant="secondary"
            onPress={() => void patchUser(item.id, { is_active: !item.is_active }).then(load)}
          />
          <Button label="Xóa" variant="ghost" onPress={() => void deleteUser(item.id).then(load).catch((e) => toast.showError(String(e)))} />
        </Card>
      )}
    />
  );
}

/** Cylinder template CRUD with view/edit bottom sheet. */
export function AdminCylinderTemplatesPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchCylinderTemplatesAll>>>([]);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formOwner, setFormOwner] = useState("");
  const [formSource, setFormSource] = useState("");
  const [formInspection, setFormInspection] = useState("");
  const [formImportDate, setFormImportDate] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchCylinderTemplatesAll());
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải mẫu chai");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTemplate() {
    if (!name.trim()) {
      toast.showError("Nhập tên mẫu");
      return;
    }
    setAdding(true);
    try {
      await createCylinderTemplate({ name: name.trim(), owner_name: owner.trim() || null, is_active: true });
      setName("");
      setOwner("");
      await load();
      toast.showSuccess("Đã thêm mẫu");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Thêm mẫu thất bại");
    } finally {
      setAdding(false);
    }
  }

  function openEdit(item: (typeof rows)[0]) {
    setEditId(item.id);
    setFormName(item.name);
    setFormOwner(item.owner_name ?? "");
    setFormSource(item.import_source ?? "");
    setFormInspection(item.inspection_expiry ?? "");
    setFormImportDate(item.import_date ?? "");
    setFormActive(item.is_active);
  }

  async function saveEdit() {
    if (editId == null || !formName.trim()) {
      toast.showError("Nhập tên mẫu");
      return;
    }
    setSaving(true);
    try {
      await patchCylinderTemplate(editId, {
        name: formName.trim(),
        owner_name: formOwner.trim() || null,
        import_source: formSource.trim() || null,
        inspection_expiry: formInspection.trim() || null,
        import_date: formImportDate.trim() || null,
        is_active: formActive,
      });
      setEditId(null);
      await load();
      toast.showSuccess("Đã lưu mẫu chai");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    const id = deleteId;
    setDeleteId(null);
    setEditId(null);
    try {
      await deleteCylinderTemplate(id);
      await load();
      toast.showSuccess("Đã xóa mẫu");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Xóa thất bại");
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
          <Card style={[styles.card, { gap: spacing.sm }]}>
            <TextField label="Tên mẫu" value={name} onChangeText={setName} />
            <TextField label="Chủ sở hữu" value={owner} onChangeText={setOwner} />
            <Button label="Thêm mẫu" loading={adding} onPress={() => void addTemplate()} />
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openEdit(item)}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <AppText variant="bodyMedium">{item.name}</AppText>
                <StatusBadge label={item.is_active ? "Active" : "Off"} tone={item.is_active ? "success" : "neutral"} />
              </View>
              <AppText variant="caption" muted>{item.owner_name ?? "—"}</AppText>
            </Card>
          </Pressable>
        )}
      />
      <FormBottomSheet
        visible={editId != null}
        title="Sửa mẫu chai"
        onClose={() => setEditId(null)}
        footer={
          <>
            <Button label="Lưu" loading={saving} fullWidth onPress={() => void saveEdit()} />
            <Button label="Xóa mẫu" variant="danger" fullWidth onPress={() => editId != null && setDeleteId(editId)} />
            <Button label="Hủy" variant="ghost" fullWidth onPress={() => setEditId(null)} />
          </>
        }
      >
        <TextField label="Tên mẫu" value={formName} onChangeText={setFormName} />
        <TextField label="Chủ sở hữu" value={formOwner} onChangeText={setFormOwner} />
        <TextField label="Nguồn nhập" value={formSource} onChangeText={setFormSource} />
        <TextField label="Hạn kiểm định (YYYY-MM-DD)" value={formInspection} onChangeText={setFormInspection} />
        <TextField label="Ngày nhập (YYYY-MM-DD)" value={formImportDate} onChangeText={setFormImportDate} />
        <View style={styles.chips}>
          <FilterChip label="Đang dùng" active={formActive} onPress={() => setFormActive(true)} />
          <FilterChip label="Ngừng dùng" active={!formActive} onPress={() => setFormActive(false)} />
        </View>
      </FormBottomSheet>
      <ConfirmSheet
        visible={deleteId != null}
        title="Xóa mẫu chai?"
        message="Mẫu sẽ bị xóa vĩnh viễn trên máy chủ."
        confirmLabel="Xóa"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: { marginBottom: spacing.sm, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  chips: { flexDirection: "row", gap: spacing.sm },
  modal: { padding: spacing.md, paddingTop: spacing.xxl, gap: spacing.sm },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
