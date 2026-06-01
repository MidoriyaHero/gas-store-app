import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { eq, isNull } from "drizzle-orm";

import { deleteOrderNote, fetchOrderNotes } from "@/api/client";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextField } from "@/components/ui/TextField";
import { VoiceMeterBars } from "@/components/voice/VoiceMeterBars";
import { VoiceMiniPlayer } from "@/components/voice/VoiceMiniPlayer";
import { useToast } from "@/components/ui/ToastProvider";
import { db } from "@/db/client";
import { orderNotes, outbox } from "@/db/schema";
import { formatVoiceTime, useVoiceNoteRecorder } from "@/hooks/useVoiceNoteRecorder";
import { useAutoSyncScreen } from "@/hooks/useAutoSyncScreen";
import { newClientId } from "@/lib/ids";
import { persistVoiceRecording } from "@/lib/voice-note-file";
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
  uploadStatus?: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const local = await db.select().from(orderNotes).where(isNull(orderNotes.salesOrderId));
      const localByServerId = new Map(local.filter((n) => n.serverId != null).map((n) => [n.serverId!, n]));
      const merged: DisplayNote[] = local.map(localToDisplay);

      try {
        const apiRows = await fetchOrderNotes(false);
        for (const row of apiRows) {
          const existing = localByServerId.get(row.id);
          if (existing && row.audio_url && !existing.audioUrl) {
            await db
              .update(orderNotes)
              .set({ audioUrl: row.audio_url, updatedAt: new Date().toISOString() })
              .where(eq(orderNotes.clientId, existing.clientId));
            const idx = merged.findIndex((m) => m.clientId === existing.clientId);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], audioUrl: row.audio_url };
            }
          }
          if (!localByServerId.has(row.id)) {
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
      const voicePath = await persistVoiceRecording(result.uri, clientId);
      await db.insert(orderNotes).values({
        clientId,
        title: "Ghi chú giao",
        voicePath,
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
          /* offline */
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
                  <View style={styles.recordingBlock}>
                    <View style={styles.recRow}>
                      <View style={styles.recDot} />
                      <AppText variant="mono" style={styles.timer}>
                        {formatVoiceTime(voice.elapsedSec)}
                      </AppText>
                      <AppText variant="caption" muted>
                        Đang ghi…
                      </AppText>
                    </View>
                    <VoiceMeterBars
                      samples={voice.meteringSamples}
                      animated={!voice.reduceMotion}
                    />
                    <View style={styles.row}>
                      <Button label="Dừng & lưu" variant="accent" loading={saving} onPress={() => void saveVoiceNote()} />
                      <Button label="Hủy ghi" variant="ghost" onPress={() => void voice.cancel()} />
                    </View>
                  </View>
                ) : (
                  <Button label="Bắt đầu ghi" variant="secondary" onPress={() => void startRecording()} />
                )}
                <AppText variant="caption" muted>
                  Ghi âm sẽ tải lên khi có mạng
                </AppText>
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
              <View style={styles.badgeRow}>
                <StatusBadge label={item.noteType === "voice" ? "Ghi âm" : "Chữ"} tone={item.noteType === "voice" ? "info" : "neutral"} />
                {item.uploadStatus === "pending" ? <StatusBadge label="Chờ tải" tone="warning" /> : null}
              </View>
              <AppText variant="caption" muted>
                {formatDateTime(item.updatedAt)}
                {item.voiceDurationSec ? ` · ${item.voiceDurationSec}s` : ""}
              </AppText>
            </View>
            {item.rawText ? <AppText variant="body">{item.rawText}</AppText> : null}
            {item.noteType === "voice" ? (
              <VoiceMiniPlayer
                voicePath={item.voicePath}
                audioUrl={item.audioUrl}
                durationSec={item.voiceDurationSec}
              />
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
  const isVoice = Boolean(n.voicePath || n.audioUrl);
  return {
    key: n.clientId,
    clientId: n.clientId,
    serverId: n.serverId ?? undefined,
    noteType: isVoice ? "voice" : "text",
    rawText: n.rawText ?? undefined,
    voicePath: n.voicePath ?? undefined,
    audioUrl: n.audioUrl ?? undefined,
    voiceDurationSec: n.voiceDurationSec ?? undefined,
    uploadStatus: n.uploadStatus ?? undefined,
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
  recordingBlock: { gap: spacing.sm },
  recRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  timer: { fontSize: 16, color: colors.text },
  listTitle: { fontFamily: "Inter_600SemiBold" },
  card: { marginBottom: spacing.sm, gap: spacing.xs },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
});
