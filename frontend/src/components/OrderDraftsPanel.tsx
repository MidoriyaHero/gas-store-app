import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiExportPath, apiGet, apiPost, apiPostFormData } from "@/lib/api";
import { formatDateTime, formatVND } from "@/lib/format";
import { downscaleImageToJpeg } from "@/lib/image-resize";
import type { OrderDraft } from "@/lib/order-draft";

/** Poll interval while a photo is being read in the background (a full page takes ~2 minutes). */
const POLL_MS = 4000;

interface OrderDraftsPanelProps {
  /** Bump to reload the list (e.g. after a draft was converted into an order). */
  refreshKey: number;
  onReview: (draft: OrderDraft) => void;
}

interface SheetGroup {
  imageUrl: string;
  createdAt: string;
  drafts: OrderDraft[];
}

/** Group drafts by source photo, keeping API order (newest photo first, orders in sheet order). */
function groupBySheet(rows: OrderDraft[]): SheetGroup[] {
  const groups = new Map<string, SheetGroup>();
  for (const d of rows) {
    const g = groups.get(d.image_url);
    if (g) g.drafts.push(d);
    else groups.set(d.image_url, { imageUrl: d.image_url, createdAt: d.created_at, drafts: [d] });
  }
  return [...groups.values()];
}

/**
 * Admin OCR drafts: upload photos of handwritten order sheets (each line = one order), review each draft in the
 * order form.
 */
export function OrderDraftsPanel({ refreshKey, onReview }: OrderDraftsPanelProps) {
  const [rows, setRows] = useState<OrderDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setRows((await apiGet<OrderDraft[]>("/api/order-drafts")) ?? []);
    } catch (e) {
      if (!quiet) toast.error(e instanceof Error ? e.message : "Không tải được đơn nháp");
    }
    if (!quiet) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const processing = rows.some((d) => d.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(t);
  }, [processing, load]);

  const groups = useMemo(() => groupBySheet(rows), [rows]);
  const orderCount = rows.filter((d) => d.status === "parsed").length;

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const blob = await downscaleImageToJpeg(file);
        const fd = new FormData();
        fd.append("file", blob, blob === file ? file.name : "draft.jpg");
        await apiPostFormData<OrderDraft>("/api/order-drafts", fd);
        toast.success("Đã gửi ảnh — đang đọc (khoảng 1–2 phút)");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi tải ảnh");
      }
    }
    setUploading(false);
    await load();
  };

  const reparse = async (id: number) => {
    try {
      await apiPost<OrderDraft>(`/api/order-drafts/${id}/reparse`, {});
      toast.success("Đang đọc lại ảnh");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi đọc lại");
    }
  };

  const performDelete = async () => {
    if (toDeleteId === null) return;
    try {
      await apiDelete(`/api/order-drafts/${toDeleteId}`);
      toast.success("Đã xoá đơn nháp");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi xoá");
      throw e;
    }
  };

  return (
    <>
      <DestructiveConfirmDialog
        open={toDeleteId !== null}
        onOpenChange={(v) => {
          if (!v) setToDeleteId(null);
        }}
        title="Xoá đơn nháp?"
        description="Đơn nháp này sẽ bị xoá vĩnh viễn (ảnh gốc bị xoá khi không còn đơn nháp nào từ ảnh đó)."
        onConfirm={performDelete}
      />
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Đơn nháp chờ duyệt ({orderCount})</h3>
            <p className="text-xs text-muted-foreground">Mỗi dòng trên giấy là một đơn; duyệt từng đơn rồi lưu.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => void load()} disabled={loading}>
              Tải lại
            </Button>
            <Button
              type="button"
              className="min-h-10 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
              {uploading ? "Đang gửi ảnh…" : "Chụp / tải ảnh đơn"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void uploadFiles(files);
              }}
            />
          </div>
        </div>
        {rows.length === 0 && !loading && <p className="text-sm text-muted-foreground">Chưa có đơn nháp</p>}
        {groups.map((g) => {
          const head = g.drafts[0];
          const isProcessing = g.drafts.some((d) => d.status === "processing");
          return (
            <div key={g.imageUrl} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row">
              <div className="flex shrink-0 flex-row gap-3 sm:w-32 sm:flex-col">
                <a href={apiExportPath(g.imageUrl)} target="_blank" rel="noreferrer">
                  <img
                    src={apiExportPath(g.imageUrl)}
                    alt="Ảnh giấy ghi đơn"
                    className="h-32 w-24 rounded-md border object-cover sm:h-44 sm:w-32"
                  />
                </a>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <time dateTime={g.createdAt}>{formatDateTime(g.createdAt)}</time>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-9 w-full gap-1"
                    onClick={() => void reparse(head.id)}
                    disabled={isProcessing}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Đọc lại ảnh
                  </Button>
                </div>
              </div>
              <div className="min-w-0 flex-1 divide-y">
                {g.drafts.map((d) => {
                  const ex = d.extraction;
                  const total = ex.total_amount != null ? Number(ex.total_amount) : 0;
                  const debt = ex.debt_amount != null ? Number(ex.debt_amount) : 0;
                  if (d.status === "processing") {
                    return (
                      <div key={d.id} className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Đang đọc ảnh… (khoảng 1–2 phút)
                      </div>
                    );
                  }
                  return (
                    <div key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {d.status === "error" && <Badge variant="destructive">Lỗi đọc</Badge>}
                          <span className="font-medium">{ex.customer_name || "—"}</span>
                          {ex.phone && <span className="text-muted-foreground">{ex.phone}</span>}
                          {total > 0 && <span className="text-muted-foreground">• {formatVND(total)}</span>}
                          {debt > 0 && <span className="text-amber-700 dark:text-amber-400">• Nợ {formatVND(debt)}</span>}
                          {ex.warnings.length > 0 && (
                            <span className="text-xs text-muted-foreground">• {ex.warnings.length} cảnh báo</span>
                          )}
                        </div>
                        {ex.transcript && <p className="truncate text-xs text-muted-foreground">{ex.transcript}</p>}
                        {d.error_message && <p className="text-xs text-destructive">{d.error_message}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {d.status === "parsed" && (
                          <Button type="button" size="sm" className="min-h-9" onClick={() => onReview(d)}>
                            Duyệt
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-9 text-destructive hover:text-destructive"
                          onClick={() => setToDeleteId(d.id)}
                          aria-label="Xoá đơn nháp"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
