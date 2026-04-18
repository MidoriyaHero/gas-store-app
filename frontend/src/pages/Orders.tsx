import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShoppingBag, FileText, Save, Pencil } from "lucide-react";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, apiExportPath } from "@/lib/api";
import { invoiceDownloadFilename } from "@/lib/invoiceFilename";

/** ``YYYY-MM-DD`` theo giờ máy (dùng cho ``<input type="date" />``). */
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lấy dạng loại chai từ tên SP (vd ``Gas 12kg`` → ``12kg``). */
function cylinderTypeFromProductName(productName: string): string {
  const m = productName.match(/\d+\s*kg/gi);
  if (m) return m[0].replace(/\s+/g, "");
  return productName.trim();
}

interface CylinderTemplate {
  owner_name: string;
  import_source: string;
  inspection_expiry: string;
  import_date: string;
}

const emptyTemplate: CylinderTemplate = { owner_name: "", import_source: "", inspection_expiry: "", import_date: "" };

interface Product {
  id: number;
  name: string;
  sku: string | null;
  sell_price: string | number;
  stock_quantity: number;
}

interface OrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  address?: string | null;
  note?: string | null;
  delivery_date?: string | null;
  store_contact?: string | null;
  vat_rate?: number;
  total: string | number;
  created_at: string;
  order_items: {
    id?: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number | string;
    subtotal: number | string;
    owner_name?: string | null;
    cylinder_type?: string | null;
    cylinder_serial?: string | null;
    inspection_expiry?: string | null;
    import_source?: string | null;
    import_date?: string | null;
  }[];
}

/** Cart row: allow duplicate products (multiple cylinders with different serials). */
interface CartLine {
  lineKey: string;
  product_id: number;
  name: string;
  unit_price: number;
  quantity: number;
  owner_name: string;
  cylinder_type: string;
  cylinder_serial: string;
  inspection_expiry: string;
  import_source: string;
  import_date: string;
}

const emptyGas = () => ({ ...emptyTemplate, cylinder_type: "", cylinder_serial: "" });

interface OrdersProps {
  creationOnly?: boolean;
}

export default function Orders({ creationOnly = false }: OrdersProps) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(creationOnly);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", note: "" });
  const [deliveryDate, setDeliveryDate] = useState("");
  const [storeContact, setStoreContact] = useState(() =>
    typeof import.meta.env.VITE_DEFAULT_STORE_CONTACT === "string" ? import.meta.env.VITE_DEFAULT_STORE_CONTACT : ""
  );
  const [vatRate, setVatRate] = useState<number>(0);
  const [cylinderTemplate, setCylinderTemplate] = useState<CylinderTemplate>(emptyTemplate);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickProductId, setPickProductId] = useState<string>("");
  const [pickQty, setPickQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const productsPromise = apiGet<Product[]>("/api/products");
      const ordersPromise = creationOnly ? Promise.resolve([] as OrderRow[]) : apiGet<OrderRow[]>("/api/orders?limit=100");
      const templatePromise = apiGet<{
        owner_name: string | null;
        import_source: string | null;
        inspection_expiry: string | null;
        import_date: string | null;
      }>("/api/me/cylinder-template");
      const [o, p, t] = await Promise.all([ordersPromise, productsPromise, templatePromise]);
      setOrders(o);
      setProducts(p ?? []);
      setCylinderTemplate({
        owner_name: t?.owner_name ?? "",
        import_source: t?.import_source ?? "",
        inspection_expiry: t?.inspection_expiry ?? "",
        import_date: t?.import_date ?? "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  };
  useEffect(() => {
    load();
  }, []);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const vatAmount = useMemo(() => Math.round((subtotal * vatRate) / 100), [subtotal, vatRate]);
  const total = subtotal + vatAmount;

  const qtyReservedForProduct = (productId: number, excludeLineKey?: string) =>
    cart.filter((c) => c.product_id === productId && c.lineKey !== excludeLineKey).reduce((s, c) => s + c.quantity, 0);

  const addToCart = () => {
    if (!pickProductId) return;
    const p = products.find((x) => x.id === Number(pickProductId));
    if (!p) return;
    if (pickQty < 1) return;
    const reserved = qtyReservedForProduct(p.id);
    if (editingOrderId === null && reserved + pickQty > p.stock_quantity) {
      toast.error(`Không đủ tồn kho (${p.stock_quantity - reserved} còn lại cho mặt hàng này)`);
      return;
    }
    const g = emptyGas();
    setCart((prev) => [
      ...prev,
      {
        lineKey: crypto.randomUUID(),
        product_id: p.id,
        name: p.name,
        unit_price: Number(p.sell_price),
        quantity: pickQty,
        owner_name: cylinderTemplate.owner_name,
        cylinder_type: cylinderTypeFromProductName(p.name),
        cylinder_serial: g.cylinder_serial,
        inspection_expiry: cylinderTemplate.inspection_expiry,
        import_source: cylinderTemplate.import_source,
        import_date: cylinderTemplate.import_date,
      },
    ]);
    setPickProductId("");
    setPickQty(1);
  };

  const removeLine = (lineKey: string) => setCart((c) => c.filter((i) => i.lineKey !== lineKey));

  const updateLine = (lineKey: string, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((row) => {
        if (row.lineKey !== lineKey) return row;
        const next = { ...row, ...patch };
        if (patch.quantity !== undefined) {
          const p = products.find((x) => x.id === next.product_id);
          if (p && editingOrderId === null) {
            const reserved = qtyReservedForProduct(p.id, lineKey) + next.quantity;
            if (reserved > p.stock_quantity) {
              toast.error(`Tồn kho không đủ (tối đa ${p.stock_quantity - qtyReservedForProduct(p.id, lineKey)})`);
              return row;
            }
          }
          next.quantity = Math.max(1, next.quantity);
        }
        return next;
      })
    );
  };

  const reset = () => {
    setEditingOrderId(null);
    setCustomer({ name: "", phone: "", address: "", note: "" });
    setDeliveryDate("");
    setStoreContact(
      typeof import.meta.env.VITE_DEFAULT_STORE_CONTACT === "string" ? import.meta.env.VITE_DEFAULT_STORE_CONTACT : ""
    );
    setCart([]);
    setVatRate(0);
    setPickProductId("");
    setPickQty(1);
  };

  const saveCylinderTemplate = async () => {
    try {
      await apiPatch("/api/me/cylinder-template", {
        owner_name: cylinderTemplate.owner_name.trim() || null,
        import_source: cylinderTemplate.import_source.trim() || null,
        inspection_expiry: cylinderTemplate.inspection_expiry || null,
        import_date: cylinderTemplate.import_date || null,
      });
      toast.success("Đã lưu mẫu thông tin chai lên server");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được mẫu thông tin chai");
    }
  };

  const openEditOrder = async (orderId: number) => {
    try {
      const o = await apiGet<OrderRow>(`/api/orders/${orderId}`);
      setEditingOrderId(o.id);
      setCustomer({
        name: o.customer_name ?? "",
        phone: o.phone ?? "",
        address: o.address ?? "",
        note: o.note ?? "",
      });
      setDeliveryDate(o.delivery_date ?? "");
      setStoreContact(o.store_contact ?? "");
      setVatRate(o.vat_rate ?? 0);
      setCart(
        (o.order_items ?? []).map((li) => ({
          lineKey: crypto.randomUUID(),
          product_id: li.product_id,
          name: li.product_name,
          unit_price: Number(li.unit_price),
          quantity: li.quantity,
          owner_name: li.owner_name ?? "",
          cylinder_type: li.cylinder_type ?? cylinderTypeFromProductName(li.product_name),
          cylinder_serial: li.cylinder_serial ?? "",
          inspection_expiry: li.inspection_expiry ?? "",
          import_source: li.import_source ?? "",
          import_date: li.import_date ?? "",
        }))
      );
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được đơn hàng");
    }
  };

  const removeOrder = async (orderId: number) => {
    if (!confirm("Xóa đơn hàng này?")) return;
    try {
      await apiDelete(`/api/orders/${orderId}`);
      toast.success("Đã xóa đơn hàng");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
  };

  const submit = async () => {
    if (!customer.name.trim()) {
      toast.error("Vui lòng nhập tên khách hàng");
      return;
    }
    if (cart.length === 0) {
      toast.error("Vui lòng thêm ít nhất 1 sản phẩm");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_name: customer.name.trim(),
        phone: customer.phone.trim() || null,
        address: customer.address.trim() || null,
        note: customer.note.trim() || null,
        delivery_date: deliveryDate || null,
        store_contact: storeContact.trim() || null,
        vat_rate: vatRate,
        lines: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          owner_name: i.owner_name.trim() || null,
          cylinder_type: i.cylinder_type.trim() || null,
          cylinder_serial: i.cylinder_serial.trim() || null,
          inspection_expiry: i.inspection_expiry || null,
          import_source: i.import_source.trim() || null,
          import_date: i.import_date || null,
        })),
      };
      if (editingOrderId === null) {
        await apiPost<OrderRow>("/api/orders", payload);
        toast.success("Đã tạo đơn hàng");
      } else {
        await apiPatch<OrderRow>(`/api/orders/${editingOrderId}`, payload);
        toast.success("Đã cập nhật đơn hàng");
      }
      reset();
      if (creationOnly) {
        setOpen(true);
        load();
      } else {
        setOpen(false);
        load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSaving(false);
  };

  return (
    <AppLayout
      title={creationOnly ? "Tạo đơn hàng" : "Đơn hàng"}
      description={creationOnly ? "Nhân viên chỉ có quyền tạo đơn" : `${orders.length} đơn gần nhất`}
      actions={
        <Button onClick={() => setOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Tạo đơn hàng
        </Button>
      }
    >
      {!creationOnly && (
        <Card className="shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>SP</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead className="min-w-[260px] text-center">Phiếu, xuất &amp; CRUD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Chưa có đơn hàng nào.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{o.customer_name}</div>
                        {o.phone && <div className="text-xs text-muted-foreground">{o.phone}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.order_items?.length ?? 0} mặt hàng</TableCell>
                      <TableCell className="text-right font-semibold">{formatVND(o.total)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          <Button variant="outline" size="sm" className="gap-1" asChild>
                            <Link to={`/don-hang/phieu/${o.id}`} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3.5 w-3.5" /> In
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => void openEditOrder(o.id)}>
                            <Pencil className="h-3.5 w-3.5" /> Sửa
                          </Button>
                          <Button variant="secondary" size="sm" asChild>
                            <a
                              href={apiExportPath(`/api/orders/${o.id}/delivery-slip.html`)}
                              download={invoiceDownloadFilename(o.customer_name, o.phone, "html")}
                            >
                              HTML
                            </a>
                          </Button>
                          <Button variant="secondary" size="sm" asChild>
                            <a
                              href={apiExportPath(`/api/orders/${o.id}/gas-export.csv`)}
                              download={invoiceDownloadFilename(o.customer_name, o.phone, "csv")}
                            >
                              CSV
                            </a>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void removeOrder(o.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrderId === null ? "Tạo đơn hàng mới" : "Cập nhật đơn hàng"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Tên khách hàng *</Label>
                <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Số điện thoại</Label>
                <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Địa chỉ</Label>
              <Input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Ngày giao chai cho khách</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    className="min-w-[160px] flex-1"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeliveryDate(todayLocalIso())}>
                    Hôm nay
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Tên, địa chỉ và ĐT cửa hàng (in trên phiếu)</Label>
                <Textarea
                  rows={2}
                  placeholder="VD: Cửa hàng gas ABC — 123 đường … — 090…"
                  value={storeContact}
                  onChange={(e) => setStoreContact(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">Mẫu thông tin chai</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Điền một lần và bấm Lưu — mỗi lần thêm mặt hàng sẽ tự điền các ô dưới (trừ số sê ri). Loại chai lấy theo tên sản phẩm (vd Gas 12kg → 12kg).
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" className="gap-1 shrink-0" onClick={saveCylinderTemplate}>
                  <Save className="h-3.5 w-3.5" /> Lưu mẫu
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1">
                  <Label className="text-xs">Chủ sở hữu</Label>
                  <Input
                    value={cylinderTemplate.owner_name}
                    onChange={(e) => setCylinderTemplate((t) => ({ ...t, owner_name: e.target.value }))}
                    placeholder="Mặc định cho mỗi dòng"
                  />
                </div>
                <div className="grid gap-1 sm:col-span-2">
                  <Label className="text-xs">Nơi nhập chai chứa cho cửa hàng</Label>
                  <Input
                    value={cylinderTemplate.import_source}
                    onChange={(e) => setCylinderTemplate((t) => ({ ...t, import_source: e.target.value }))}
                    placeholder="VD: kho / nhà cung cấp"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Hạn kiểm định</Label>
                  <Input
                    type="date"
                    value={cylinderTemplate.inspection_expiry}
                    onChange={(e) => setCylinderTemplate((t) => ({ ...t, inspection_expiry: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Ngày nhập</Label>
                  <Input
                    type="date"
                    value={cylinderTemplate.import_date}
                    onChange={(e) => setCylinderTemplate((t) => ({ ...t, import_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs uppercase text-muted-foreground">Thêm sản phẩm từ kho</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                <Select value={pickProductId} onValueChange={setPickProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn sản phẩm..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Chưa có sản phẩm trong kho</div>
                    )}
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)} disabled={p.stock_quantity === 0}>
                        {p.name} — {formatVND(p.sell_price)} {p.stock_quantity === 0 ? "(hết)" : `(còn ${p.stock_quantity})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(Math.max(1, Number(e.target.value)))} />
                <Button type="button" onClick={addToCart}>
                  Thêm
                </Button>
              </div>
            </div>

            {cart.length > 0 && (
              <div className="space-y-4">
                <Label className="text-xs uppercase text-muted-foreground">
                  Giỏ hàng &amp; thông tin chai (theo phiếu giao / sổ gas)
                </Label>
                {cart.map((i) => (
                  <div key={i.lineKey} className="rounded-lg border">
                    <div className="flex flex-wrap items-end gap-2 border-b bg-muted/20 p-3">
                      <div className="min-w-[160px] flex-1">
                        <p className="text-sm font-medium">{i.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatVND(i.unit_price)} / đơn vị
                        </p>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">SL</Label>
                        <Input
                          className="h-9 w-20"
                          type="number"
                          min={1}
                          value={i.quantity}
                          onChange={(e) => updateLine(i.lineKey, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div className="ml-auto font-medium">{formatVND(i.unit_price * i.quantity)}</div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i.lineKey)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="grid gap-1">
                        <Label className="text-xs">Chủ sở hữu</Label>
                        <Input
                          value={i.owner_name}
                          onChange={(e) => updateLine(i.lineKey, { owner_name: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Loại chai (theo sản phẩm)</Label>
                        <Input
                          value={i.cylinder_type}
                          onChange={(e) => updateLine(i.lineKey, { cylinder_type: e.target.value })}
                          placeholder="Tự điền từ tên SP"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Số sê ri chai</Label>
                        <Input
                          className="font-mono text-sm"
                          value={i.cylinder_serial}
                          onChange={(e) => updateLine(i.lineKey, { cylinder_serial: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Hạn kiểm định</Label>
                        <Input
                          type="date"
                          value={i.inspection_expiry}
                          onChange={(e) => updateLine(i.lineKey, { inspection_expiry: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1 sm:col-span-2">
                        <Label className="text-xs">Nơi nhập chai chứa cho cửa hàng</Label>
                        <Input
                          value={i.import_source}
                          onChange={(e) => updateLine(i.lineKey, { import_source: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Ngày nhập</Label>
                        <Input
                          type="date"
                          value={i.import_date}
                          onChange={(e) => updateLine(i.lineKey, { import_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Ghi chú</Label>
                <Textarea rows={2} value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Thuế GTGT (%)</Label>
                <Input type="number" min={0} value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} />
              </div>
            </div>

            <div className="rounded-lg bg-accent/50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span>{formatVND(subtotal)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">VAT ({vatRate}%)</span>
                <span>{formatVND(vatAmount)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Tổng cộng</span>
                <span className="text-primary">{formatVND(total)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Đang lưu..." : editingOrderId === null ? "Tạo đơn" : "Cập nhật"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
