import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, FileText, Pencil, Trash2, TrendingUp } from "lucide-react";
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

interface OrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  total: number | string;
  created_at: string;
  outstanding_amount?: number | string;
}

interface OrdersEnvelope {
  items: OrderRow[];
  total: number;
}

const BUCKETS = ["0-7 ngày", "8-15 ngày", "16-30 ngày", "31+ ngày"] as const;

interface DebtAccountRow {
  id: number;
  customer_name: string;
  phone: string;
  current_balance: number | string;
  status: string;
}

interface DebtLedgerRow {
  id: number;
  entry_type: string;
  amount_signed: number | string;
  note: string | null;
  reference_id?: string | null;
  created_at: string;
}

interface DebtDetailPayload {
  account: DebtAccountRow;
  ledger: DebtLedgerRow[];
}

interface DebtAgingRow {
  bucket: string;
  amount: number | string;
}

/**
 * Finance and governance screen based on sales orders dataset.
 */
export default function FinanceGovernance() {
  const [state, setState] = useState<AsyncViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [rangeDays, setRangeDays] = useState("30");
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<DebtAccountRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<DebtLedgerRow[]>([]);
  const [aging, setAging] = useState<DebtAgingRow[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentEditOpen, setPaymentEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [amountInput, setAmountInput] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const payload = await apiGet<OrdersEnvelope>("/api/orders?limit=100&offset=0");
      const debtAccounts = await apiGet<DebtAccountRow[]>("/api/debt-accounts?status=all&limit=200");
      const agingRows = await apiGet<DebtAgingRow[]>("/api/debt-aging");
      const rows = payload.items ?? [];
      setOrders(rows);
      setAccounts(debtAccounts ?? []);
      setAging(agingRows ?? []);
      if (debtAccounts.length > 0 && selectedAccountId === null) setSelectedAccountId(debtAccounts[0].id);
      setState(rows.length > 0 ? "success" : "empty");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu tài chính");
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const cut = new Date();
    cut.setDate(cut.getDate() - Number(rangeDays));
    return orders.filter((o) => new Date(o.created_at) >= cut);
  }, [orders, rangeDays]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const orderCount = filtered.length;
    const avgOrder = orderCount > 0 ? revenue / orderCount : 0;
    const grossProfit = Math.round(revenue * 0.18);
    return { revenue, orderCount, avgOrder, grossProfit };
  }, [filtered]);

  const agingBuckets = useMemo(() => {
    const byBucket = new Map(aging.map((x) => [x.bucket, Number(x.amount || 0)]));
    return BUCKETS.map((b) => byBucket.get(b) ?? 0);
  }, [aging]);

  const debtTotal = useMemo(
    () => accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.customer_name.toLowerCase().includes(q) || (a.phone ?? "").toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );
  const repaymentHistory = useMemo(
    () => selectedLedger.filter((row) => Number(row.amount_signed) < 0),
    [selectedLedger]
  );

  const debtStatusLabel = (balance: number | string) => (Number(balance) <= 0 ? "Đã trả" : "Còn nợ");
  const debtTypeLabel = (entryType: string) => {
    if (entryType === "payment") return "Trả nợ";
    if (entryType === "write_off") return "Xóa nợ (write-off)";
    if (entryType === "adjustment") return "Điều chỉnh";
    if (entryType === "invoice") return "Phát sinh nợ";
    return entryType;
  };

  const loadDetail = useCallback(async () => {
    if (!selectedAccountId) {
      setSelectedLedger([]);
      return;
    }
    const detail = await apiGet<DebtDetailPayload>(`/api/debt-accounts/${selectedAccountId}`);
    setSelectedLedger(detail.ledger ?? []);
  }, [selectedAccountId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const submitPayment = async () => {
    if (!selectedAccountId || amountInput <= 0) return;
    setSavingAction(true);
    try {
      await apiPost("/api/debt-payments", {
        debt_account_id: selectedAccountId,
        amount: amountInput,
        payment_method: "cash",
        note: paymentNote.trim() || null,
      });
      toast.success("Đã thu nợ");
      setPaymentOpen(false);
      setAmountInput(0);
      setPaymentNote("");
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
    setPaymentEditOpen(true);
  };

  const submitEditPayment = async () => {
    if (!editingPaymentId || amountInput <= 0) return;
    setSavingAction(true);
    try {
      await apiPatch(`/api/debt-payments/${editingPaymentId}`, {
        amount: amountInput,
        note: paymentNote.trim() || null,
      });
      toast.success("Đã cập nhật giao dịch thu nợ");
      setPaymentEditOpen(false);
      setEditingPaymentId(null);
      setAmountInput(0);
      setPaymentNote("");
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
    if (!selectedAccount || repaymentHistory.length === 0) {
      toast.error("Không có lịch sử trả nợ để xuất");
      return;
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    registerVietnameseFont(doc);
    doc.setFont("BeVietnamPro", "bold");
    doc.setFontSize(13);
    doc.text("LỊCH SỬ TRẢ NỢ KHÁCH HÀNG", 105, 14, { align: "center" });
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(10);
    doc.text(`Khách hàng: ${selectedAccount.customer_name}`, 14, 22);
    doc.text(`Số điện thoại: ${selectedAccount.phone}`, 14, 28);
    doc.text(`Dư nợ hiện tại: ${formatVND(selectedAccount.current_balance)}`, 14, 34);

    autoTable(doc, {
      startY: 40,
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
    const safePhone = selectedAccount.phone.replace(/[^\d+]/g, "");
    doc.save(`lich-su-tra-no_${safePhone || "khach-hang"}.pdf`);
  };

  const exportHistoryCsv = () => {
    if (!selectedAccount || repaymentHistory.length === 0) {
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
    a.download = `lich-su-tra-no_${selectedAccount.phone.replace(/[^\d+]/g, "") || "khach-hang"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHistoryExcel = () => {
    if (!selectedAccount || repaymentHistory.length === 0) {
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
    a.download = `lich-su-tra-no_${selectedAccount.phone.replace(/[^\d+]/g, "") || "khach-hang"}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDebtAccountsCsv = () => {
    if (filteredAccounts.length === 0) {
      toast.error("Không có dữ liệu sổ nợ để xuất");
      return;
    }
    const header = ["STT", "Khách hàng", "Số điện thoại", "Trạng thái", "Dư nợ"];
    const body = filteredAccounts.map((a, idx) => [
      String(idx + 1),
      a.customer_name,
      a.phone,
      debtStatusLabel(a.current_balance),
      String(Number(a.current_balance || 0)),
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
    if (filteredAccounts.length === 0) {
      toast.error("Không có dữ liệu sổ nợ để xuất");
      return;
    }
    const rows = filteredAccounts
      .map(
        (a, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${a.customer_name}</td>
          <td>${a.phone}</td>
          <td>${debtStatusLabel(a.current_balance)}</td>
          <td style="text-align:right">${Number(a.current_balance || 0).toLocaleString("vi-VN")}</td>
        </tr>`
      )
      .join("");
    const html = `
      <table border="1">
        <thead>
          <tr><th>STT</th><th>Khách hàng</th><th>Số điện thoại</th><th>Trạng thái</th><th>Dư nợ</th></tr>
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
    if (filteredAccounts.length === 0) {
      toast.error("Không có dữ liệu sổ nợ để xuất");
      return;
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    registerVietnameseFont(doc);
    doc.setFont("BeVietnamPro", "bold");
    doc.setFontSize(13);
    doc.text("SỔ NỢ KHÁCH HÀNG", 105, 14, { align: "center" });
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(10);
    doc.text(`Tổng dư nợ: ${formatVND(debtTotal)}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["STT", "Khách hàng", "Số điện thoại", "Trạng thái", "Dư nợ"]],
      body: filteredAccounts.map((a, idx) => [
        idx + 1,
        a.customer_name,
        a.phone,
        debtStatusLabel(a.current_balance),
        formatVND(a.current_balance),
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
      description="Dashboard doanh thu, biên lợi nhuận và aging công nợ theo dữ liệu đơn hàng"
      actions={
        <div className="flex items-center gap-2">
          <Select value={rangeDays} onValueChange={setRangeDays}>
            <SelectTrigger className="h-10 w-[124px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 ngày</SelectItem>
              <SelectItem value="30">30 ngày</SelectItem>
              <SelectItem value="90">90 ngày</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Làm mới
          </Button>
        </div>
      }
    >
      <AsyncStatePanel state={state} title={state === "error" ? "Không tải được dữ liệu tài chính" : undefined} description={error ?? undefined} onRetry={() => void load()} />

      {state === "success" && (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Tổng quan</TabsTrigger>
            <TabsTrigger value="accounts">Sổ nợ</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Doanh thu thuần" value={formatVND(totals.revenue)} icon={<TrendingUp className="h-4 w-4" />} />
            <MetricCard title="Số đơn" value={String(totals.orderCount)} icon={<BarChart3 className="h-4 w-4" />} />
            <MetricCard title="AOV" value={formatVND(totals.avgOrder)} icon={<TrendingUp className="h-4 w-4" />} />
            <MetricCard title="Lợi nhuận gộp ước tính" value={formatVND(totals.grossProfit)} icon={<BarChart3 className="h-4 w-4" />} />
            <MetricCard title="Tổng dư nợ" value={formatVND(debtTotal)} icon={<BarChart3 className="h-4 w-4" />} />
          </div>

          <Card className="p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Aging công nợ (dữ liệu thực)</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {BUCKETS.map((bucket, idx) => (
                <div key={bucket} className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{bucket}</p>
                  <p className="mt-1 text-lg font-semibold">{formatVND(agingBuckets[idx])}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Drill-down đơn hàng gần nhất</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã đơn</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 20).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                      <TableCell className="text-right font-medium">{formatVND(o.outstanding_amount ?? o.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            <Card className="p-4 shadow-card space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="grid min-w-[240px] flex-1 gap-1.5">
                  <Label>Tìm khách hàng / số điện thoại</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ví dụ: 0909..." />
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>SĐT</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Dư nợ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((a) => (
                      <TableRow
                        key={a.id}
                        className={`${selectedAccountId === a.id ? "bg-muted/40" : ""} cursor-pointer`}
                        onClick={() => {
                          setSelectedAccountId(a.id);
                          setHistoryOpen(true);
                        }}
                      >
                        <TableCell className="font-medium text-primary">{a.customer_name}</TableCell>
                        <TableCell>{a.phone}</TableCell>
                        <TableCell>{debtStatusLabel(a.current_balance)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatVND(a.current_balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Lịch sử trả nợ</SheetTitle>
            <SheetDescription>
              {selectedAccount
                ? `${selectedAccount.customer_name} - ${selectedAccount.phone} | Dư nợ: ${formatVND(selectedAccount.current_balance)}`
                : "Chọn khách hàng từ Sổ nợ để xem lịch sử trả nợ"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(true)} disabled={!selectedAccountId}>
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
                    <TableHead className="text-right">Giá trị</TableHead>
                    <TableHead className="text-right">Tác vụ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repaymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        Chưa có lịch sử trả nợ.
                      </TableCell>
                    </TableRow>
                  ) : (
                    repaymentHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                        <TableCell>{debtTypeLabel(row.entry_type)}</TableCell>
                        <TableCell>{row.note || "-"}</TableCell>
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
            <DialogTitle>Thu nợ khách hàng</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Số tiền thu (₫)</Label>
              <Input type="number" min={0} value={amountInput} onChange={(e) => setAmountInput(Number(e.target.value || 0))} />
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

function MetricCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <Card className="p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{title}</span>
        {icon}
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </Card>
  );
}
