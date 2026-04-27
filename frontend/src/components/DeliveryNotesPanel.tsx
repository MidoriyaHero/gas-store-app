import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Plus, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, apiPostFormData, apiExportPath } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";

/** API row for delivery notes (text or voice). */
export interface OrderNoteRow {
  id: number;
  created_by_user_id: number;
  title: string | null;
  note_type: string;
  raw_text: string | null;
  status: string;
  voice_enabled_stub: boolean;
  parser_status: string;
  audio_url: string | null;
  audio_duration_sec: number | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string | null;
}

interface DeliveryNotesPanelProps {
  /** Tighter layout when embedded under the admin orders table. */
  compact?: boolean;
}

/**
 * Free-text and voice delivery notes: list, text CRUD, voice add/delete only.
 */
export function DeliveryNotesPanel({ compact = false }: DeliveryNotesPanelProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrderNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingText, setSavingText] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [noteToDeleteId, setNoteToDeleteId] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordStartRef = useRef<number>(0);

  const listPath = useMemo(
    () => (user?.role === "admin" ? "/api/order-notes?mine=false" : "/api/order-notes"),
    [user?.role]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<OrderNoteRow[]>(listPath);
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải ghi chú");
    }
    setLoading(false);
  }, [listPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTextNote = async () => {
    const t = textDraft.trim();
    if (!t) {
      toast.error("Nhập nội dung ghi chú");
      return;
    }
    setSavingText(true);
    try {
      if (editingId === null) {
        await apiPost<OrderNoteRow>("/api/order-notes", { raw_text: t });
        toast.success("Đã lưu ghi chú");
      } else {
        await apiPatch<OrderNoteRow>(`/api/order-notes/${editingId}`, { raw_text: t });
        toast.success("Đã cập nhật ghi chú");
      }
      setTextDraft("");
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSavingText(false);
  };

  const startEditText = (row: OrderNoteRow) => {
    if (row.note_type !== "text") return;
    setEditingId(row.id);
    setTextDraft(row.raw_text ?? "");
  };

  const newTextNote = () => {
    setEditingId(null);
    setTextDraft("");
  };

  const performDeleteNote = async () => {
    if (noteToDeleteId === null) return;
    const id = noteToDeleteId;
    try {
      await apiDelete(`/api/order-notes/${id}`);
      toast.success("Đã xóa");
      if (editingId === id) {
        setEditingId(null);
        setTextDraft("");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      throw e;
    }
  };

  const discardRecording = () => {
    const mr = mediaRecorderRef.current;
    const stream = streamRef.current;
    mediaRecorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
    stream?.getTracks().forEach((t) => t.stop());
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Trình duyệt không hỗ trợ ghi âm");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferWebm = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm");
      const mr = new MediaRecorder(stream, preferWebm ? { mimeType: "audio/webm" } : undefined);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      recordStartRef.current = Date.now();
      mr.start(250);
      setRecording(true);
    } catch {
      toast.error("Không bật được micro");
    }
  };

  const stopRecordingAndUpload = async () => {
    const mr = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (!mr || mr.state === "inactive") {
      discardRecording();
      return;
    }
    setRecording(false);
    const durationMs = Date.now() - recordStartRef.current;
    const durationSec = Math.max(1, Math.round(durationMs / 1000));
    await new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
      try {
        mr.stop();
      } catch {
        resolve();
      }
    });
    stream?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    streamRef.current = null;
    const blobType = mr.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: blobType });
    chunksRef.current = [];
    const ext = blobType.includes("webm") ? ".webm" : ".m4a";
    const file = new File([blob], `ghi-am${ext}`, { type: blobType });
    setUploadingVoice(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("duration_sec", String(durationSec));
      await apiPostFormData<OrderNoteRow>("/api/order-notes/voice", fd);
      toast.success("Đã lưu ghi âm");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi upload ghi âm");
    }
    setUploadingVoice(false);
  };

  const gap = compact ? "gap-3" : "gap-4";
  const pad = compact ? "p-3" : "p-4";

  return (
    <>
      <DestructiveConfirmDialog
        open={noteToDeleteId !== null}
        onOpenChange={(v) => {
          if (!v) setNoteToDeleteId(null);
        }}
        title="Xóa ghi chú?"
        description="Ghi chú sẽ bị gỡ vĩnh viễn (kể cả file ghi âm nếu có). Thao tác này không hoàn tác."
        onConfirm={performDeleteNote}
      />

      <div className={`grid ${gap} lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]`}>
      <Card className={`${pad} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Ghi chú mới</h3>
          <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => void load()} disabled={loading}>
            Tải lại
          </Button>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="delivery-note-text">Ghi chú (chữ)</Label>
          <Textarea
            id="delivery-note-text"
            rows={compact ? 4 : 6}
            className="min-h-[120px] resize-y text-base"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="Nhập ghi chú giao hàng…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11 gap-1" onClick={() => void saveTextNote()} disabled={savingText}>
            {editingId === null ? "Lưu ghi chú" : "Cập nhật"}
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={newTextNote}>
            <Plus className="h-4 w-4" aria-hidden />
            Ghi chú mới
          </Button>
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label>Ghi âm nhanh</Label>
          <p className="text-xs text-muted-foreground">Chỉ thêm hoặc xóa sau khi lưu — không sửa file ghi âm.</p>
          <div className="flex flex-wrap gap-2">
            {!recording ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 gap-2"
                onClick={() => void startRecording()}
                disabled={uploadingVoice}
              >
                <Mic className="h-4 w-4" aria-hidden />
                Bắt đầu ghi
              </Button>
            ) : (
              <>
                <Button type="button" className="min-h-11 gap-2" onClick={() => void stopRecordingAndUpload()} disabled={uploadingVoice}>
                  <Square className="h-4 w-4" aria-hidden />
                  Dừng &amp; lưu
                </Button>
                <Button type="button" variant="outline" className="min-h-11" onClick={discardRecording} disabled={uploadingVoice}>
                  Hủy ghi
                </Button>
              </>
            )}
          </div>
          {uploadingVoice && <p className="text-xs text-muted-foreground">Đang tải file ghi âm…</p>}
        </div>
      </Card>

      <Card className={`${pad} space-y-2`}>
        <h3 className="text-sm font-semibold">Danh sách ({rows.length})</h3>
        <div className={`max-h-[min(60vh,520px)] space-y-2 overflow-y-auto ${gap}`}>
          {rows.length === 0 && !loading && <p className="text-sm text-muted-foreground">Chưa có ghi chú.</p>}
          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-lg border p-3 ${editingId === row.id && row.note_type === "text" ? "border-primary/60 bg-muted/40" : "bg-card"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{row.note_type === "voice" ? "Ghi âm" : "Chữ"}</span>
                    <span>•</span>
                    <time dateTime={row.created_at}>{formatDateTime(row.created_at)}</time>
                    {row.note_type === "voice" && row.audio_duration_sec != null && (
                      <>
                        <span>•</span>
                        <span>{row.audio_duration_sec}s</span>
                      </>
                    )}
                  </div>
                  {row.note_type === "text" && <p className="whitespace-pre-wrap text-sm">{row.raw_text || "—"}</p>}
                  {row.note_type === "voice" && row.audio_url && (
                    <audio controls className="mt-1 h-10 w-full max-w-md" src={apiExportPath(row.audio_url)} />
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {row.note_type === "text" && (
                    <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => startEditText(row)}>
                      Sửa
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-10 text-destructive hover:text-destructive"
                    onClick={() => setNoteToDeleteId(row.id)}
                    aria-label="Xóa ghi chú"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
    </>
  );
}
