import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { AppLayout } from "@/components/AppLayout";
import { AsyncStatePanel } from "@/components/AsyncStatePanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatVND } from "@/lib/format";
import { apiGet, apiPut } from "@/lib/api";
import type { AsyncViewState } from "@/lib/ui-foundation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/** ``YYYY-MM-DD`` in local timezone. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface OrderItemRow {
  product_id: number;
  product_name: string;
  quantity: number;
}

interface SummaryOrder {
  id: number;
  order_code: string;
  customer_name: string;
  delivery_date: string | null;
  total: string | number;
  delivery_status?: "in_transit" | "completed";
  order_items: OrderItemRow[];
}

interface DeliverySummaryPayload {
  dates: string[];
  orders: SummaryOrder[];
  total_amount: string | number;
  total_line_quantity: number;
}

interface DailyAuditComputed {
  delivered_full: number;
  borrowed_shell_total: number;
  returned_shells_debt: number;
  expected_evening_full: number;
  expected_evening_shell: number;
  variance_full: number | null;
  variance_shell: number | null;
}

interface DailyAuditRecord {
  id: number;
  business_date: string;
  morning_full: number;
  morning_shell: number;
  import_full: number;
  supplier_shell_units: number;
  evening_full: number;
  evening_shell: number;
  note: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface DailyAuditPayload {
  record: DailyAuditRecord | null;
  computed: DailyAuditComputed;
}

/** Text for variance: not only color (a11y). */
function varianceLabel(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "Đủ";
  if (v > 0) return `Thừa ${v}`;
  return `Thiếu ${Math.abs(v)}`;
}

/**
 * Điều hành theo ngày giao: lịch chọn ngày giao; nghiệp vụ chính là kiểm kê nước/vỏ (tab mặc định).
 * Đơn theo ngày nằm tab phụ để giảm nhiễu thị giác.
 */
export default function CoreOperations() {
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => [new Date()]);
  const [state, setState] = useState<AsyncViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DeliverySummaryPayload | null>(null);

  const [auditDay, setAuditDay] = useState(() => toIsoDate(new Date()));
  const [auditPayload, setAuditPayload] = useState<DailyAuditPayload | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [morningFull, setMorningFull] = useState(0);
  const [morningShell, setMorningShell] = useState(0);
  const [importFull, setImportFull] = useState(0);
  const [supplierShellUnits, setSupplierShellUnits] = useState(0);
  const [eveningFull, setEveningFull] = useState(0);
  const [eveningShell, setEveningShell] = useState(0);
  const [auditNote, setAuditNote] = useState("");
  const [savingMorning, setSavingMorning] = useState(false);
  const [savingEvening, setSavingEvening] = useState(false);

  const datesParam = useMemo(
    () => [...new Set(selectedDates.map(toIsoDate))].sort().join(","),
    [selectedDates]
  );

  useEffect(() => {
    if (selectedDates.length === 1) {
      setAuditDay(toIsoDate(selectedDates[0]!));
    }
  }, [selectedDates]);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const data = await apiGet<DeliverySummaryPayload>(
        `/api/operations/delivery-day-summary?dates=${encodeURIComponent(datesParam)}`
      );
      setPayload(data);
      setState(data.orders.length === 0 ? "empty" : "success");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, [datesParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await apiGet<DailyAuditPayload>(
        `/api/operations/daily-cylinder-audit?audit_date=${encodeURIComponent(auditDay)}`
      );
      setAuditPayload(data);
      const r = data.record;
      if (r) {
        setMorningFull(r.morning_full);
        setMorningShell(r.morning_shell);
        setImportFull(r.import_full);
        setSupplierShellUnits(r.supplier_shell_units ?? 0);
        setEveningFull(r.evening_full);
        setEveningShell(r.evening_shell);
        setAuditNote(r.note ?? "");
      } else {
        setMorningFull(0);
        setMorningShell(0);
        setImportFull(0);
        setSupplierShellUnits(0);
        setEveningFull(0);
        setEveningShell(0);
        setAuditNote("");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được kiểm kê");
      setAuditPayload(null);
    }
    setAuditLoading(false);
  }, [auditDay]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const applyAuditResponse = (data: DailyAuditPayload) => {
    setAuditPayload(data);
    const r = data.record;
    if (r) {
      setMorningFull(r.morning_full);
      setMorningShell(r.morning_shell);
      setImportFull(r.import_full);
      setSupplierShellUnits(r.supplier_shell_units ?? 0);
      setEveningFull(r.evening_full);
      setEveningShell(r.evening_shell);
      setAuditNote(r.note ?? "");
    }
  };

  const saveMorning = async () => {
    setSavingMorning(true);
    try {
      const data = await apiPut<DailyAuditPayload>(`/api/operations/daily-cylinder-audit/${encodeURIComponent(auditDay)}`, {
        morning_full: morningFull,
        morning_shell: morningShell,
      });
      applyAuditResponse(data);
      toast.success("Đã lưu số đầu ngày");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSavingMorning(false);
  };

  const saveEvening = async () => {
    setSavingEvening(true);
    try {
      const data = await apiPut<DailyAuditPayload>(`/api/operations/daily-cylinder-audit/${encodeURIComponent(auditDay)}`, {
        import_full: importFull,
        supplier_shell_units: supplierShellUnits,
        evening_full: eveningFull,
        evening_shell: eveningShell,
        note: auditNote.trim() || null,
      });
      applyAuditResponse(data);
      toast.success("Đã lưu kiểm cuối ngày");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSavingEvening(false);
  };

  const c = auditPayload?.computed;

  return (
    <AppLayout
      title="Điều hành theo ngày giao"
      description="Kiểm kê nước / vỏ theo ngày là phần chính; chọn ngày trên lịch (có thể nhiều ngày) để xem đơn trong tab Đơn theo ngày giao."
      actions={
        <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => void load()}>
          Làm mới đơn
        </Button>
      }
    >
      <div className="mb-6 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,248px),minmax(0,1fr)] lg:items-start lg:gap-6">
        <Card
          className="mx-auto w-full max-w-[248px] shrink-0 p-2 shadow-card lg:mx-0 lg:max-w-[248px]"
          aria-label="Chọn ngày giao trên lịch"
        >
          <Calendar
            mode="multiple"
            selected={selectedDates}
            onSelect={(d) => setSelectedDates(d ?? [])}
            className="rounded-md border-0 p-1.5"
            classNames={{
              months: "flex flex-col space-y-2",
              month: "space-y-2",
              caption: "flex justify-center pt-0.5 relative items-center",
              caption_label: "text-xs font-medium",
              nav_button: cn(
                buttonVariants({ variant: "outline" }),
                "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100",
              ),
              head_row: "flex",
              head_cell: "w-8 rounded-md text-center text-[0.65rem] font-normal text-muted-foreground",
              row: "mt-1 flex w-full",
              cell: "relative h-8 w-8 p-0 text-center text-xs [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-8 w-8 min-h-8 min-w-8 p-0 text-xs font-normal aria-selected:opacity-100",
              ),
            }}
          />
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            Một ngày trên lịch đồng bộ với ngày kiểm kê. Đơn không có ngày giao không hiện ở tab đơn — chỉnh trên trang Đơn
            hàng.
          </p>
        </Card>

        <div className="min-w-0">
          <Tabs defaultValue="audit" className="w-full">
            <TabsList
              className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-flex sm:w-auto sm:min-h-11"
              aria-label="Chế độ xem điều hành"
            >
              <TabsTrigger value="audit" className="min-h-11 px-4 sm:flex-1">
                Kiểm kê nước / vỏ
              </TabsTrigger>
              <TabsTrigger value="orders" className="min-h-11 px-4 sm:flex-1">
                Đơn theo ngày giao
              </TabsTrigger>
            </TabsList>

            <TabsContent value="audit" className="mt-4 space-y-0 focus-visible:outline-none">
              <Card className="p-4 shadow-card">
            <h2 className="mb-2 text-sm font-semibold">Kiểm kê nước / vỏ theo ngày</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Đầu ngày: số bình đầy và vỏ trong kho. Cuối ngày: đếm thực tế + giao dịch với công ty gas (bình nước nhận và vỏ
              giao/trả — hai số nhập riêng, không bắt buộc 1–1). Đối soát với đơn đã giao (completed) và vỏ trả khi thu nợ
              (ngày theo thời điểm thanh toán, cùng lịch UTC với ngày giao trên đơn).
            </p>
            <div className="mb-4 grid gap-1.5">
              <Label htmlFor="audit-day">Ngày kiểm kê</Label>
              <Input
                id="audit-day"
                type="date"
                className="min-h-11 max-w-xs"
                value={auditDay}
                onChange={(e) => setAuditDay(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" className="min-h-11 w-fit" onClick={() => void loadAudit()} disabled={auditLoading}>
                {auditLoading ? "Đang tải…" : "Tải lại kiểm kê"}
              </Button>
            </div>

            {c && (
              <div className="mb-4 grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">Đối soát (chỉ đọc)</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Đã giao (bình, từ đơn):</span>{" "}
                    <span className="font-mono font-medium">{c.delivered_full}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Vỏ cho mượn (đơn):</span>{" "}
                    <span className="font-mono font-medium">{c.borrowed_shell_total}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Vỏ trả khi trả nợ (trong ngày):</span>{" "}
                    <span className="font-mono font-medium">{c.returned_shells_debt}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Kỳ vọng nước cuối ngày:</span>{" "}
                    <span className="font-mono font-medium">{c.expected_evening_full}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Kỳ vọng vỏ cuối ngày:</span>{" "}
                    <span className="font-mono font-medium">{c.expected_evening_shell}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Badge variant="outline" className="font-normal">
                    Lệch nước: {varianceLabel(c.variance_full)} ({c.variance_full ?? "—"})
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    Lệch vỏ: {varianceLabel(c.variance_shell)} ({c.variance_shell ?? "—"})
                  </Badge>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-md border p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Đầu ngày</h3>
                <div className="grid gap-1.5">
                  <Label>Số nước (bình đầy) đầu ngày</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={morningFull}
                    onChange={(e) => setMorningFull(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số vỏ đầu ngày</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={morningShell}
                    onChange={(e) => setMorningShell(Number(e.target.value) || 0)}
                  />
                </div>
                <Button type="button" className="min-h-11" onClick={() => void saveMorning()} disabled={savingMorning}>
                  {savingMorning ? "Đang lưu…" : "Lưu đầu ngày"}
                </Button>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuối ngày</h3>
                <div className="grid gap-1.5">
                  <Label>Bình nước (đầy) nhận từ công ty gas trong ngày</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={importFull}
                    onChange={(e) => setImportFull(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Vỏ giao / trả cho công ty gas trong ngày</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={supplierShellUnits}
                    onChange={(e) => setSupplierShellUnits(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số nước hiện tại (đếm thực tế)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={eveningFull}
                    onChange={(e) => setEveningFull(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số vỏ hiện tại (đếm thực tế)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11"
                    value={eveningShell}
                    onChange={(e) => setEveningShell(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Ghi chú</Label>
                  <Input className="min-h-11" value={auditNote} onChange={(e) => setAuditNote(e.target.value)} />
                </div>
                <Button type="button" className="min-h-11" onClick={() => void saveEvening()} disabled={savingEvening}>
                  {savingEvening ? "Đang lưu…" : "Lưu cuối ngày"}
                </Button>
              </div>
            </div>
              </Card>
            </TabsContent>

            <TabsContent value="orders" className="mt-4 space-y-4 focus-visible:outline-none">
              <AsyncStatePanel
                state={state}
                title={state === "error" ? "Không tải được tổng hợp đơn" : undefined}
                description={state === "error" ? error ?? undefined : undefined}
                onRetry={() => void load()}
              />
              {(state === "success" || state === "empty") && payload && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="p-4 shadow-card">
                      <p className="text-xs text-muted-foreground">Số đơn</p>
                      <p className="text-2xl font-semibold">{payload.orders.length}</p>
                    </Card>
                    <Card className="p-4 shadow-card">
                      <p className="text-xs text-muted-foreground">Tổng tiền (theo đơn)</p>
                      <p className="text-xl font-semibold">{formatVND(payload.total_amount)}</p>
                    </Card>
                    <Card className="p-4 shadow-card">
                      <p className="text-xs text-muted-foreground">Tổng số dòng hàng (bình / SP)</p>
                      <p className="text-2xl font-semibold">{payload.total_line_quantity}</p>
                    </Card>
                  </div>
                  <Card className="shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                      <h2 className="text-sm font-semibold">Đơn theo ngày giao đã chọn</h2>
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <Link to="/don-hang">Mở Đơn hàng</Link>
                      </Button>
                    </div>
                    <div className="max-h-[min(55vh,520px)] overflow-y-auto overflow-x-auto p-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mã đơn</TableHead>
                            <TableHead>Khách</TableHead>
                            <TableHead>Ngày giao</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead className="text-right">Tổng</TableHead>
                            <TableHead className="text-right">SL dòng</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payload.orders.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                Không có đơn nào có ngày giao trùng các ngày đã chọn.
                              </TableCell>
                            </TableRow>
                          ) : (
                            payload.orders.map((o) => (
                              <TableRow key={o.id}>
                                <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                                <TableCell>{o.customer_name}</TableCell>
                                <TableCell className="text-sm">{o.delivery_date ?? "—"}</TableCell>
                                <TableCell>
                                  {o.delivery_status === "completed" ? (
                                    <Badge variant="outline">Hoàn thành</Badge>
                                  ) : (
                                    <Badge variant="secondary">Đang giao</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatVND(o.total)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {o.order_items?.reduce((s, li) => s + li.quantity, 0) ?? 0}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
