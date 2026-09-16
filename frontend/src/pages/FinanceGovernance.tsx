import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Trash2, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { AsyncStatePanel } from "@/components/AsyncStatePanel";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatVND } from "@/lib/format";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import type { AsyncViewState } from "@/lib/ui-foundation";
import { FINANCE_KPI_DEFINITIONS } from "@/lib/feature-governance";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { registerVietnameseFont } from "@/lib/fonts/registerVietnameseFont";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  financeRangeToSummaryKey,
  seriesFromSummary,
  type DashboardSummaryResponse,
  type TopDebtorChartRow,
} from "@/lib/dashboard-analytics";
import { ShellDebtLedgerTab } from "@/components/finance/ShellDebtLedgerTab";

const BUCKETS = ["0-7 ngày", "8-15 ngày", "16-30 ngày", "31+ ngày"] as const;

type DebtStatusFilter = "all" | "open" | "paid";

interface DebtOrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  delivery_date: string | null;
  outstanding_amount: number | string;
  total: number | string;
  paid_amount: number | string;
  payment_mode: string;
}

interface DebtLedgerRow {
  id: number;
  entry_type: string;
  amount_signed: number | string;
  note: string | null;
  reference_id?: string | null;
  created_at: string;
  returned_shell_units?: number;
}

interface DebtDetailPayload {
  order: DebtOrderRow;
  ledger: DebtLedgerRow[];
}

interface DebtAgingRow {
  bucket: string;
  amount: number | string;
}

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-");
  if (!year || !monthNum) return month;
  return `${monthNum}/${year}`;
}

function formatDeliveryDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

/**
 * Finance and governance screen based on sales orders dataset.
 */
export default function FinanceGovernance() {
  const [state, setState] = useState<AsyncViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [rangeDays, setRangeDays] = useState("30");
  const [debtMonth, setDebtMonth] = useState(currentMonthValue);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [debtStatusFilter, setDebtStatusFilter] = useState<DebtStatusFilter>("open");
  const [debtOrders, setDebtOrders] = useState<DebtOrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<DebtLedgerRow[]>([]);
  const [aging, setAging] = useState<DebtAgingRow[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentEditOpen, setPaymentEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [amountInput, setAmountInput] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [savingAction, setSavingAction] = useState(false);
  const [paymentShellInput, setPaymentShellInput] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const rangeKey = financeRangeToSummaryKey(rangeDays);
      const debtMonthQuery = encodeURIComponent(debtMonth);
      const [summaryData, orderRows, agingRows] = await Promise.all([
        apiGet<DashboardSummaryResponse>(`/api/dashboard/summary?range=${rangeKey}`),
        apiGet<DebtOrderRow[]>(`/api/debt-orders?status=all&limit=200&month=${debtMonthQuery}`),
        apiGet<DebtAgingRow[]>("/api/debt-aging"),
      ]);
      setSummary(summaryData);
      setDebtOrders(orderRows ?? []);
      setAging(agingRows ?? []);
      if (orderRows.length > 0 && (selectedOrderId === null || !orderRows.some((o) => o.id === selectedOrderId))) {
        setSelectedOrderId(orderRows[0].id);
      }
      setState((summaryData.order_count ?? 0) > 0 || (orderRows ?? []).length > 0 ? "success" : "empty");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu tài chính");
    }
  }, [debtMonth, rangeDays, selectedOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    if (!summary) return { revenue: 0, orderCount: 0, avgOrder: 0, grossProfit: 0 };
    const revenue = Number(summary.revenue || 0);
    const orderCount = summary.order_count;
    const avgOrder = orderCount > 0 ? revenue / orderCount : 0;
    const grossProfit = Number(summary.profit || 0);
    return { revenue, orderCount, avgOrder, grossProfit };
  }, [summary]);
  const lineSeries = useMemo(() => (summary ? seriesFromSummary(summary.series) : []), [summary]);
  const chartInterval = Math.max(0, Math.ceil(lineSeries.length / 7) - 1);

  const agingBuckets = useMemo(() => {
    const byBucket = new Map(aging.map((x) => [x.bucket, Number(x.amount || 0)]));
    return BUCKETS.map((b) => byBucket.get(b) ?? 0);
  }, [aging]);

  const debtTotal = useMemo(
    () => debtOrders.reduce((sum, o) => sum + Number(o.outstanding_amount || 0), 0),
    [debtOrders]
  );
  const openDebtOrders = useMemo(
    () => debtOrders.filter((o) => Number(o.outstanding_amount || 0) > 0).length,
    [debtOrders]
  );
  const debtStatusData = useMemo(() => {
    const paid = debtOrders.filter((o) => Number(o.outstanding_amount || 0) <= 0).length;
    const open = debtOrders.filter((o) => Number(o.outstanding_amount || 0) > 0).length;
    return [
      { name: "Đã trả", value: paid, color: "hsl(var(--success))" },
      { name: "Còn nợ", value: open, color: "hsl(var(--destructive))" },
    ];
  }, [debtOrders]);
  const agingChartData = useMemo(
    () => BUCKETS.map((bucket, idx) => ({ bucket, amount: agingBuckets[idx] })),
    [agingBuckets]
  );
  const topDebtChart = useMemo(() => {
    const byCustomer = new Map<string, TopDebtorChartRow>();
    for (const o of debtOrders) {
      const value = Number(o.outstanding_amount || 0);
      if (value <= 0) continue;
      const key = o.phone || o.customer_name;
      const prev = byCustomer.get(key);
      if (prev) {
        prev.value += value;
      } else {
        byCustomer.set(key, { id: o.id, name: o.customer_name, value });
      }
    }
    return [...byCustomer.values()].sort((a, b) => b.value - a.value).slice(0, 7);
  }, [debtOrders]);

  const debtFilterLabel = useMemo(() => {
    if (debtStatusFilter === "open") return "Còn nợ";
    if (debtStatusFilter === "paid") return "Đã trả";
    return "Tất cả";
  }, [debtStatusFilter]);
  const debtMonthLabel = useMemo(() => formatMonthLabel(debtMonth), [debtMonth]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debtOrders.filter((o) => {
      const balance = Number(o.outstanding_amount || 0);
      if (debtStatusFilter === "open" && balance <= 0) return false;
      if (debtStatusFilter === "paid" && balance > 0) return false;
      if (!q) return true;
      return (
        o.customer_name.toLowerCase().includes(q)
        || (o.phone ?? "").toLowerCase().includes(q)
        || o.order_code.toLowerCase().includes(q)
      );
    });
  }, [debtOrders, debtStatusFilter, search]);

  const filteredDebtTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + Number(o.outstanding_amount || 0), 0),
    [filteredOrders],
  );

  const selectedOrder = useMemo(
    () => debtOrders.find((o) => o.id === selectedOrderId) ?? null,
    [debtOrders, selectedOrderId]
  );
  const repaymentHistory = useMemo(() => selectedLedger, [selectedLedger]);

  const debtStatusLabel = (balance: number | string) => (Number(balance) <= 0 ? "Đã trả" : "Còn nợ");
  const debtTypeLabel = (entryType: string) => {
    if (entryType === "payment") return "Trả nợ";
    if (entryType === "write_off") return "Xóa nợ (ghi giảm kế toán)";
    if (entryType === "adjustment") return "Điều chỉnh";
    if (entryType === "invoice") return "Phát sinh nợ";
    return entryType;
  };

  const loadDetail = useCallback(async () => {
    if (!selectedOrderId) {
      setSelectedLedger([]);
      return;
    }
    const detail = await apiGet<DebtDetailPayload>(`/api/debt-orders/${selectedOrderId}?month=${encodeURIComponent(debtMonth)}`);
    setSelectedLedger(detail.ledger ?? []);
  }, [debtMonth, selectedOrderId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const submitPayment = async () => {
    if (!selectedOrderId || amountInput <= 0) return;
    setSavingAction(true);
    try {
      await apiPost("/api/debt-payments", {
        sales_order_id: selectedOrderId,
        amount: amountInput,
        payment_method: "cash",
        note: paymentNote.trim() || null,
        returned_shell_units: paymentShellInput,
      });
      toast.success("Đã thu nợ");
      setPaymentOpen(false);
      setAmountInput(0);
      setPaymentNote("");
      setPaymentShellInput(0);
      await load();
      await loadDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thu nợ được");
    }
    setSavingAction(false);
  };

  const openEditPayment = (row: DebtLedgerRow) => {
    const pid = Number(row.reference_id || 0);
    if (!pid) return;
    setEditingPaymentId(pid);
    setAmountInput(Math.abs(Number(row.amount_signed)));
    setPaymentNote(row.note || "");
    setPaymentShellInput(Number(row.returned_shell_units ?? 0));
    setPaymentEditOpen(true);
  };

  const submitEditPayment = async () => {
    if (!editingPaymentId || amountInput <= 0) return;
    setSavingAction(true);
    try {
      await apiPatch(`/api/debt-payments/${editingPaymentId}`, {
        amount: amountInput,
        note: paymentNote.trim() || null,
        returned_shell_units: paymentShellInput,
      });
      toast.success("Đã cập nhật giao dịch thu nợ");
      setPaymentEditOpen(false);
      setEditingPaymentId(null);
      setAmountInput(0);
      setPaymentNote("");
      setPaymentShellInput(0);
      await load();
      await loadDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được giao dịch");
    }
    setSavingAction(false);
  };

  const deletePayment = async (row: DebtLedgerRow) => {
    const pid = Number(row.reference_id || 0);
    if (!pid) return;
    setSavingAction(true);
    try {
      await apiDelete(`/api/debt-payments/${pid}`);
      toast.success("Đã xóa giao dịch thu nợ");
      await load();
      await loadDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xóa được giao dịch");
    }
    setSavingAction(false);
  };

  const exportHistoryPdf = () => {
    if (!selectedOrder || repaymentHistory.length === 0) {
      toast.error("Không có lịch sử trả nợ để xuất");
      return;
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    registerVietnameseFont(doc);
    doc.setFont("BeVietnamPro", "bold");
    doc.setFontSize(13);
    doc.text("LỊCH SỬ CÔNG NỢ THEO ĐƠN", 105, 14, { align: "center" });
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(10);
    doc.text(`Mã đơn: ${selectedOrder.order_code}`, 14, 22);
    doc.text(`Khách hàng: ${selectedOrder.customer_name} · ${selectedOrder.phone ?? "—"}`, 14, 28);
    doc.text(`Ngày giao: ${formatDeliveryDate(selectedOrder.delivery_date)}`, 14, 34);
    doc.text(`Dư nợ đơn: ${formatVND(selectedOrder.outstanding_amount)}`, 14, 40);

    autoTable(doc, {
      startY: 46,
      head: [["STT", "Thời gian", "Nghiệp vụ", "Ghi chú", "Giá trị"]],
      body: repaymentHistory.map((row, idx) => [
        idx + 1,
        formatDateTime(row.created_at),
        debtTypeLabel(row.entry_type),
        row.note || "-",
        formatVND(Math.abs(Number(row.amount_signed))),
      ]),
      headStyles: { fillColor: [15, 118, 110], textColor: 255, font: "BeVietnamPro", fontStyle: "bold" },
      styles: { font: "BeVietnamPro", fontSize: 9, cellPadding: 2 },
      bodyStyles: { font: "BeVietnamPro", fontStyle: "normal" },
      columnStyles: { 4: { halign: "right" } },
    });
    doc.save(`lich-su-tra-no_${selectedOrder.order_code}.pdf`);
  };

  const exportHistoryCsv = () => {
    if (!selectedOrder || repaymentHistory.length === 0) {
      toast.error("Không có lịch sử trả nợ để xuất");
      return;
    }
    const header = ["STT", "Thời gian", "Nghiệp vụ", "Ghi chú", "Giá trị"];
    const body = repaymentHistory.map((row, idx) => [
      String(idx + 1),
      formatDateTime(row.created_at),
      debtTypeLabel(row.entry_type),
      (row.note || "").replaceAll('"', '""'),
      String(Math.abs(Number(row.amount_signed))),
    ]);
    const csvRows = [header, ...body].map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lich-su-tra-no_${selectedOrder.order_code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHistoryExcel = () => {
    if (!selectedOrder || repaymentHistory.length === 0) {
      toast.error("Không có lịch sử trả nợ để xuất");
      return;
    }
    const rows = repaymentHistory
      .map(
        (row, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${formatDateTime(row.created_at)}</td>
          <td>${debtTypeLabel(row.entry_type)}</td>
          <td>${row.note || "-"}</td>
          <td style="text-align:right">${Math.abs(Number(row.amount_signed)).toLocaleString("vi-VN")}</td>
        </tr>`
      )
      .join("");
    const html = `
      <table border="1">
        <thead>
          <tr><th>STT</th><th>Thời gian</th><th>Nghiệp vụ</th><th>Ghi chú</th><th>Giá trị</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lich-su-tra-no_${selectedOrder.order_code}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDebtAccountsCsv = () => {
    if (filteredOrders.length === 0) {
      toast.error("Không có dữ liệu sổ nợ để xuất");
      return;
    }
    const header = ["STT", "Mã đơn", "Khách hàng", "SĐT", "Ngày giao", "Trạng thái", "Dư nợ"];
    const body = filteredOrders.map((o, idx) => [
      String(idx + 1),
      o.order_code,
      o.customer_name,
      o.phone ?? "",
      formatDeliveryDate(o.delivery_date),
      debtStatusLabel(o.outstanding_amount),
      String(Number(o.outstanding_amount || 0)),
    ]);
    const csvRows = [header, ...body].map((r) => r.map((x) => `"${x.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "so-no_khach-hang.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDebtAccountsExcel = () => {
    if (filteredOrders.length === 0) {
      toast.error("Không có dữ liệu sổ nợ để xuất");
      return;
    }
    const rows = filteredOrders
      .map(
        (o, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${o.order_code}</td>
          <td>${o.customer_name}</td>
          <td>${o.phone ?? ""}</td>
          <td>${formatDeliveryDate(o.delivery_date)}</td>
          <td>${debtStatusLabel(o.outstanding_amount)}</td>
          <td style="text-align:right">${Number(o.outstanding_amount || 0).toLocaleString("vi-VN")}</td>
        </tr>`
      )
      .join("");
    const html = `
      <table border="1">
        <thead>
          <tr><th>STT</th><th>Mã đơn</th><th>Khách hàng</th><th>SĐT</th><th>Ngày giao</th><th>Trạng thái</th><th>Dư nợ</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "so-no_khach-hang.xls";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDebtAccountsPdf = () => {
    if (filteredOrders.length === 0) {
      toast.error("Không có dữ liệu sổ nợ để xuất");
      return;
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    registerVietnameseFont(doc);
    doc.setFont("BeVietnamPro", "bold");
    doc.setFontSize(13);
    doc.text("SỔ NỢ THEO ĐƠN", 105, 14, { align: "center" });
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(10);
    doc.text(`Bộ lọc: ${debtFilterLabel} · Tháng giao ${debtMonthLabel}`, 14, 22);
    doc.text(`Tổng dư nợ (theo bộ lọc): ${formatVND(filteredDebtTotal)}`, 14, 28);
    autoTable(doc, {
      startY: 34,
      head: [["STT", "Mã đơn", "Khách hàng", "SĐT", "Ngày giao", "TT", "Dư nợ"]],
      body: filteredOrders.map((o, idx) => [
        idx + 1,
        o.order_code,
        o.customer_name,
        o.phone ?? "—",
        formatDeliveryDate(o.delivery_date),
        debtStatusLabel(o.outstanding_amount),
        formatVND(o.outstanding_amount),
      ]),
      headStyles: { fillColor: [15, 118, 110], textColor: 255, font: "BeVietnamPro", fontStyle: "bold" },
      styles: { font: "BeVietnamPro", fontSize: 9, cellPadding: 2 },
      bodyStyles: { font: "BeVietnamPro", fontStyle: "normal" },
      columnStyles: { 4: { halign: "right" } },
    });
    doc.save("so-no_khach-hang.pdf");
  };

  return (
    <AppLayout
      title="Tài chính & quản trị"
      description="Nợ theo hạn và theo loại — xem nhanh doanh thu kỳ để biết ưu tiên thu nào trước."
      actions={
        <div className="flex items-center gap-2">
          <Select value={rangeDays} onValueChange={setRangeDays}>
            <SelectTrigger className="h-11 w-[124px] bg-background" aria-label="Khoảng thời gian báo cáo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 ngày</SelectItem>
              <SelectItem value="30">30 ngày</SelectItem>
              <SelectItem value="90">90 ngày</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => void load()}>
            Làm mới
          </Button>
        </div>
      }
    >
      <AsyncStatePanel state={state} title={state === "error" ? "Không tải được dữ liệu tài chính" : undefined} description={error ?? undefined} onRetry={() => void load()} />

      {state === "success" && (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-11">
            <TabsTrigger value="overview" className="min-h-11 px-4">Tổng quan</TabsTrigger>
            <TabsTrigger value="accounts" className="min-h-11 px-4">Sổ nợ</TabsTrigger>
            <TabsTrigger value="shell-debt" className="min-h-11 px-4">Sổ nợ vỏ</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Doanh thu thuần</p>
              <p className="mt-1 text-xl font-semibold">{formatVND(totals.revenue)}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Số đơn / AOV</p>
              <p className="mt-1 text-xl font-semibold">{totals.orderCount.toLocaleString("vi-VN")} / {formatVND(totals.avgOrder)}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Nợ chưa thu (Sổ nợ) đến cuối {debtMonthLabel}</p>
              <p className="mt-1 text-xl font-semibold">{formatVND(debtTotal)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{openDebtOrders} đơn còn nợ</p>
            </Card>
            <Card className="p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Tiền lời (ước tính)</p>
              <p className="mt-1 text-xl font-semibold">{formatVND(totals.grossProfit)}</p>
            </Card>
          </div>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Xu hướng doanh thu và nợ còn trên đơn theo ngày</h2>
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <p className="sr-only">
              Hai đường: doanh thu và nợ còn trên đơn tạo trong kỳ theo ngày. Tổng Sổ nợ hiện tại nằm ở KPI phía trên.
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" interval={chartInterval} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}tr` : String(v))} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatVND(value), name === "revenue" ? "Doanh thu" : "Nợ còn trên đơn trong kỳ"]}
                    labelFormatter={(label) => `Ngày ${label}`}
                  />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" name="Doanh thu" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" name="Nợ còn trên đơn trong kỳ" dataKey="outstanding" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 shadow-card">
              <h2 className="mb-3 text-sm font-semibold">Aging công nợ (bar chart)</h2>
              <p className="sr-only">Cột theo nhóm ngày quá hạn: tổng dư nợ trong từng khoảng thời gian.</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}tr` : String(v))} />
                    <Tooltip formatter={(value: number) => [formatVND(value), "Dư nợ"]} />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
                    <Bar name="Dư nợ" dataKey="amount" fill="hsl(var(--warning))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 shadow-card">
              <h2 className="mb-3 text-sm font-semibold">Tỷ trọng trạng thái nợ</h2>
              <p className="sr-only">Tỷ lệ số đơn đã trả hết và còn dư nợ.</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={debtStatusData} dataKey="value" innerRadius={50} outerRadius={90}>
                      {debtStatusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value.toLocaleString("vi-VN"), "Số đơn"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold">Top khách còn nợ</h2>
              <p className="text-xs text-muted-foreground">Bấm cột để mở khách tương ứng trong tab Sổ nợ.</p>
            </div>
            <p className="sr-only">Biểu đồ cột dư nợ theo khách; chọn cột để xem chi tiết trong Sổ nợ.</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDebtChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" interval={0} angle={-18} height={52} textAnchor="end" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}tr` : String(v))} />
                  <Tooltip formatter={(value: number) => [formatVND(value), "Dư nợ"]} />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--destructive))"
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    name="Dư nợ"
                    onClick={(barSegment: { payload?: TopDebtorChartRow }) => {
                      const row = barSegment.payload;
                      const id = row && typeof row.id === "number" ? row.id : undefined;
                      if (typeof id === "number") {
                        setSelectedOrderId(id);
                        setTab("accounts");
                        window.requestAnimationFrame(() => {
                          document.getElementById("finance-debt-accounts")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        });
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">KPI tài chính - nguồn đo lường</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Mục tiêu</TableHead>
                    <TableHead>Nguồn dữ liệu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FINANCE_KPI_DEFINITIONS.map((kpi) => (
                    <TableRow key={kpi.key}>
                      <TableCell className="font-medium">{kpi.label}</TableCell>
                      <TableCell>{kpi.target}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{kpi.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4">
            <Card id="finance-debt-accounts" className="p-4 shadow-card space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="grid min-w-[200px] flex-1 gap-1.5">
                  <Label>Tìm mã đơn / khách / SĐT</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ví dụ: DH-… / 0909…" />
                </div>
                <div className="grid min-w-[160px] gap-1.5">
                  <Label>Tháng công nợ</Label>
                  <Input
                    type="month"
                    value={debtMonth}
                    onChange={(e) => setDebtMonth(e.target.value || currentMonthValue())}
                    aria-label="Lọc công nợ theo tháng"
                  />
                </div>
                <div className="grid min-w-[160px] gap-1.5">
                  <Label>Trạng thái nợ</Label>
                  <Select value={debtStatusFilter} onValueChange={(v) => setDebtStatusFilter(v as DebtStatusFilter)}>
                    <SelectTrigger className="h-11 bg-background" aria-label="Lọc trạng thái nợ">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="open">Còn nợ</SelectItem>
                      <SelectItem value="paid">Đã trả</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="secondary" className="gap-1">
                      <FileText className="h-4 w-4" /> Xuất danh sách nợ
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportDebtAccountsPdf}>PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportDebtAccountsExcel}>Excel</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportDebtAccountsCsv}>CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">
                Lọc theo ngày giao trong tháng {debtMonthLabel}; mỗi dòng là một đơn nợ độc lập.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã đơn</TableHead>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>SĐT</TableHead>
                      <TableHead>Ngày giao</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Dư nợ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((o) => (
                      <TableRow
                        key={o.id}
                        className={`${selectedOrderId === o.id ? "bg-muted/40" : ""} cursor-pointer`}
                        onClick={() => {
                          setSelectedOrderId(o.id);
                          setHistoryOpen(true);
                        }}
                      >
                        <TableCell className="font-mono text-sm">{o.order_code}</TableCell>
                        <TableCell className="font-medium text-primary">{o.customer_name}</TableCell>
                        <TableCell>{o.phone ?? "—"}</TableCell>
                        <TableCell>{formatDeliveryDate(o.delivery_date)}</TableCell>
                        <TableCell>{debtStatusLabel(o.outstanding_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatVND(o.outstanding_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="shell-debt" className="space-y-4">
            <ShellDebtLedgerTab />
          </TabsContent>
        </Tabs>
      )}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Giao dịch công nợ trong tháng {debtMonthLabel}</SheetTitle>
            <SheetDescription>
              {selectedOrder
                ? `${selectedOrder.order_code} · ${selectedOrder.customer_name} · Ngày giao ${formatDeliveryDate(selectedOrder.delivery_date)} · Dư nợ: ${formatVND(selectedOrder.outstanding_amount)}`
                : "Chọn đơn từ Sổ nợ để xem lịch sử công nợ"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setPaymentShellInput(0);
                setPaymentOpen(true);
              }} disabled={!selectedOrderId || Number(selectedOrder?.outstanding_amount || 0) <= 0}>
                Thu nợ
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="secondary" className="gap-1" disabled={repaymentHistory.length === 0}>
                    <FileText className="h-4 w-4" /> Xuất file
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportHistoryPdf}>PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportHistoryExcel}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportHistoryCsv}>CSV</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Nghiệp vụ</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-right">Vỏ trả</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                    <TableHead className="text-right">Tác vụ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repaymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Chưa có giao dịch công nợ trong tháng này.
                      </TableCell>
                    </TableRow>
                  ) : (
                    repaymentHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                        <TableCell>{debtTypeLabel(row.entry_type)}</TableCell>
                        <TableCell>{row.note || "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.entry_type === "payment" ? Number(row.returned_shell_units ?? 0) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatVND(Math.abs(Number(row.amount_signed)))}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.entry_type === "payment" && Number(row.reference_id || 0) > 0 ? (
                            <div className="flex justify-end gap-1">
                              <Button type="button" variant="outline" size="icon" onClick={() => openEditPayment(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" variant="outline" size="icon" onClick={() => void deletePayment(row)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thu nợ theo đơn</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {selectedOrder ? (
              <p className="text-sm text-muted-foreground">
                {selectedOrder.order_code} · {selectedOrder.customer_name} · Dư nợ tối đa {formatVND(selectedOrder.outstanding_amount)}
              </p>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Số tiền thu (₫)</Label>
              <Input type="number" min={0} value={amountInput} onChange={(e) => setAmountInput(Number(e.target.value || 0))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Số vỏ khách trả kèm thanh toán</Label>
              <Input
                type="number"
                min={0}
                className="min-h-11"
                value={paymentShellInput}
                onChange={(e) => setPaymentShellInput(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ghi chú</Label>
              <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Ví dụ: khách chuyển khoản đợt 1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Hủy
            </Button>
            <Button onClick={submitPayment} disabled={savingAction}>
              {savingAction ? "Đang lưu..." : "Xác nhận thu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentEditOpen} onOpenChange={setPaymentEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa giao dịch thu nợ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Số tiền thu (₫)</Label>
              <Input type="number" min={0} value={amountInput} onChange={(e) => setAmountInput(Number(e.target.value || 0))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Số vỏ khách trả kèm thanh toán</Label>
              <Input
                type="number"
                min={0}
                className="min-h-11"
                value={paymentShellInput}
                onChange={(e) => setPaymentShellInput(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ghi chú</Label>
              <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentEditOpen(false)}>
              Hủy
            </Button>
            <Button onClick={submitEditPayment} disabled={savingAction}>
              {savingAction ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
