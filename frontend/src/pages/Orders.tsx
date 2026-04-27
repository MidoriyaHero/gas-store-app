import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { DeliveryNotesPanel } from "@/components/DeliveryNotesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, ShoppingBag, FileText, Pencil, ChevronDown, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

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

interface ApiCylinderTemplate {
  id: number;
  name: string;
  owner_name: string | null;
  import_source: string | null;
  inspection_expiry: string | null;
  import_date: string | null;
  is_active: boolean;
}

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
  payment_mode?: "cash" | "debt" | "partial";
  paid_amount?: number | string;
  outstanding_amount?: number | string;
  total: string | number;
  created_at: string;
  /** True when every line + địa chỉ/SĐT/ngày giao đủ để đưa vào sổ gas. */
  gas_ledger_ready?: boolean;
  /** Các mục còn thiếu so với sổ gas (tiếng Việt), rỗng khi đủ. */
  gas_ledger_gaps?: string[];
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

interface OrdersListPayload {
  items: OrderRow[];
  total: number;
}

/**
 * Tính thiếu sót sổ gas trên client (khớp logic backend) khi API chưa trả ``gas_ledger_gaps``.
 */
function computeClientGasLedgerGaps(o: OrderRow): string[] {
  const out: string[] = [];
  const items = o.order_items ?? [];
  if (items.length === 0) {
    out.push("Đơn: chưa có dòng hàng.");
    return out;
  }
  if (!o.phone?.trim()) out.push("Đơn: thiếu số điện thoại khách.");
  if (!o.address?.trim()) out.push("Đơn: thiếu địa chỉ khách.");
  if (!o.delivery_date?.trim()) out.push("Đơn: thiếu ngày giao hàng.");
  items.forEach((li, i) => {
    const idx = i + 1;
    const label = (li.product_name || "").trim() || `dòng ${idx}`;
    const miss: string[] = [];
    if (!li.owner_name?.trim()) miss.push("chủ sở hữu");
    if (!li.cylinder_type?.trim()) miss.push("loại chai");
    if (!li.cylinder_serial?.trim()) miss.push("số sê ri");
    if (!li.inspection_expiry?.trim()) miss.push("hạn kiểm định");
    if (!li.import_source?.trim()) miss.push("nơi nhập");
    if (!li.import_date?.trim()) miss.push("ngày nhập");
    if (miss.length > 0) out.push(`Mặt hàng ${idx} (${label}): thiếu ${miss.join(", ")}.`);
  });
  return out;
}

/** Danh sách hiển thị: ưu tiên API, không thì suy ra từ dữ liệu đơn. */
function gasLedgerGapsForDisplay(o: OrderRow, gasReady: boolean): string[] {
  if (gasReady) return [];
  const fromApi = o.gas_ledger_gaps;
  if (fromApi && fromApi.length > 0) return fromApi;
  return computeClientGasLedgerGaps(o);
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

const NONE_TEMPLATE = "__none__";

/** Chuỗi in phiếu / lưu ``store_contact`` — có thể override bằng ``VITE_DEFAULT_STORE_CONTACT``. */
const DEFAULT_STORE_CONTACT_LINE =
  typeof import.meta.env.VITE_DEFAULT_STORE_CONTACT === "string" && import.meta.env.VITE_DEFAULT_STORE_CONTACT.trim()
    ? import.meta.env.VITE_DEFAULT_STORE_CONTACT.trim()
    : "GAS Huy Hoàng - Thuận Tân, Truông Mít - 0984135227 | 0908868643";

interface OrdersProps {
  creationOnly?: boolean;
}

export default function Orders({ creationOnly = false }: OrdersProps) {
  /** Admin-only: switch between order list and inline delivery notes on the same route. */
  const [adminSection, setAdminSection] = useState<"orders" | "notes">("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", note: "" });
  const [deliveryDate, setDeliveryDate] = useState(() => (creationOnly ? todayLocalIso() : ""));
  const [vatRate, setVatRate] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<"cash" | "debt" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [cylinderTemplates, setCylinderTemplates] = useState<ApiCylinderTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(NONE_TEMPLATE);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickProductId, setPickProductId] = useState<string>("");
  const [pickQty, setPickQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [moreCustomerOpen, setMoreCustomerOpen] = useState(false);
  const [moreVatOpen, setMoreVatOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<{ id: number; order_code: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const productsPromise = apiGet<Product[]>("/api/products");
      const templatesPromise = apiGet<ApiCylinderTemplate[]>("/api/cylinder-templates");
      if (creationOnly) {
        const [p, tpl] = await Promise.all([productsPromise, templatesPromise]);
        setOrders([]);
        setOrdersTotal(0);
        setProducts(p ?? []);
        setCylinderTemplates(tpl ?? []);
        return;
      }
      const offset = (page - 1) * pageSize;
      const ordersPromise = apiGet<OrdersListPayload>(`/api/orders?limit=${pageSize}&offset=${offset}`);
      const [ordersRes, p, tpl] = await Promise.all([ordersPromise, productsPromise, templatesPromise]);
      const total = ordersRes.total ?? 0;
      const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
      if (page > maxPage && total > 0) {
        setPage(maxPage);
        return;
      }
      setOrders(ordersRes.items ?? []);
      setOrdersTotal(total);
      setProducts(p ?? []);
      setCylinderTemplates(tpl ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, [creationOnly, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!creationOnly && adminSection === "notes") {
      setOpen(false);
    }
  }, [adminSection, creationOnly]);

  const selectedPreset = useMemo(() => {
    if (!selectedTemplateId || selectedTemplateId === NONE_TEMPLATE) return null;
    return cylinderTemplates.find((t) => String(t.id) === selectedTemplateId) ?? null;
  }, [cylinderTemplates, selectedTemplateId]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const vatAmount = useMemo(() => Math.round((subtotal * vatRate) / 100), [subtotal, vatRate]);
  const total = subtotal + vatAmount;
  const outstandingPreview = Math.max(
    0,
    total - (paymentMode === "cash" ? total : paymentMode === "debt" ? 0 : paidAmount)
  );

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
    const owner = selectedPreset?.owner_name?.trim() ?? "";
    const src = selectedPreset?.import_source?.trim() ?? "";
    const insp = selectedPreset?.inspection_expiry ?? "";
    const impD = selectedPreset?.import_date ?? "";
    setCart((prev) => [
      ...prev,
      {
        lineKey: crypto.randomUUID(),
        product_id: p.id,
        name: p.name,
        unit_price: Number(p.sell_price),
        quantity: pickQty,
        owner_name: owner,
        cylinder_type: cylinderTypeFromProductName(p.name),
        cylinder_serial: "",
        inspection_expiry: insp,
        import_source: src,
        import_date: impD,
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
    setDeliveryDate(creationOnly ? todayLocalIso() : "");
    setCart([]);
    setVatRate(0);
    setPaymentMode("cash");
    setPaidAmount(0);
    setPickProductId("");
    setPickQty(1);
    setSelectedTemplateId(NONE_TEMPLATE);
    setMoreCustomerOpen(false);
    setMoreVatOpen(false);
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
      setVatRate(o.vat_rate ?? 0);
      setPaymentMode(o.payment_mode ?? "cash");
      setPaidAmount(Number(o.paid_amount ?? 0));
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

  const performDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      await apiDelete(`/api/orders/${orderToDelete.id}`);
      toast.success("Đã xóa đơn hàng");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      throw e;
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
    if (!customer.phone.trim()) {
      toast.error("Vui lòng nhập số điện thoại khách");
      return;
    }
    setSaving(true);
    try {
      const paidForPayload = paymentMode === "cash" ? total : paymentMode === "debt" ? 0 : Math.max(0, paidAmount);
      const payload = {
        customer_name: customer.name.trim(),
        phone: customer.phone.trim(),
        address: customer.address.trim() || null,
        note: customer.note.trim() || null,
        delivery_date: deliveryDate || null,
        store_contact: DEFAULT_STORE_CONTACT_LINE,
        vat_rate: vatRate,
        payment_mode: paymentMode,
        paid_amount: paidForPayload,
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
        if (!creationOnly) setPage(1);
      } else {
        await apiPatch<OrderRow>(`/api/orders/${editingOrderId}`, payload);
        toast.success("Đã cập nhật đơn hàng");
      }
      reset();
      if (creationOnly) {
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
      title={
        creationOnly ? "Tạo đơn hàng" : adminSection === "notes" ? "Ghi chú giao hàng" : "Đơn hàng"
      }
      description={
        creationOnly
          ? "Nhân viên chỉ có quyền tạo đơn"
          : adminSection === "notes"
            ? "Ghi chữ hoặc ghi âm — cùng trang với đơn hàng."
            : `${ordersTotal.toLocaleString("vi-VN")} đơn`
      }
      actions={
        creationOnly ? (
          <Button variant="outline" onClick={reset}>
            Làm mới form
          </Button>
        ) : adminSection === "orders" ? (
          <Button onClick={() => setOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Tạo đơn hàng
          </Button>
        ) : null
      }
    >
      <DestructiveConfirmDialog
        open={orderToDelete !== null}
        onOpenChange={(v) => {
          if (!v) setOrderToDelete(null);
        }}
        title="Xóa đơn hàng?"
        description={
          orderToDelete
            ? `Đơn ${orderToDelete.order_code} sẽ bị xóa và tồn kho được hoàn lại. Thao tác này không hoàn tác.`
            : ""
        }
        onConfirm={performDeleteOrder}
      />

      {!creationOnly && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={adminSection === "orders" ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setAdminSection("orders")}
          >
            Danh sách đơn
          </Button>
          <Button
            type="button"
            variant={adminSection === "notes" ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setAdminSection("notes")}
          >
            Ghi chú giao hàng
          </Button>
        </div>
      )}

      {!creationOnly && adminSection === "notes" && (
        <div className="mb-6">
          <DeliveryNotesPanel compact />
        </div>
      )}

      {!creationOnly && adminSection === "orders" && (
        <Card className="shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[11rem] whitespace-normal">Mã đơn / sổ gas</TableHead>
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
                  orders.map((o) => {
                    const gasReady = o.gas_ledger_ready === true;
                    const gasGaps = gasLedgerGapsForDisplay(o, gasReady);
                    const gapsId = `order-${o.id}-gas-gaps`;
                    return (
                    <Fragment key={o.id}>
                    <TableRow
                      className={
                        gasReady
                          ? "border-l-4 border-l-emerald-600 bg-emerald-50/90 dark:border-l-emerald-500 dark:bg-emerald-950/30"
                          : "border-l-4 border-l-amber-600 bg-amber-50/90 dark:border-l-amber-500 dark:bg-amber-950/35"
                      }
                      aria-label={
                        gasReady
                          ? `Đơn ${o.order_code}: đủ hồ sơ sổ gas`
                          : `Đơn ${o.order_code}: thiếu thông tin sổ gas — xem hàng chi tiết ngay bên dưới`
                      }
                      aria-describedby={!gasReady ? gapsId : undefined}
                    >
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
                          <span className="font-mono text-xs leading-normal">{o.order_code}</span>
                          {gasReady ? (
                            <Badge
                              variant="outline"
                              className="w-fit shrink-0 gap-1 border-emerald-700 text-emerald-950 dark:border-emerald-400 dark:text-emerald-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Đủ sổ gas
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="w-fit shrink-0 gap-1 border-amber-800 text-amber-950 dark:border-amber-400 dark:text-amber-50"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Thiếu sổ gas
                            </Badge>
                          )}
                        </div>
                      </TableCell>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOrderToDelete({ id: o.id, order_code: o.order_code })}
                            aria-label={`Xóa đơn ${o.order_code}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {!gasReady && (
                      <TableRow
                        className="border-l-4 border-l-amber-600 bg-amber-50/90 dark:border-l-amber-500 dark:bg-amber-950/35"
                        aria-label={`Chi tiết thiếu sót sổ gas cho đơn ${o.order_code}`}
                      >
                        <TableCell colSpan={6} className="py-3">
                          <div
                            id={gapsId}
                            className="rounded-md border border-amber-800/40 bg-card px-3 py-2 shadow-sm dark:border-amber-400/40"
                          >
                            <p className="mb-1.5 text-sm font-semibold text-foreground">Cần bổ sung cho sổ gas</p>
                            {gasGaps.length > 0 ? (
                              <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-foreground">
                                {gasGaps.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">Mở Sửa để kiểm tra các trường sổ gas.</p>
                            )}
                            <p className="mt-2 text-xs text-muted-foreground">Bấm Sửa trên đơn này để điền đủ rồi lưu — dòng sẽ tự đủ điều kiện xuất sổ gas.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {ordersTotal === 0
                ? "Không có đơn."
                : `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, ordersTotal)} / ${ordersTotal.toLocaleString("vi-VN")} đơn`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="orders-page-size" className="text-sm whitespace-nowrap">
                Số đơn / trang
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger id="orders-page-size" className="h-11 w-[100px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-[88px]"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-[88px]"
                  disabled={page * pageSize >= ordersTotal}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {creationOnly && (
        <Card className="shadow-card p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Tạo đơn hàng mới</h2>
            <p className="text-sm text-muted-foreground">Điền form trực tiếp và bấm tạo đơn, không cần mở popup.</p>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-3 text-sm font-medium text-foreground">Thông tin khách &amp; ngày giao</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Tên khách hàng *</Label>
                  <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số điện thoại *</Label>
                  <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
                  <Label>Ngày giao chai cho khách</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      className="min-h-11 min-w-[160px] flex-1"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                    <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setDeliveryDate(todayLocalIso())}>
                      Hôm nay
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Collapsible open={moreCustomerOpen} onOpenChange={setMoreCustomerOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="flex h-11 w-full justify-between gap-2">
                  <span>Địa chỉ &amp; ghi chú</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition ${moreCustomerOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-3 pt-2">
                <div className="grid gap-1.5">
                  <Label>Địa chỉ</Label>
                  <Input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Ghi chú</Label>
                  <Textarea rows={2} value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <Label className="text-sm font-medium">Mẫu thông tin chai</Label>
              <p className="text-xs text-muted-foreground">
                Chọn mẫu do admin cấu hình — mỗi lần &quot;Thêm&quot; sẽ điền sẵn (trừ số seri). Loại chai theo tên sản phẩm.
              </p>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="min-h-11 w-full bg-background">
                  <SelectValue placeholder="Không dùng mẫu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_TEMPLATE}>Không dùng mẫu</SelectItem>
                  {cylinderTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cylinderTemplates.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">Chưa có mẫu hoạt động — liên hệ admin tạo mẫu trong &quot;Mẫu thông tin chai&quot;.</p>
              )}
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

            <Collapsible open={moreVatOpen} onOpenChange={setMoreVatOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="flex h-11 w-full justify-between gap-2">
                  <span>Thuế GTGT (%)</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition ${moreVatOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="grid gap-1.5">
                  <Label>Thuế GTGT (%)</Label>
                  <Input
                    className="min-h-11"
                    type="number"
                    min={0}
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Hình thức thanh toán</Label>
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as "cash" | "debt" | "partial")}>
                  <SelectTrigger className="min-h-11 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Thanh toán đủ</SelectItem>
                    <SelectItem value="partial">Thanh toán một phần</SelectItem>
                    <SelectItem value="debt">Ghi nợ toàn bộ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Đã thu trước (₫)</Label>
                <Input
                  type="number"
                  min={0}
                  disabled={paymentMode !== "partial"}
                  value={paymentMode === "partial" ? paidAmount : paymentMode === "cash" ? total : 0}
                  onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Công nợ dự kiến (₫)</Label>
                <Input readOnly value={String(outstandingPreview)} />
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

            <div className="flex justify-end">
              <Button onClick={submit} disabled={saving} className="min-w-28">
                {saving ? "Đang lưu..." : "Tạo đơn"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!creationOnly && adminSection === "orders" && (
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
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-3 text-sm font-medium text-foreground">Thông tin khách &amp; ngày giao</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Tên khách hàng *</Label>
                  <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Số điện thoại *</Label>
                  <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
                  <Label>Ngày giao chai cho khách</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      className="min-h-11 min-w-[160px] flex-1"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                    <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setDeliveryDate(todayLocalIso())}>
                      Hôm nay
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Địa chỉ</Label>
              <Input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            </div>

            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Hình thức thanh toán</Label>
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as "cash" | "debt" | "partial")}>
                  <SelectTrigger className="min-h-11 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Thanh toán đủ</SelectItem>
                    <SelectItem value="partial">Thanh toán một phần</SelectItem>
                    <SelectItem value="debt">Ghi nợ toàn bộ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Đã thu trước (₫)</Label>
                <Input
                  type="number"
                  min={0}
                  disabled={paymentMode !== "partial"}
                  value={paymentMode === "partial" ? paidAmount : paymentMode === "cash" ? total : 0}
                  onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Công nợ dự kiến (₫)</Label>
                <Input readOnly value={String(outstandingPreview)} />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <Label className="text-sm font-medium">Mẫu thông tin chai</Label>
              <p className="text-xs text-muted-foreground">
                Chọn mẫu do admin cấu hình — mỗi lần &quot;Thêm&quot; sẽ điền sẵn (trừ số seri). Loại chai theo tên sản phẩm.
              </p>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="min-h-11 w-full bg-background">
                  <SelectValue placeholder="Không dùng mẫu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_TEMPLATE}>Không dùng mẫu</SelectItem>
                  {cylinderTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cylinderTemplates.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">Chưa có mẫu hoạt động — liên hệ admin tạo mẫu trong &quot;Mẫu thông tin chai&quot;.</p>
              )}
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
      )}
    </AppLayout>
  );
}
