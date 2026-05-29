import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiExportPath, apiGet } from "@/lib/api";
import { registerVietnameseFont } from "@/lib/fonts/registerVietnameseFont";
import { formatDate } from "@/lib/format";

export interface ShellDebtLedgerRow {
  order_id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  delivery_date: string | null;
  borrowed_shell_units: number;
  delivery_status: string;
  address: string | null;
}

interface ShellDebtLedgerResponse {
  items: ShellDebtLedgerRow[];
  total: number;
  total_shell_units: number;
}

function deliveryStatusLabel(status: string): string {
  if (status === "completed") return "Hoàn thành";
  if (status === "in_transit") return "Đang giao";
  return status;
}

/** Shell-debt ledger tab: orders with borrowed_shell_units and export actions. */
export function ShellDebtLedgerTab() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<ShellDebtLedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalShellUnits, setTotalShellUnits] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = debounced ? `&q=${encodeURIComponent(debounced)}` : "";
      const data = await apiGet<ShellDebtLedgerResponse>(`/api/shell-debt-ledger?limit=500${q}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalShellUnits(data.total_shell_units ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được sổ nợ vỏ");
      setRows([]);
      setTotal(0);
      setTotalShellUnits(0);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsvClient() {
    if (rows.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }
    const header = ["STT", "Mã đơn", "Khách hàng", "SĐT", "Ngày giao", "Vỏ mượn", "Trạng thái", "Địa chỉ"];
    const body = rows.map((r, idx) => [
      String(idx + 1),
      r.order_code,
      r.customer_name,
      r.phone ?? "",
      r.delivery_date ?? "",
      String(r.borrowed_shell_units),
      deliveryStatusLabel(r.delivery_status),
      r.address ?? "",
    ]);
    const csvRows = [header, ...body].map((line) => line.map((x) => `"${x.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "so_no_vo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    if (rows.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }
    const tableRows = rows
      .map(
        (r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${r.order_code}</td>
          <td>${r.customer_name}</td>
          <td>${r.phone ?? ""}</td>
          <td>${r.delivery_date ?? ""}</td>
          <td style="text-align:right">${r.borrowed_shell_units}</td>
          <td>${deliveryStatusLabel(r.delivery_status)}</td>
          <td>${r.address ?? ""}</td>
        </tr>`,
      )
      .join("");
    const html = `
      <table border="1">
        <thead>
          <tr><th>STT</th><th>Mã đơn</th><th>Khách</th><th>SĐT</th><th>Ngày giao</th><th>Vỏ mượn</th><th>Trạng thái</th><th>Địa chỉ</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "so_no_vo.xls";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (rows.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    registerVietnameseFont(doc);
    doc.setFont("BeVietnamPro", "bold");
    doc.setFontSize(13);
    doc.text("SỔ NỢ VỎ", 148, 14, { align: "center" });
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(10);
    doc.text(`${total} đơn · ${totalShellUnits} bình`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Mã đơn", "Khách", "SĐT", "Ngày giao", "Vỏ", "Trạng thái"]],
      body: rows.map((r) => [
        r.order_code,
        r.customer_name,
        r.phone ?? "",
        r.delivery_date ? formatDate(r.delivery_date) : "",
        String(r.borrowed_shell_units),
        deliveryStatusLabel(r.delivery_status),
      ]),
      styles: { font: "BeVietnamPro", fontSize: 9 },
      headStyles: { font: "BeVietnamPro", fontStyle: "bold" },
    });
    doc.save("so_no_vo.pdf");
  }

  return (
    <Card className="space-y-3 p-4 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid min-w-[240px] flex-1 gap-1.5">
          <Label htmlFor="shell-debt-search">Tìm mã đơn, khách hoặc SĐT</Label>
          <Input
            id="shell-debt-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ví dụ: DH-… hoặc 0909…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void load()} disabled={loading}>
            Làm mới
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" className="gap-1 min-h-11" disabled={rows.length === 0}>
                <FileText className="h-4 w-4" /> Xuất sổ nợ vỏ
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPdf}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}>Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={exportCsvClient}>CSV (trang hiện tại)</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={apiExportPath(`/api/shell-debt-ledger.csv${debounced ? `?q=${encodeURIComponent(debounced)}` : ""}`)} download>
                  CSV (server)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {loading ? "Đang tải…" : `${total} đơn · ${totalShellUnits} bình vỏ mượn`}
        {total > rows.length ? ` (hiển thị ${rows.length} dòng đầu)` : ""}
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã đơn</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>Ngày giao</TableHead>
              <TableHead className="text-right">Vỏ mượn</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {loading ? "Đang tải…" : "Không có đơn nào ghi nợ vỏ."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.order_id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    void navigator.clipboard.writeText(r.order_code);
                    toast.success(`Đã copy ${r.order_code} — mở tab Đơn hàng để sửa`);
                  }}
                >
                  <TableCell className="font-mono text-primary">{r.order_code}</TableCell>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>{r.delivery_date ? formatDate(r.delivery_date) : "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{r.borrowed_shell_units}</TableCell>
                  <TableCell>{deliveryStatusLabel(r.delivery_status)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
