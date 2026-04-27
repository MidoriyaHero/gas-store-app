import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Search, Download } from "lucide-react";
import { formatVND } from "@/lib/format";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, apiExportPath } from "@/lib/api";

interface Product {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  cost_price: string | number;
  sell_price: string | number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
}

const empty = { name: "", sku: "", description: "", cost_price: 0, sell_price: 0, stock_quantity: 0, low_stock_threshold: 10 };
type InventoryTab = "active" | "archived";

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [tab, setTab] = useState<InventoryTab>("active");

  const load = async () => {
    try {
      const data = await apiGet<Product[]>("/api/products?include_inactive=true");
      setProducts(data ?? []);
    } catch {
      toast.error("Không tải được sản phẩm");
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      description: p.description ?? "",
      cost_price: Number(p.cost_price),
      sell_price: Number(p.sell_price),
      stock_quantity: p.stock_quantity,
      low_stock_threshold: p.low_stock_threshold,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Tên sản phẩm không được trống");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      cost_price: Number(form.cost_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      stock_quantity: Number(form.stock_quantity) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
    };
    try {
      if (editing) {
        await apiPatch<Product>(`/api/products/${editing.id}`, payload);
        toast.success("Đã cập nhật sản phẩm");
      } else {
        await apiPost<Product>("/api/products", payload);
        toast.success("Đã thêm sản phẩm");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSaving(false);
  };

  const performDeleteProduct = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/products/${deleteTarget.id}`);
      toast.success("Đã xóa");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      throw e;
    }
  };

  const toggleArchiveProduct = async (p: Product, nextActive: boolean) => {
    try {
      await apiPatch<Product>(`/api/products/${p.id}`, { is_active: nextActive });
      toast.success(nextActive ? "Đã khôi phục sản phẩm" : "Đã lưu trữ sản phẩm");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
  };

  const filtered = products.filter(
    (p) =>
      (tab === "active" ? p.is_active : !p.is_active) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase())),
  );
  const activeCount = products.filter((p) => p.is_active).length;
  const archivedCount = products.length - activeCount;

  return (
    <AppLayout
      title="Kho hàng"
      description={`${tab === "active" ? activeCount : archivedCount} sản phẩm`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1" asChild>
            <a href={apiExportPath("/api/products-export.csv")} download>
              <Download className="h-4 w-4" /> Xuất CSV kho
            </a>
          </Button>
          <Button onClick={openNew} className="gap-1">
            <Plus className="h-4 w-4" /> Thêm sản phẩm
          </Button>
        </div>
      }
    >
      <Card className="shadow-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={(value) => setTab(value as InventoryTab)}>
            <TabsList>
              <TabsTrigger value="active">Đang bán</TabsTrigger>
              <TabsTrigger value="archived">Lưu trữ</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên hoặc SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Giá nhập</TableHead>
                <TableHead className="text-right">Giá bán</TableHead>
                <TableHead className="text-right">Tồn kho</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {tab === "active"
                      ? "Chưa có sản phẩm đang bán. Bấm \"Thêm sản phẩm\" để bắt đầu."
                      : "Chưa có sản phẩm lưu trữ."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const low = p.stock_quantity <= p.low_stock_threshold;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.description && <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{p.sku || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{formatVND(p.cost_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatVND(p.sell_price)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.stock_quantity === 0 ? "destructive" : low ? "secondary" : "outline"}>{p.stock_quantity}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleArchiveProduct(p, !p.is_active)}>
                            {p.is_active ? "Lưu trữ" : "Khôi phục"}
                          </Button>
                          {!p.is_active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(p)}
                              aria-label={`Xóa sản phẩm ${p.name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DestructiveConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title="Xóa sản phẩm?"
        description={
          deleteTarget
            ? `Mặt hàng "${deleteTarget.name}" sẽ bị gỡ khỏi kho. Thao tác này không hoàn tác.`
            : ""
        }
        onConfirm={performDeleteProduct}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa sản phẩm" : "Thêm sản phẩm"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Tên sản phẩm *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Tồn kho</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Giá nhập (₫)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Giá bán (₫)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sell_price}
                  onChange={(e) => setForm({ ...form, sell_price: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Ngưỡng cảnh báo hết hàng</Label>
              <Input
                type="number"
                min={0}
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Mô tả</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
