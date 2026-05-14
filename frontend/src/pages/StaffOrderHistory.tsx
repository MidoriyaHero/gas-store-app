import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, CheckCircle2 } from "lucide-react";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";

interface OrderLine {
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
  payment_mode?: "cash" | "partial" | "debt";
  outstanding_amount?: number | string;
  total: string | number;
  created_at: string;
  delivery_status?: "in_transit" | "completed";
  borrowed_shell_units?: number;
  order_items: OrderLine[];
}

type StaffDeliveryTab = "in_transit" | "completed";

/** Staff read-only lists: đang giao vs đã giao (lịch sử), cập nhật hoàn thành qua API. */
export default function StaffOrderHistory() {
  const [tab, setTab] = useState<StaffDeliveryTab>("in_transit");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cash" | "partial" | "debt">("all");
  const [completeLoadingId, setCompleteLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<OrderRow[]>(`/api/me/orders?limit=100&delivery_status=${tab}`);
      setOrders(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được đơn");
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const markCompleted = async (o: OrderRow) => {
    setCompleteLoadingId(o.id);
    try {
      await apiPatch<OrderRow>(`/api/me/orders/${o.id}`, { delivery_status: "completed" });
      toast.success(`Đã hoàn thành giao — ${o.order_code}`);
      setDetail((d) => (d?.id === o.id ? { ...d, delivery_status: "completed" } : d));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được");
    } finally {
      setCompleteLoadingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const q = search.trim().toLowerCase();
    const hit = !q || o.order_code.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q) || (o.phone ?? "").includes(q);
    const paymentHit = paymentFilter === "all" ? true : (o.payment_mode ?? "cash") === paymentFilter;
    return hit && paymentHit;
  });

  const tabDescription =
    tab === "in_transit"
      ? "Đơn đang giao — bấm Hoàn thành khi đã giao xong."
      : "Đơn đã giao xong (lịch sử).";

  return (
    <AppLayout
      title="Đơn giao hàng"
      description={loading ? "Đang tải…" : `${filteredOrders.length}/${orders.length} đơn — ${tabDescription}`}
      actions={
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          Tải lại
        </Button>
      }
    >
      <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as StaffDeliveryTab)} className="mb-4 w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="in_transit" className="min-h-11">
            Đang giao
          </TabsTrigger>
          <TabsTrigger value="completed" className="min-h-11">
            Lịch sử giao
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mb-4 p-3 shadow-card">
        <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Tìm theo mã đơn / khách / SĐT</Label>
                <Input className="min-h-11" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ví dụ: DH- hoặc 0909..." />
              </div>
              <div className="grid gap-1.5">
                <Label>Lọc theo thanh toán</Label>
                <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as "all" | "cash" | "partial" | "debt")}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="cash">Đã thu đủ</SelectItem>
                    <SelectItem value="partial">Thu một phần</SelectItem>
                    <SelectItem value="debt">Ghi nợ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
      </Card>

      <Card className="shadow-card">
        <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã đơn</TableHead>
                    <TableHead>Khách</TableHead>
                    <TableHead>Thanh toán</TableHead>
                    <TableHead className="text-right">Tổng</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead className="w-[200px] text-center">Tác vụ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center">
                        <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {tab === "in_transit" ? "Không có đơn đang giao." : "Chưa có đơn nào trong lịch sử giao."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetail(o)}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            {o.order_code}
                            {o.delivery_status === "in_transit" ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Đang giao
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                Đã giao
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{o.customer_name}</div>
                          {o.phone && <div className="text-xs text-muted-foreground">{o.phone}</div>}
                        </TableCell>
                        <TableCell>
                          {(o.payment_mode ?? "cash") === "cash"
                            ? "Đã thu đủ"
                            : (o.payment_mode ?? "cash") === "partial"
                              ? `Thu một phần (nợ ${formatVND(o.outstanding_amount ?? 0)})`
                              : `Ghi nợ (${formatVND(o.outstanding_amount ?? o.total)})`}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatVND(o.total)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-wrap justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button type="button" variant="outline" size="sm" className="min-h-11 px-3" onClick={() => setDetail(o)}>
                              Xem
                            </Button>
                            {tab === "in_transit" && (
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="min-h-11 gap-1 px-3"
                                disabled={completeLoadingId === o.id}
                                onClick={() => void markCompleted(o)}
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden />
                                {completeLoadingId === o.id ? "…" : "Hoàn thành"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
        </div>
      </Card>

      <Sheet open={detail !== null} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md" side="right">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{detail.order_code}</SheetTitle>
                <p className="text-left text-sm text-muted-foreground">{formatDateTime(detail.created_at)}</p>
                <div className="pt-1">
                  {detail.delivery_status === "completed" ? (
                    <Badge variant="outline">Đã giao xong</Badge>
                  ) : (
                    <Badge variant="secondary">Đang giao</Badge>
                  )}
                </div>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                {detail.delivery_status === "in_transit" && (
                  <Button type="button" className="w-full min-h-11 gap-2" disabled={completeLoadingId === detail.id} onClick={() => void markCompleted(detail)}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {completeLoadingId === detail.id ? "Đang lưu…" : "Đánh dấu đã giao xong"}
                  </Button>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Khách hàng</Label>
                  <p className="font-medium">{detail.customer_name}</p>
                  {detail.phone && <p className="text-muted-foreground">{detail.phone}</p>}
                  {detail.address && <p className="mt-1 text-muted-foreground">{detail.address}</p>}
                  {detail.note && <p className="mt-2 text-muted-foreground">Ghi chú: {detail.note}</p>}
                </div>
                {detail.delivery_date && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Ngày giao</Label>
                    <p>{detail.delivery_date}</p>
                  </div>
                )}
                {Number(detail.borrowed_shell_units ?? 0) > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Vỏ cho mượn / nợ vỏ</Label>
                    <p className="font-mono">{detail.borrowed_shell_units}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Dòng hàng</Label>
                  <ul className="mt-2 space-y-3 border-t pt-2">
                    {(detail.order_items ?? []).map((li, idx) => (
                      <li key={idx} className="rounded-md border p-2">
                        <p className="font-medium">
                          {li.product_name} × {li.quantity}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatVND(li.subtotal)}</p>
                        <dl className="mt-2 grid gap-1 text-xs">
                          {li.owner_name && (
                            <div>
                              <dt className="text-muted-foreground">Chủ SH</dt>
                              <dd>{li.owner_name}</dd>
                            </div>
                          )}
                          {li.cylinder_type && (
                            <div>
                              <dt className="text-muted-foreground">Loại chai</dt>
                              <dd>{li.cylinder_type}</dd>
                            </div>
                          )}
                          {li.cylinder_serial && (
                            <div>
                              <dt className="text-muted-foreground">Số seri</dt>
                              <dd className="font-mono">{li.cylinder_serial}</dd>
                            </div>
                          )}
                          {li.inspection_expiry && (
                            <div>
                              <dt className="text-muted-foreground">Hạn KĐ</dt>
                              <dd>{li.inspection_expiry}</dd>
                            </div>
                          )}
                          {li.import_source && (
                            <div>
                              <dt className="text-muted-foreground">Nơi nhập</dt>
                              <dd>{li.import_source}</dd>
                            </div>
                          )}
                          {li.import_date && (
                            <div>
                              <dt className="text-muted-foreground">Ngày nhập</dt>
                              <dd>{li.import_date}</dd>
                            </div>
                          )}
                        </dl>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Tổng</span>
                  <span>{formatVND(detail.total)}</span>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      </>
    </AppLayout>
  );
}
