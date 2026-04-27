import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { ShoppingBag } from "lucide-react";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";

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
  total: string | number;
  created_at: string;
  order_items: OrderLine[];
}

/** Staff-only read-only list of orders created by the signed-in user. */
export default function StaffOrderHistory() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<OrderRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<OrderRow[]>("/api/me/orders?limit=100");
      setOrders(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được lịch sử đơn");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppLayout
      title="Lịch sử đơn hàng"
      description={loading ? "Đang tải…" : `${orders.length} đơn do bạn tạo`}
      actions={
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          Tải lại
        </Button>
      }
    >
      <Card className="shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Khách</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="w-[120px] text-center">Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Chưa có đơn nào do bạn tạo (hoặc đơn cũ trước khi hệ thống ghi nhận người tạo).</p>
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
                    <TableCell className="text-right font-semibold">{formatVND(o.total)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                    <TableCell className="text-center">
                      <Button type="button" variant="outline" size="sm" className="min-h-11 px-3" onClick={() => setDetail(o)}>
                        Xem
                      </Button>
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
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
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
    </AppLayout>
  );
}
