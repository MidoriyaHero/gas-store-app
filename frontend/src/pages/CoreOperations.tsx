import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ClipboardCheck, PackageSearch, Route, Wallet } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AsyncStatePanel } from "@/components/AsyncStatePanel";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime, formatVND } from "@/lib/format";
import { apiGet } from "@/lib/api";
import type { AsyncViewState } from "@/lib/ui-foundation";
import { CORE_FEATURE_SCOPE } from "@/lib/feature-governance";

interface DashboardOrder {
  id: number;
  order_code: string;
  customer_name: string;
  total: string | number;
  created_at: string;
  gas_ledger_ready?: boolean;
}

interface DashboardProduct {
  id: number;
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
}

interface DashboardResponse {
  orders: DashboardOrder[];
  products: DashboardProduct[];
}

/**
 * Core operations cockpit for dispatch, settlement and daily readiness.
 */
export default function CoreOperations() {
  const [state, setState] = useState<AsyncViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [expectedCash, setExpectedCash] = useState<number>(0);
  const [actualCash, setActualCash] = useState<number>(0);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const payload = await apiGet<DashboardResponse>("/api/dashboard");
      const rawOrders = payload.orders ?? [];
      const rawProducts = payload.products ?? [];
      setOrders(rawOrders);
      setProducts(rawProducts);
      if (rawOrders.length === 0) {
        setState("empty");
      } else {
        setState("success");
      }
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu điều hành");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o) => new Date(o.created_at).toDateString() === today);
  }, [orders]);

  const readyOrders = useMemo(() => todayOrders.filter((o) => o.gas_ledger_ready === true), [todayOrders]);
  const lowStockCount = useMemo(
    () => products.filter((p) => p.stock_quantity <= p.low_stock_threshold).length,
    [products]
  );
  const expectedSettlement = useMemo(
    () => Math.round(todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)),
    [todayOrders]
  );
  const cashDelta = actualCash - expectedCash;

  return (
    <AppLayout
      title="Điều hành cốt lõi"
      description="Theo dõi phân ca giao hàng, đối soát tiền và trạng thái sẵn sàng sổ gas trong ngày"
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Làm mới
        </Button>
      }
    >
      <AsyncStatePanel
        state={state}
        title={state === "error" ? "Không tải được màn điều hành cốt lõi" : undefined}
        description={state === "error" ? error ?? undefined : undefined}
        onRetry={() => void load()}
      />

      {state === "success" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Route className="h-4 w-4" /> Đơn hôm nay
              </div>
              <p className="text-2xl font-semibold">{todayOrders.length}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardCheck className="h-4 w-4" /> Đủ sổ gas
              </div>
              <p className="text-2xl font-semibold">{readyOrders.length}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <PackageSearch className="h-4 w-4" /> SKU cần chú ý
              </div>
              <p className="text-2xl font-semibold">{lowStockCount}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-4 w-4" /> Giá trị ca dự kiến
              </div>
              <p className="text-xl font-semibold">{formatVND(expectedSettlement)}</p>
            </Card>
          </div>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Đối soát thu tiền theo ca</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="expected-cash">Phải thu (VNĐ)</Label>
                <Input
                  id="expected-cash"
                  type="number"
                  value={expectedCash}
                  onChange={(e) => setExpectedCash(Number(e.target.value) || 0)}
                  className="min-h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="actual-cash">Đã thu (VNĐ)</Label>
                <Input
                  id="actual-cash"
                  type="number"
                  value={actualCash}
                  onChange={(e) => setActualCash(Number(e.target.value) || 0)}
                  className="min-h-11"
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Chênh lệch</p>
                <p className="mt-1 text-lg font-semibold">{formatVND(cashDelta)}</p>
                <div className="mt-2">
                  {cashDelta === 0 ? (
                    <StatusBadge status="paid" label="Đã đối soát khớp" />
                  ) : cashDelta > 0 ? (
                    <StatusBadge status="ready" label="Thu vượt so với phải thu" />
                  ) : (
                    <StatusBadge status="missing" label="Còn thiếu tiền ca giao" />
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Top đơn gần nhất cần xử lý</h2>
              <Button asChild variant="outline" size="sm">
                <Link to="/don-hang">Mở danh sách đơn</Link>
              </Button>
            </div>
            <ul className="space-y-2">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{o.order_code}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.customer_name} • {formatDateTime(o.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.gas_ledger_ready ? "ready" : "missing"} label={o.gas_ledger_ready ? "Đủ sổ gas" : "Thiếu sổ gas"} />
                    <p className="text-sm font-semibold">{formatVND(o.total)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Phạm vi ưu tiên nhóm vận hành</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Must have</p>
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {CORE_FEATURE_SCOPE.mustHave.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Should have</p>
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {CORE_FEATURE_SCOPE.shouldHave.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
