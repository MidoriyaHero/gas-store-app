import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import { router } from "expo-router";
import { eq } from "drizzle-orm";
import { Ionicons } from "@expo/vector-icons";

import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { db } from "@/db/client";
import { orderNotes, salesOrders } from "@/db/schema";
import { resolveDeliveryTarget } from "@/lib/order-location";
import { parseOrderPayload } from "@/lib/order-payload";
import { newClientId } from "@/lib/ids";
import { runSyncCycle } from "@/sync/engine";
import { enqueueMutation } from "@/sync/outbox";
import { enqueueSalesOrderPatch } from "@/lib/order-patch";
import { openGoogleMapsDirections, openPhoneDialer } from "@/utils/maps";
import { colors, spacing } from "@/theme/tokens";

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

type Props = { orderId: number };

/** Order detail with inline notes, external maps, and confirm complete. */
export function StaffOrderDetailPanel({ orderId }: Props) {
  const toast = useToast();
  const [order, setOrder] = useState<(typeof salesOrders.$inferSelect) | null>(null);
  const [notes, setNotes] = useState<(typeof orderNotes.$inferSelect)[]>([]);
  const [draft, setDraft] = useState("");
  const [busyComplete, setBusyComplete] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [openingMaps, setOpeningMaps] = useState(false);

  const deliveryTarget = useMemo(() => (order ? resolveDeliveryTarget(order) : null), [order]);
  const payload = order ? parseOrderPayload(order.payloadJson) : {};
  const lineItems = (payload.order_items as Array<{ product_name: string; quantity: number; subtotal: string | number }> | undefined) ?? [];

  const load = useCallback(async () => {
    const rows = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
    setOrder(rows[0] ?? null);
    setNotes(await db.select().from(orderNotes).where(eq(orderNotes.salesOrderId, orderId)));
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function completeDelivery() {
    if (!order) return;
    setBusyComplete(true);
    try {
      await enqueueSalesOrderPatch(order, { delivery_status: "completed" });
      await runSyncCycle();
      setConfirmOpen(false);
      toast.showSuccess("Hoàn thành giao — đã đồng bộ");
      await load();
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không đồng bộ được đơn");
    } finally {
      setBusyComplete(false);
    }
  }

  async function saveTextNote() {
    const text = draft.trim();
    if (!text || !order) return;
    setSavingNote(true);
    try {
      const clientId = newClientId();
      const now = new Date().toISOString();
      await db.insert(orderNotes).values({
        clientId,
        salesOrderId: order.id,
        title: `Ghi chú ${order.orderCode}`,
        rawText: text,
        uploadStatus: "pending",
        updatedAt: now,
      });
      await enqueueMutation({
        entity: "order_note",
        operation: "create",
        clientId,
        payload: { title: `Ghi chú ${order.orderCode}`, raw_text: text },
      });
      setDraft("");
      await runSyncCycle();
      await load();
      toast.showSuccess("Đã lưu ghi chú");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Lưu ghi chú thất bại");
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleVoice() {
    if (isRecording && recording) {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri || !order) return;
      try {
        const clientId = newClientId();
        const now = new Date().toISOString();
        await db.insert(orderNotes).values({
          clientId,
          salesOrderId: order.id,
          title: `Voice ${order.orderCode}`,
          voicePath: uri,
          mimeType: "audio/mp4",
          uploadStatus: "pending",
          updatedAt: now,
        });
        await runSyncCycle();
        await load();
        toast.showSuccess("Đã lưu ghi âm");
      } catch (e) {
        toast.showError(e instanceof Error ? e.message : "Lưu ghi âm thất bại");
      }
      return;
    }

    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      toast.showError("Cần quyền micro để ghi âm");
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    setRecording(rec);
    setIsRecording(true);
  }

  async function onDirections() {
    if (!deliveryTarget) return;
    setOpeningMaps(true);
    try {
      const ok = await openGoogleMapsDirections(deliveryTarget.destination);
      if (!ok) {
        toast.showError("Không mở được Google Maps trên thiết bị này");
      }
    } finally {
      setOpeningMaps(false);
    }
  }

  async function onCall() {
    if (!order?.phone) return;
    const ok = await openPhoneDialer(order.phone);
    if (!ok) {
      toast.showError("Không gọi được — thử trên máy thật (emulator thường không có Phone app)");
    }
  }

  if (!order) {
    return (
      <View style={styles.missing}>
        <AppText variant="body" muted>
          Không tìm thấy đơn #{orderId}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="mono" style={{ color: colors.primary }}>
              {order.orderCode}
            </AppText>
            <AppText variant="h3">{order.customerName}</AppText>
            {order.phone ? (
              <AppText variant="caption" muted>
                {order.phone}
              </AppText>
            ) : null}
          </View>
          <StatusBadge label={deliveryLabel(order.deliveryStatus)} tone={deliveryTone(order.deliveryStatus)} />
        </View>

        <AppText variant="caption" style={styles.sectionH}>
          Địa chỉ giao
        </AppText>
        {deliveryTarget ? (
          <>
            <AppText variant="body">{deliveryTarget.label}</AppText>
            <AppText variant="caption" muted>
              {deliveryTarget.hasGps ? "GPS có sẵn" : "Chưa có GPS — dùng địa chỉ"}
            </AppText>
          </>
        ) : (
          <AppText variant="caption" style={{ color: colors.warning }}>
            Chưa có địa chỉ / tọa độ
          </AppText>
        )}

        <View style={styles.actionRow}>
          <Button
            label="Gọi"
            variant="secondary"
            disabled={!order.phone}
            onPress={() => void onCall()}
            style={styles.halfBtn}
          />
          <Button
            label="Chỉ đường"
            variant="secondary"
            loading={openingMaps}
            disabled={!deliveryTarget}
            onPress={() => void onDirections()}
            style={styles.halfBtn}
          />
        </View>

        <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
          {order.total} đ
          {order.deliveryDate ? ` · ${order.deliveryDate}` : ""}
          {payload.payment_mode ? ` · ${String(payload.payment_mode)}` : ""}
        </AppText>
        {Number(order.borrowedShellUnits ?? 0) > 0 ? (
          <AppText variant="caption" muted>Nợ vỏ: {order.borrowedShellUnits} bình</AppText>
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
      </Card>

      <View style={styles.section}>
        <AppText variant="bodyMedium">Ghi chú giao hàng</AppText>
        <Card style={styles.compose}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ghi chú cho đơn này..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.input}
          />
          <View style={styles.composeActions}>
            <Pressable
              onPress={() => void toggleVoice()}
              style={[styles.micBtn, isRecording && styles.micBtnRec]}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? "Dừng ghi âm" : "Ghi âm"}
            >
              <Ionicons name={isRecording ? "stop" : "mic"} size={22} color={isRecording ? colors.error : colors.primary} />
            </Pressable>
            <Button label="Lưu" variant="accent" loading={savingNote} onPress={() => void saveTextNote()} style={{ flex: 1 }} />
          </View>
          {isRecording ? (
            <AppText variant="caption" style={{ color: colors.error, fontFamily: "Inter_600SemiBold" }}>
              REC
            </AppText>
          ) : null}
        </Card>

        {notes.map((note) => (
          <Card key={note.clientId} style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <AppText variant="bodyMedium">{note.title ?? "Ghi chú"}</AppText>
              <StatusBadge
                label={note.uploadStatus === "pending" ? "Chờ gửi" : note.uploadStatus ?? "—"}
                tone={note.uploadStatus === "pending" ? "warning" : "success"}
              />
            </View>
            {note.rawText ? (
              <AppText variant="body" muted style={{ marginTop: spacing.xs }}>
                {note.rawText}
              </AppText>
            ) : null}
            {note.voicePath ? (
              <View style={styles.voiceRow}>
                <Ionicons name="volume-high-outline" size={18} color={colors.primary} />
                <AppText variant="caption" muted>
                  Ghi âm đã lưu offline
                </AppText>
              </View>
            ) : null}
          </Card>
        ))}
      </View>

      {order.deliveryStatus !== "completed" ? (
        <View style={styles.footer}>
          <Button label="Hoàn thành giao" variant="accent" fullWidth onPress={() => setConfirmOpen(true)} />
        </View>
      ) : null}

      <ConfirmSheet
        visible={confirmOpen}
        title="Xác nhận hoàn thành?"
        message="Đơn sẽ chuyển trạng thái hoàn thành và đồng bộ lên server."
        confirmLabel="Hoàn thành giao"
        loading={busyComplete}
        onConfirm={() => void completeDelivery()}
        onCancel={() => setConfirmOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.xs },
  headerRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  sectionH: { marginTop: spacing.sm, color: colors.textMuted, textTransform: "uppercase", fontFamily: "Inter_600SemiBold" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  halfBtn: { flex: 1 },
  section: { gap: spacing.xs },
  missing: { padding: spacing.lg },
  compose: { gap: spacing.sm, marginBottom: spacing.sm },
  input: {
    minHeight: 72,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
  },
  composeActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  micBtnRec: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  noteCard: { marginBottom: spacing.sm },
  noteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  footer: { marginTop: spacing.sm },
});
