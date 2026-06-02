import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { createOrder, fetchCylinderTemplates, fetchUsers, geocodeFromPaste, geocodeSearch } from "@/api/client";
import { AppText, SectionLabel } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterChip } from "@/components/ui/FilterChip";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import {
  lineDefaultsFromTemplate,
  localDefaultTemplate,
  type CylinderTemplateRow,
} from "@/lib/cylinder-template";
import { newClientId } from "@/lib/ids";
import { isOnline } from "@/lib/network";
import { roundCoord6, type GeocodeHit } from "@/lib/geocode";
import { resolveGoogleMapsPasteClient } from "@/lib/maps-paste";
import {
  buildCreateOrderPayload,
  computeOrderTotals,
  newCartLine,
  type CreateCartLine,
  type CreateOrderForm,
} from "@/lib/order-create";
import { runSyncCycle } from "@/sync/engine";
import { enqueueMutation } from "@/sync/outbox";
import { triggerAutoSync } from "@/sync/auto-sync";
import { formatVnd } from "@/utils/format";
import { openGoogleMapsSearch } from "@/utils/maps";
import { colors, radius, spacing, typography } from "@/theme/tokens";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Two-step admin create order form (online POST or offline outbox). */
export function AdminCreateOrderPanel() {
  const toast = useToast();
  const params = useLocalSearchParams<{
    phone?: string;
    customerName?: string;
    address?: string;
    lat?: string;
    lng?: string;
  }>();
  const prefillApplied = useRef(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [productRows, setProductRows] = useState<(typeof products.$inferSelect)[]>([]);
  const [staff, setStaff] = useState<Array<{ id: number; username: string }>>([]);
  const [templates, setTemplates] = useState<CylinderTemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [pickProductId, setPickProductId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [cart, setCart] = useState<CreateCartLine[]>([]);
  const [mapPasteRaw, setMapPasteRaw] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoHits, setGeoHits] = useState<GeocodeHit[]>([]);
  const [form, setForm] = useState<CreateOrderForm>({
    customerName: "",
    phone: "",
    address: "",
    deliveryLatitude: null,
    deliveryLongitude: null,
    note: "",
    deliveryDate: todayIso(),
    assignedToUserId: "",
    paymentMode: "cash",
    paidAmount: 0,
    vatRate: 0,
    borrowedShellUnits: 0,
  });

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const totals = useMemo(
    () => computeOrderTotals(cart, form.vatRate, form.paymentMode, form.paidAmount),
    [cart, form.vatRate, form.paymentMode, form.paidAmount],
  );

  const load = useCallback(async () => {
    setProductRows(await db.select().from(products));
    try {
      const users = await fetchUsers();
      setStaff(users.filter((u) => u.is_active && u.role === "user"));
    } catch {
      setStaff([]);
    }
    try {
      if (await isOnline()) {
        const tpl = await fetchCylinderTemplates();
        setTemplates(tpl.filter((t) => t.is_active));
      }
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (prefillApplied.current) return;
    const phone = typeof params.phone === "string" ? params.phone : "";
    const customerName = typeof params.customerName === "string" ? params.customerName : "";
    const address = typeof params.address === "string" ? params.address : "";
    const latRaw = typeof params.lat === "string" ? params.lat : "";
    const lngRaw = typeof params.lng === "string" ? params.lng : "";
    if (!phone && !customerName && !address) return;

    prefillApplied.current = true;
    setForm((f) => ({
      ...f,
      ...(phone ? { phone } : {}),
      ...(customerName ? { customerName } : {}),
      ...(address ? { address } : {}),
      ...(latRaw && lngRaw
        ? { deliveryLatitude: Number(latRaw), deliveryLongitude: Number(lngRaw) }
        : {}),
    }));
  }, [params]);

  function patchForm(partial: Partial<CreateOrderForm>) {
    setForm((f) => ({ ...f, ...partial }));
  }

  function applyGeocodeHit(hit: GeocodeHit) {
    patchForm({
      address: hit.display_name,
      deliveryLatitude: roundCoord6(hit.lat),
      deliveryLongitude: roundCoord6(hit.lng),
    });
    setGeoHits([]);
  }

  /** Geocode typed address or open Google Maps to pick a point. */
  async function searchAddressOnMaps() {
    const q = form.address.trim();
    if (q) {
      setGeoLoading(true);
      try {
        if (!(await isOnline())) {
          toast.showError("Cần mạng để tìm vị trí");
          return;
        }
        const hits = await geocodeSearch(q);
        if (hits.length === 0) {
          toast.showError("Không tìm thấy — thử dán link Google Maps");
          return;
        }
        if (hits.length === 1) {
          applyGeocodeHit(hits[0]!);
          toast.showSuccess("Đã ghim vị trí");
        } else {
          setGeoHits(hits);
        }
      } catch (e) {
        toast.showError(e instanceof Error ? e.message : "Tìm vị trí thất bại");
      } finally {
        setGeoLoading(false);
      }
      return;
    }

    const opened = await openGoogleMapsSearch("");
    if (opened) {
      toast.showSuccess("Chọn điểm trên Maps → copy link → dán bên dưới → Áp dụng");
    } else {
      toast.showError("Không mở được Google Maps");
    }
  }

  /** Apply pasted Google Maps link / Plus Code / coordinates. */
  async function applyMapPaste() {
    const paste = mapPasteRaw.trim();
    if (!paste) {
      toast.showError("Dán link hoặc tọa độ Google Maps");
      return;
    }
    setGeoLoading(true);
    try {
      if (!(await isOnline())) {
        toast.showError("Cần mạng để đọc link Google Maps");
        return;
      }
      const isMapsUrl = /https?:\/\/|maps\.app\.goo|goo\.gl/i.test(paste);
      let hit: GeocodeHit | null = null;
      if (isMapsUrl) {
        hit = await resolveGoogleMapsPasteClient(paste);
      }
      if (!hit) {
        hit = await geocodeFromPaste(paste);
      }
      applyGeocodeHit(hit);
      toast.showSuccess("Đã lấy vị trí từ Google Maps");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không đọc được link Maps");
    } finally {
      setGeoLoading(false);
    }
  }

  const hasPin = form.deliveryLatitude != null && form.deliveryLongitude != null;
  const locationHint = hasPin
    ? `✓ Đã ghim: ${form.deliveryLatitude!.toFixed(6)}, ${form.deliveryLongitude!.toFixed(6)}`
    : "Chưa có tọa độ — dùng Maps để staff chỉ đường chính xác";

  function goStep2() {
    if (!form.customerName.trim()) {
      toast.showError("Nhập tên khách hàng");
      return;
    }
    if (!form.phone.trim()) {
      toast.showError("Nhập số điện thoại");
      return;
    }
    if (productRows.length === 0) {
      toast.showError("Chưa có sản phẩm — kéo đồng bộ kho trước");
      return;
    }
    setStep(2);
  }

  function addLine() {
    const p = productRows.find((x) => String(x.id) === pickProductId);
    if (!p) {
      toast.showError("Chọn sản phẩm");
      return;
    }
    const qty = Math.max(1, Number(pickQty) || 1);
    const defaults = lineDefaultsFromTemplate(selectedTemplate);
    setCart((prev) => [...prev, newCartLine(p, qty, defaults)]);
    setPickProductId("");
    setPickQty("1");
  }

  function updateLine(lineKey: string, patch: Partial<CreateCartLine>) {
    setCart((prev) => prev.map((row) => (row.lineKey === lineKey ? { ...row, ...patch } : row)));
  }

  function removeLine(lineKey: string) {
    setCart((prev) => prev.filter((r) => r.lineKey !== lineKey));
  }

  async function submit() {
    if (cart.length === 0) {
      toast.showError("Thêm ít nhất 1 sản phẩm");
      return;
    }
    setSaving(true);
    const payload = buildCreateOrderPayload(form, cart);
    try {
      if (await isOnline()) {
        const created = await createOrder(payload);
        await runSyncCycle();
        toast.showSuccess(`Đã tạo ${created.order_code}`);
        router.replace(`/(admin)/order/${created.id}` as Href);
      } else {
        const clientId = newClientId();
        await enqueueMutation({
          entity: "sales_order",
          operation: "create",
          clientId,
          payload,
        });
        void triggerAutoSync("create-order-offline");
        toast.showSuccess("Đã xếp hàng — tự đồng bộ khi có mạng");
        router.back();
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Tạo đơn thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="caption" muted style={styles.stepLabel}>
          Bước {step}/2 · {step === 1 ? "Khách & giao" : "Hàng & thanh toán"}
        </AppText>

        {step === 1 ? (
          <Card style={styles.card}>
            <Button
              label="Chọn từ cuộc gọi"
              variant="accent"
              onPress={() => router.push("/(admin)/order/from-calls" as Href)}
              style={styles.callPickBtn}
            />
            <TextField label="Tên khách *" value={form.customerName} onChangeText={(v) => patchForm({ customerName: v })} />
            <TextField label="Số điện thoại *" value={form.phone} onChangeText={(v) => patchForm({ phone: v })} keyboardType="phone-pad" />
            <View style={styles.addressBlock}>
              <AppText variant="label" style={styles.fieldLabel}>
                Địa chỉ giao
              </AppText>
              <View style={styles.addressInputRow}>
                <TextInput
                  accessibilityLabel="Địa chỉ giao"
                  placeholder="Số nhà, đường, phường…"
                  placeholderTextColor={colors.textMuted}
                  value={form.address}
                  onChangeText={(v) => patchForm({ address: v })}
                  style={styles.addressInput}
                />
                <Pressable
                  style={[styles.mapBtn, geoLoading ? styles.mapBtnDisabled : null]}
                  onPress={() => void searchAddressOnMaps()}
                  disabled={geoLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Lấy vị trí từ Google Maps"
                >
                  <Ionicons name="map-outline" size={20} color={colors.primary} />
                  <AppText variant="caption" style={styles.mapBtnLabel}>
                    {geoLoading ? "…" : "Maps"}
                  </AppText>
                </Pressable>
              </View>
              <AppText variant="caption" style={hasPin ? styles.pinOk : styles.pinMuted}>
                {locationHint}
              </AppText>
            </View>
            <View style={styles.pasteBox}>
              <AppText variant="caption" style={styles.pasteLabel}>
                Dán từ Google Maps (link, Plus Code, tọa độ)
              </AppText>
              <View style={styles.pasteRow}>
                <TextInput
                  accessibilityLabel="Dán link Google Maps"
                  placeholder="maps.app.goo.gl/…"
                  placeholderTextColor={colors.textMuted}
                  value={mapPasteRaw}
                  onChangeText={setMapPasteRaw}
                  style={styles.pasteInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  label="Áp dụng"
                  variant="secondary"
                  loading={geoLoading}
                  onPress={() => void applyMapPaste()}
                  style={styles.applyBtn}
                />
              </View>
            </View>
            {geoHits.map((hit) => (
              <Pressable key={hit.place_id} style={styles.geoHit} onPress={() => applyGeocodeHit(hit)}>
                <AppText variant="caption">{hit.display_name}</AppText>
              </Pressable>
            ))}
            <TextField label="Ghi chú" value={form.note} onChangeText={(v) => patchForm({ note: v })} multiline />
            <TextField label="Ngày giao (YYYY-MM-DD)" value={form.deliveryDate} onChangeText={(v) => patchForm({ deliveryDate: v })} />
            <SectionLabel>Nhân viên giao</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <FilterChip label="Không assign" active={!form.assignedToUserId} onPress={() => patchForm({ assignedToUserId: "" })} />
              {staff.map((u) => (
                <FilterChip
                  key={u.id}
                  label={u.username}
                  active={form.assignedToUserId === String(u.id)}
                  onPress={() => patchForm({ assignedToUserId: String(u.id) })}
                />
              ))}
            </ScrollView>
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <SectionLabel>Mẫu thông tin chai</SectionLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <FilterChip label="Mặc định" active={!selectedTemplateId} onPress={() => setSelectedTemplateId("")} />
                {templates.map((t) => (
                  <FilterChip
                    key={t.id}
                    label={t.name}
                    active={selectedTemplateId === String(t.id)}
                    onPress={() => setSelectedTemplateId(String(t.id))}
                  />
                ))}
              </ScrollView>
              <AppText variant="caption" muted>
                Chủ mặc định: {lineDefaultsFromTemplate(selectedTemplate ?? localDefaultTemplate()).owner_name}
              </AppText>
              <View style={styles.addRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Sản phẩm"
                    value={pickProductId}
                    onChangeText={setPickProductId}
                    placeholder="Nhập ID SP (chọn chip bên dưới)"
                  />
                </View>
                <View style={styles.qtyCol}>
                  <TextField label="SL" value={pickQty} onChangeText={setPickQty} keyboardType="number-pad" />
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {productRows.map((p) => (
                  <FilterChip
                    key={p.id}
                    label={`${p.name} (${p.stockQuantity})`}
                    active={pickProductId === String(p.id)}
                    onPress={() => setPickProductId(String(p.id))}
                  />
                ))}
              </ScrollView>
              <Button label="Thêm dòng" variant="secondary" onPress={addLine} />
            </Card>

            {cart.map((line) => (
              <Card key={line.lineKey} style={styles.card}>
                <View style={styles.lineHeader}>
                  <AppText variant="bodyMedium">{line.name} × {line.quantity}</AppText>
                  <Button label="Xóa" variant="ghost" onPress={() => removeLine(line.lineKey)} />
                </View>
                <TextField label="Chủ sở hữu" value={line.owner_name} onChangeText={(v) => updateLine(line.lineKey, { owner_name: v })} />
                <TextField
                  label="Số seri (tuỳ chọn)"
                  value={line.cylinder_serial}
                  onChangeText={(v) => updateLine(line.lineKey, { cylinder_serial: v })}
                />
                <TextField
                  label="Nơi nhập chai chứa cho cửa hàng"
                  value={line.import_source}
                  onChangeText={(v) => updateLine(line.lineKey, { import_source: v })}
                />
                <TextField
                  label="Hạn kiểm định (YYYY-MM-DD)"
                  value={line.inspection_expiry}
                  onChangeText={(v) => updateLine(line.lineKey, { inspection_expiry: v })}
                />
                <TextField
                  label="Ngày nhập (YYYY-MM-DD)"
                  value={line.import_date}
                  onChangeText={(v) => updateLine(line.lineKey, { import_date: v })}
                />
                <AppText variant="caption" muted>{formatVnd(line.unit_price * line.quantity)}</AppText>
              </Card>
            ))}

            <Card style={styles.card}>
              <SectionLabel>Thanh toán</SectionLabel>
              <View style={styles.chips}>
                <FilterChip label="Tiền mặt" active={form.paymentMode === "cash"} onPress={() => patchForm({ paymentMode: "cash" })} />
                <FilterChip label="Công nợ" active={form.paymentMode === "debt"} onPress={() => patchForm({ paymentMode: "debt" })} />
                <FilterChip label="Một phần" active={form.paymentMode === "partial"} onPress={() => patchForm({ paymentMode: "partial" })} />
              </View>
              {form.paymentMode === "partial" ? (
                <TextField
                  label="Đã thu (đ)"
                  value={String(form.paidAmount)}
                  onChangeText={(v) => patchForm({ paidAmount: Number(v.replace(/[^\d.-]/g, "")) || 0 })}
                  keyboardType="decimal-pad"
                />
              ) : null}
              <TextField
                label="Nợ vỏ (bình)"
                value={String(form.borrowedShellUnits)}
                onChangeText={(v) => patchForm({ borrowedShellUnits: Number(v) || 0 })}
                keyboardType="number-pad"
              />
              <View style={styles.totalRow}>
                <AppText variant="caption" muted>VAT {form.vatRate}%</AppText>
                <AppText variant="h3">{formatVnd(totals.total)}</AppText>
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 2 ? (
          <Button label="Quay lại" variant="ghost" onPress={() => setStep(1)} style={styles.footerBtn} />
        ) : null}
        {step === 1 ? (
          <Button label="Tiếp theo" variant="accent" onPress={goStep2} style={styles.footerBtn} />
        ) : (
          <Button label="Tạo đơn" variant="accent" loading={saving} onPress={() => void submit()} style={styles.footerBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollView: { flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  stepLabel: { marginBottom: spacing.xs },
  card: { gap: spacing.sm },
  callPickBtn: { marginBottom: spacing.xs },
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  qtyCol: { width: 72 },
  lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalRow: { marginTop: spacing.sm, gap: 4 },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerBtn: { flex: 1 },
  addressBlock: { gap: spacing.sm },
  fieldLabel: { color: colors.textSecondary },
  addressInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  addressInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
  },
  mapBtn: {
    width: 56,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  mapBtnDisabled: { opacity: 0.6 },
  mapBtnLabel: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
  pinOk: { color: colors.success },
  pinMuted: { color: colors.textMuted },
  pasteBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  pasteLabel: { color: colors.textMuted, fontFamily: "Inter_600SemiBold" },
  pasteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pasteInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 40,
    fontSize: 13,
  },
  applyBtn: { minWidth: 88, paddingHorizontal: spacing.sm },
  geoHit: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
