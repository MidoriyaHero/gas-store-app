import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";

/** ``YYYY-MM-DD`` for date inputs. */
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Product {
  id: number;
  name: string;
  sku: string | null;
  stock_quantity: number;
  is_active: boolean;
}

interface StockReceiptRow {
  id: number;
  product_id: number;
  product_name: string | null;
  receipt_date: string;
  quantity: number;
  receipt_kind: string;
  note: string | null;
  created_at: string;
}

/** Warehouse ledger: inbound receipts only. Catalog prices live on Sản phẩm. */
export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<StockReceiptRow[]>([]);
  const [filterDate, setFilterDate] = useState("");
  const [productId, setProductId] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayLocalIso);
  const [receiptQty, setReceiptQty] = useState(1);
  const [receiptNote, setReceiptNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProducts = async () => {
    try {
      const data = await apiGet<Product[]>("/api/products");
      setProducts(data ?? []);
    } catch {
      toast.error("Không tải được sản phẩm");
    }
  };

  const loadReceipts = async () => {
    try {
      const qs = filterDate ? `?receipt_date=${encodeURIComponent(filterDate)}` : "";
      const data = await apiGet<StockReceiptRow[]>(`/api/stock-receipts${qs}`);
      setReceipts(data ?? []);
    } catch {
      toast.error("Không tải được sổ nhập");
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    void loadReceipts();
  }, [filterDate]);

  const submitReceipt = async () => {
    if (!productId) {
      toast.error("Chọn sản phẩm");
      return;
    }
    if (receiptQty < 1) {
      toast.error("Số lượng nhập phải ≥ 1");
      return;
    }
    setSaving(true);
    try {
      await apiPost<StockReceiptRow>(`/api/products/${productId}/stock-receipts`, {
        receipt_date: receiptDate,
        quantity: receiptQty,
        note: receiptNote.trim() || null,
      });
      toast.success("Đã ghi nhận nhập kho");
      setReceiptQty(1);
      setReceiptNote("");
      await loadReceipts();
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi nhập kho");
    }
    setSaving(false);
  };

  const inboundToday = receipts
    .filter((r) => r.receipt_kind === "inbound" && r.receipt_date === (filterDate || todayLocalIso()))
    .reduce((s, r) => s + r.quantity, 0);

  return (
    <AppLayout
      title="Kho hàng"
      description="Sổ phiếu nhập. Số nhập trong ngày tự cộng vào kiểm kê vận hành."
      actions={
        <Button variant="outline" asChild>
          <Link to="/san-pham">Sửa giá / sản phẩm</Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px),minmax(0,1fr)]">
        <Card className="p-4 shadow-card">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <PackagePlus className="h-4 w-4" /> Nhập gas
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Cộng tồn SKU và cộng số bình đầy nhận trong ngày trên Vận hành hằng ngày.
          </p>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Sản phẩm *</Label>
              <Select value={productId || undefined} onValueChange={setProductId}>
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Chọn loại bình / mặt hàng" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} (tồn {p.stock_quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Ngày nhập</Label>
              <Input type="date" className="min-h-11" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Số lượng *</Label>
              <Input
                type="number"
                min={1}
                className="min-h-11"
                value={receiptQty}
                onChange={(e) => setReceiptQty(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ghi chú</Label>
              <Textarea rows={2} value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} />
            </div>
            <Button className="min-h-11" onClick={() => void submitReceipt()} disabled={saving}>
              {saving ? "Đang lưu..." : "Ghi nhận nhập"}
            </Button>
          </div>
        </Card>

        <Card className="shadow-card">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Sổ phiếu</h2>
              {filterDate ? (
                <p className="text-xs text-muted-foreground">
                  Nhập inbound ngày {filterDate}: {inboundToday} bình
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Mọi ngày · lọc để xem một ngày</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-date">Lọc ngày</Label>
              <Input
                id="filter-date"
                type="date"
                className="min-h-11 w-44"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Chưa có phiếu nhập.
                    </TableCell>
                  </TableRow>
                ) : (
                  receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.receipt_date}</TableCell>
                      <TableCell>{r.product_name || `#${r.product_id}`}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.receipt_kind === "opening" ? "Tồn đầu" : "Nhập"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">+{r.quantity}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.note || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
