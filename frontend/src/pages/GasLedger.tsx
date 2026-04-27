import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiExportPath } from "@/lib/api";
import { formatDate } from "@/lib/format";

/** Row shape from ``GET /api/gas-ledger`` (aligned with ``sổ gas.xlsx``). */
interface GasLedgerRow {
  owner_name: string | null;
  cylinder_type: string | null;
  cylinder_serial: string | null;
  inspection_expiry: string | null;
  import_source: string | null;
  import_date: string | null;
  customer_name_and_address: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  delivery_date: string | null;
}

export default function GasLedger() {
  const [rows, setRows] = useState<GasLedgerRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<GasLedgerRow[]>("/api/gas-ledger");
        setRows(data ?? []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải được sổ gas");
      }
    })();
  }, []);

  return (
    <AppLayout
      title="Sổ gas"
      description="Chỉ hiển thị các dòng đơn đã đủ thông tin theo mẫu sổ Excel"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" asChild>
            <a href={apiExportPath("/api/gas-ledger.csv")} download>
              <Download className="h-4 w-4" /> Sổ gas (.csv)
            </a>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <a href={apiExportPath("/api/sales-gas-export.csv")} download>
              <Download className="h-4 w-4" /> Đơn + gas (full .csv)
            </a>
          </Button>
        </div>
      }
    >
      <Card className="shadow-card overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-3 text-center font-semibold">
          Sổ theo dõi các thông tin sau về chai chứa LPG
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chủ sở hữu</TableHead>
                <TableHead>Loại chai</TableHead>
                <TableHead>Số sê ri chai</TableHead>
                <TableHead>Hạn kiểm định</TableHead>
                <TableHead>Nơi nhập chai chứa cho cửa hàng</TableHead>
                <TableHead>Ngày nhập</TableHead>
                <TableHead>Tên và địa chỉ khách hàng sử dụng</TableHead>
                <TableHead>SĐT khách</TableHead>
                <TableHead>Địa chỉ (riêng)</TableHead>
                <TableHead>Ngày giao chai cho khách hàng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    Chưa có dòng đủ điều kiện sổ gas. Chỉ các dòng đơn đã điền đầy đủ SĐT, địa chỉ, ngày giao và toàn bộ
                    trường chai (chủ sở hữu, loại, số sê ri, hạn kiểm định, nơi nhập, ngày nhập) mới xuất hiện ở đây.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="max-w-[120px] truncate">{r.owner_name ?? ""}</TableCell>
                    <TableCell className="max-w-[100px] truncate">{r.cylinder_type ?? ""}</TableCell>
                    <TableCell className="font-mono text-xs">{r.cylinder_serial ?? ""}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.inspection_expiry ? formatDate(r.inspection_expiry) : ""}
                    </TableCell>
                    <TableCell className="max-w-[140px] text-sm">{r.import_source ?? ""}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.import_date ? formatDate(r.import_date) : ""}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-sm">{r.customer_name_and_address}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.customer_phone ?? ""}</TableCell>
                    <TableCell className="max-w-[160px] text-xs">{r.customer_address ?? ""}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.delivery_date ? formatDate(r.delivery_date) : ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppLayout>
  );
}
