import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { registerVietnameseFont } from "@/lib/fonts/registerVietnameseFont";
import { apiGet } from "@/lib/api";

interface OrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  subtotal: string | number;
  vat_rate: number;
  vat_amount: string | number;
  total: string | number;
  created_at: string;
}

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

export default function TaxReport() {
  const [from, setFrom] = useState<string>(monthStart());
  const [to, setTo] = useState<string>(today());
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState("Công ty TNHH ABC");
  const [companyTax, setCompanyTax] = useState("0123456789");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const data = await apiGet<OrderRow[]>(`/api/orders/tax-report?${params.toString()}`);
      setRows(data ?? []);
      toast.success(`Tải ${data?.length ?? 0} đơn`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      setRows([]);
    }
    setLoading(false);
  };

  const totalSubtotal = rows.reduce((s, r) => s + Number(r.subtotal), 0);
  const totalVat = rows.reduce((s, r) => s + Number(r.vat_amount), 0);
  const totalAmount = rows.reduce((s, r) => s + Number(r.total), 0);

  const exportCSV = () => {
    if (rows.length === 0) {
      toast.error("Chưa có dữ liệu để xuất");
      return;
    }
    const header = ["STT", "Ngay", "So hoa don", "Ten khach hang", "So dien thoai", "Doanh thu chua thue", "Thue suat (%)", "Tien thue GTGT", "Tong cong"];
    const lines = rows.map((r, i) =>
      [
        i + 1,
        formatDate(r.created_at),
        r.order_code,
        `"${r.customer_name.replace(/"/g, '""')}"`,
        r.phone ?? "",
        r.subtotal,
        r.vat_rate,
        r.vat_amount,
        r.total,
      ].join(","),
    );
    const totalLine = ["", "", "", "TONG CONG", "", totalSubtotal, "", totalVat, totalAmount].join(",");
    const csv = "\uFEFF" + [header.join(","), ...lines, totalLine].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bao-cao-thue_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (rows.length === 0) {
      toast.error("Chưa có dữ liệu để xuất");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    registerVietnameseFont(doc);

    doc.setFont("BeVietnamPro", "bold");
    doc.setFontSize(14);
    doc.text("BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ BÁN RA", 148, 14, { align: "center" });
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(10);
    doc.text(`Đơn vị: ${companyName}`, 14, 22);
    doc.text(`Mã số thuế: ${companyTax}`, 14, 28);
    doc.text(`Kỳ báo cáo: từ ${formatDate(from)} đến ${formatDate(to)}`, 14, 34);

    autoTable(doc, {
      startY: 40,
      head: [["STT", "Ngày", "Số HĐ", "Khách hàng", "SĐT", "DT chưa thuế", "VAT %", "Tiền thuế", "Tổng cộng"]],
      body: rows.map((r, i) => [
        i + 1,
        formatDate(r.created_at),
        r.order_code,
        r.customer_name,
        r.phone ?? "",
        formatVND(r.subtotal),
        `${r.vat_rate}%`,
        formatVND(r.vat_amount),
        formatVND(r.total),
      ]),
      foot: [["", "", "", "TỔNG CỘNG", "", formatVND(totalSubtotal), "", formatVND(totalVat), formatVND(totalAmount)]],
      headStyles: { fillColor: [20, 165, 155], textColor: 255, font: "BeVietnamPro", fontStyle: "bold" },
      footStyles: { fillColor: [240, 245, 245], textColor: 20, font: "BeVietnamPro", fontStyle: "bold" },
      styles: { font: "BeVietnamPro", fontSize: 8, cellPadding: 2 },
      bodyStyles: { font: "BeVietnamPro", fontStyle: "normal" },
      columnStyles: { 5: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    doc.setFont("BeVietnamPro", "normal");
    doc.setFontSize(9);
    doc.text(`Người lập biểu`, 220, finalY);
    doc.text(`Ngày ${formatDate(new Date())}`, 220, finalY + 5);
    doc.save(`bao-cao-thue_${from}_${to}.pdf`);
  };

  return (
    <AppLayout title="Báo cáo thuế" description="Bảng kê hóa đơn bán ra theo kỳ">
      <Card className="p-5 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Tên đơn vị</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Mã số thuế</Label>
            <Input value={companyTax} onChange={(e) => setCompanyTax(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Tải dữ liệu
          </Button>
          <Button variant="outline" onClick={exportCSV} className="gap-1" disabled={rows.length === 0}>
            <FileSpreadsheet className="h-4 w-4" /> Xuất CSV
          </Button>
          <Button variant="outline" onClick={exportPDF} className="gap-1" disabled={rows.length === 0}>
            <FileText className="h-4 w-4" /> Xuất PDF
          </Button>
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">Doanh thu chưa thuế</p>
              <p className="mt-1 text-xl font-semibold">{formatVND(totalSubtotal)}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">Tiền thuế GTGT</p>
              <p className="mt-1 text-xl font-semibold">{formatVND(totalVat)}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">Tổng cộng</p>
              <p className="mt-1 text-xl font-semibold text-primary">{formatVND(totalAmount)}</p>
            </div>
          </div>

          <Card className="mt-4 shadow-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>STT</TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Số HĐ</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead className="text-right">DT chưa thuế</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Tổng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="text-sm">{formatDate(r.created_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.order_code}</TableCell>
                      <TableCell>{r.customer_name}</TableCell>
                      <TableCell className="text-right">{formatVND(r.subtotal)}</TableCell>
                      <TableCell className="text-right">{formatVND(r.vat_amount)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatVND(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
