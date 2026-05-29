import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { eq, isNull } from "drizzle-orm";

import { API_BASE_URL } from "@/config";
import { deleteOrderNote, fetchOrderNotes } from "@/api/client";
import { getAccessToken } from "@/auth/session";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { orderNotes, outbox } from "@/db/schema";
import { useVoiceNoteRecorder } from "@/hooks/useVoiceNoteRecorder";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { newClientId } from "@/lib/ids";
import { runSyncCycle } from "@/sync/engine";
import { discardOutboxRow, enqueueMutation } from "@/sync/outbox";
import { formatDateTime } from "@/utils/format";
import { colors, spacing } from "@/theme/tokens";

interface DisplayNote {
  key: string;
  clientId?: string;
  serverId?: number;
  noteType: "text" | "voice";
  rawText?: string;
  voicePath?: string;
  audioUrl?: string;
  voiceDurationSec?: number;
  updatedAt: string;
}

/** Global delivery notes — local-first text/voice, background sync (web /ghi-chu-giao parity). */
export function StaffNotesPanel() {
  const toast = useToast();
  const voice = useVoiceNoteRecorder();
  const [rows, setRows] = useState<DisplayNote[]>([]);
  const [draft, setDraft] = useState("");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DisplayNote | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const local = await db.select().from(orderNotes).where(isNull(orderNotes.salesOrderId));
      const localServerIds = new Set(local.map((n) => n.serverId).filter((id): id is number => id != null));
      const merged: DisplayNote[] = local.map(localToDisplay);

      try {
        const apiRows = await fetchOrderNotes(false);
        for (const row of apiRows) {
          if (!localServerIds.has(row.id)) {
            merged.push({
              key: `srv-${row.id}`,
              serverId: row.id,
              noteType: row.note_type === "voice" || row.audio_url ? "voice" : "text",
              rawText: row.raw_text ?? undefined,
              audioUrl: row.audio_url ?? undefined,
              updatedAt: row.created_at,
            });
          }
        }
      } catch {
        /* offline — local only */
      }

      merged.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      setRows(merged);
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không tải ghi chú");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useAutoSyncScreen(load);

  useEffect(() => {
    return () => {
      void sound?.unloadAsync();
    };
  }, [sound]);

  function resetDraft() {
    setDraft("");
    setEditingClientId(null);
    setEditingServerId(null);
  }

  async function saveTextNote() {
    const text = draft.trim();
    if (!text) {
      toast.showError("Nhập nội dung ghi chú");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingServerId != null) {
        await db
          .update(orderNotes)
          .set({ rawText: text, updatedAt: now })
          .where(eq(orderNotes.serverId, editingServerId));
        await enqueueMutation({
          entity: "order_note",
          operation: "update",
          serverId: editingServerId,
          payload: { raw_text: text },
        });
      } else if (editingClientId) {
        await db.update(orderNotes).set({ rawText: text, updatedAt: now }).where(eq(orderNotes.clientId, editingClientId));
        await patchOutboxCreatePayload(editingClientId, text);
      } else {
        const clientId = newClientId();
        await db.insert(orderNotes).values({
          clientId,
          title: "Ghi chú giao",
          rawText: text,
          uploadStatus: "pending",
          updatedAt: now,
        });
        await enqueueMutation({
          entity: "order_note",
          operation: "create",
          clientId,
          payload: { title: "Ghi chú giao", raw_text: text },
        });
      }
      resetDraft();
      await load();
      toast.showSuccess(editingServerId || editingClientId ? "Đã cập nhật ghi chú" : "Đã lưu ghi chú");
      void runSyncCycle();
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function saveVoiceNote() {
    setSaving(true);
    try {
      const result = await voice.stop();
      if (!result) return;
      const clientId = newClientId();
      const now = new Date().toISOString();
      await db.insert(orderNotes).values({
        clientId,
        title: "Ghi chú giao",
        voicePath: result.uri,
        mimeType: result.mimeType,
        voiceDurationSec: result.durationSec,
        uploadStatus: "pending",
        updatedAt: now,
      });
      await load();
      toast.showSuccess("Đã lưu ghi âm");
      void runSyncCycle();
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Lưu ghi âm thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function startRecording() {
    const ok = await voice.start();
    if (!ok) toast.showError("Cần quyền micro để ghi âm");
  }

  async function playVoice(note: DisplayNote) {
    try {
      await sound?.unloadAsync();
      if (note.voicePath) {
        const { sound: s } = await Audio.Sound.createAsync({ uri: note.voicePath }, { shouldPlay: true });
        setSound(s);
        return;
      }
      if (!note.audioUrl) return;
      const token = await getAccessToken();
      const uri = note.audioUrl.startsWith("http") ? note.audioUrl : `${API_BASE_URL}${note.audioUrl}`;
      const { sound: s } = await Audio.Sound.createAsync(
        { uri, headers: token ? { Authorization: `Bearer ${token}` } : undefined },
        { shouldPlay: true },
      );
      setSound(s);
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Không phát được ghi âm");
    }
  }

  async function confirmDelete() {
    const note = deleteTarget;
    setDeleteTarget(null);
    if (!note) return;
    try {
      if (note.clientId) {
        await db.delete(orderNotes).where(eq(orderNotes.clientId, note.clientId));
        const pending = await db.select().from(outbox);
        for (const row of pending) {
          if (row.clientId === note.clientId) await discardOutboxRow(row.id);
        }
      }
      if (note.serverId) {
        try {
          await deleteOrderNote(note.serverId);
        } catch {
          /* offline — local already removed if matched clientId */
        }
        await db.delete(orderNotes).where(eq(orderNotes.serverId, note.serverId));
      }
      if (editingServerId === note.serverId || editingClientId === note.clientId) resetDraft();
      await load();
      toast.showSuccess("Đã xóa ghi chú");
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : "Xóa thất bại");
    }
  }

  const isEditing = editingClientId != null || editingServerId != null;

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              void load();
              void runSyncCycle();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Card style={styles.compose}>
              <TextField
                label={isEditing ? "Sửa ghi chú" : "Ghi chú mới"}
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder="Nhập ghi chú giao hàng…"
              />
              <View style={styles.composeActions}>
                <Button
                  label={isEditing ? "Cập nhật" : "Lưu ghi chú"}
                  loading={saving && !voice.isRecording}
                  onPress={() => void saveTextNote()}
                />
                {isEditing ? <Button label="Ghi chú mới" variant="secondary" onPress={resetDraft} /> : null}
              </View>
              <View style={styles.voiceSection}>
                <AppText variant="caption" muted>
                  Ghi âm nhanh
                </AppText>
                {voice.isRecording ? (
                  <View style={styles.row}>
                    <Button label="Dừng & lưu" loading={saving} onPress={() => void saveVoiceNote()} />
                    <Button label="Hủy ghi" variant="ghost" onPress={() => void voice.cancel()} />
                  </View>
                ) : (
                  <Button label="Bắt đầu ghi" variant="secondary" onPress={() => void startRecording()} />
                )}
              </View>
            </Card>
            <AppText variant="bodyMedium" style={styles.listTitle}>
              Danh sách
            </AppText>
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="document-text-outline" title="Chưa có ghi chú" description="Tạo ghi chú mới phía trên" />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHead}>
              <StatusBadge label={item.noteType === "voice" ? "Ghi âm" : "Chữ"} tone={item.noteType === "voice" ? "info" : "neutral"} />
              <AppText variant="caption" muted>
                {formatDateTime(item.updatedAt)}
                {item.voiceDurationSec ? ` · ${item.voiceDurationSec}s` : ""}
              </AppText>
            </View>
            {item.rawText ? <AppText variant="body">{item.rawText}</AppText> : null}
            {item.noteType === "voice" ? (
              <Pressable style={styles.voiceRow} onPress={() => void playVoice(item)}>
                <Ionicons name="play-circle-outline" size={22} color={colors.primary} />
                <AppText variant="caption">Phát ghi âm</AppText>
              </Pressable>
            ) : null}
            {item.noteType === "text" ? (
              <View style={styles.row}>
                <Button
                  label="Sửa"
                  variant="secondary"
                  onPress={() => {
                    setEditingClientId(item.clientId ?? null);
                    setEditingServerId(item.serverId ?? null);
                    setDraft(item.rawText ?? "");
                  }}
                />
                <Button label="Xóa" variant="ghost" onPress={() => setDeleteTarget(item)} />
              </View>
            ) : (
              <Button label="Xóa" variant="ghost" onPress={() => setDeleteTarget(item)} />
            )}
          </Card>
        )}
      />
      <ConfirmSheet
        visible={deleteTarget != null}
        title="Xóa ghi chú?"
        message="Ghi chú sẽ bị xóa khỏi thiết bị và máy chủ (khi có mạng)."
        confirmLabel="Xóa"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

/** Map local SQLite row to list item. */
function localToDisplay(n: typeof orderNotes.$inferSelect): DisplayNote {
  return {
    key: n.clientId,
    clientId: n.clientId,
    serverId: n.serverId ?? undefined,
    noteType: n.voicePath ? "voice" : "text",
    rawText: n.rawText ?? undefined,
    voicePath: n.voicePath ?? undefined,
    voiceDurationSec: n.voiceDurationSec ?? undefined,
    updatedAt: n.updatedAt,
  };
}

/** Update pending outbox create payload when local draft is edited before sync. */
async function patchOutboxCreatePayload(clientId: string, rawText: string): Promise<void> {
  const rows = await db.select().from(outbox);
  for (const row of rows) {
    if (row.entity !== "order_note" || row.clientId !== clientId || row.operation !== "create") continue;
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    await db
      .update(outbox)
      .set({ payloadJson: JSON.stringify({ ...payload, raw_text: rawText }) })
      .where(eq(outbox.id, row.id));
  }
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  headerBlock: { gap: spacing.sm, marginBottom: spacing.sm },
  compose: { gap: spacing.sm },
  composeActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  voiceSection: { gap: spacing.xs, marginTop: spacing.xs },
  listTitle: { fontFamily: "Inter_600SemiBold" },
  card: { marginBottom: spacing.sm, gap: spacing.xs },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
