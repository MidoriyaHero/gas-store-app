import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Pencil, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatVND, formatDateTime } from "@/lib/format";
import {
  CUSTOMER_SEGMENT_LABEL,
  isCustomerSegment,
  type CustomerSegment,
} from "@/lib/customer-segment";

export interface OrderQueueRow {
  id: number;
  order_code: string;
  customer_id?: number | null;
  customer_name: string;
  phone: string | null;
  customer_segment?: CustomerSegment | null;
  address?: string | null;
  note?: string | null;
  delivery_date?: string | null;
  total: string | number;
  created_at: string;
  gas_ledger_ready?: boolean;
  assigned_to_user_id?: number | null;
  assigned_to_username?: string | null;
  delivery_status?: "in_transit" | "completed";
  payment_mode?: "cash" | "debt" | "partial";
  paid_amount?: number | string;
  outstanding_amount?: number | string;
  order_items?: Array<{ product_name: string; quantity: number }>;
}

function paymentLabel(mode: OrderQueueRow["payment_mode"]): string {
  if (mode === "debt") return "Ghi nợ";
  if (mode === "partial") return "Thu một phần";
  return "Tiền mặt";
}

function deliveryLabel(o: OrderQueueRow): string {
  if (o.delivery_status === "completed") return "Xong";
  if (o.assigned_to_username) return `Đang giao · ${o.assigned_to_username}`;
  if (o.assigned_to_user_id) return "Đang giao";
  return "Chưa gán NV";
}

function goodsLine(o: OrderQueueRow): string {
  const items = o.order_items ?? [];
  if (items.length === 0) return "Chưa có chai";
  return items.map((i) => `${i.product_name} × ${i.quantity}`).join(", ");
}

/** Compact flag on the queue row — not a column. */
function rowFlag(o: OrderQueueRow): { text: string; warn: boolean } {
  if (o.gas_ledger_ready !== true) return { text: "Thiếu", warn: true };
  if (o.delivery_status === "completed") return { text: "Xong", warn: false };
  if (o.payment_mode === "debt") return { text: "Nợ", warn: false };
  return { text: "Đủ", warn: false };
}

interface InspectorProps {
  order: OrderQueueRow;
  gaps: string[];
  onEdit: () => void;
  onDelete: () => void;
}

function OrderInspector({ order, gaps, onEdit, onDelete }: InspectorProps) {
  const gasReady = order.gas_ledger_ready === true;
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-sm text-muted-foreground">{order.order_code}</p>
        <h3 className="text-lg font-semibold leading-tight">{order.customer_name}</h3>
        <p className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</p>
      </div>
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">SĐT</dt>
        <dd className="font-medium">{order.phone?.trim() || "—"}</dd>
        <dt className="text-muted-foreground">Giao</dt>
        <dd>
          {order.delivery_date || "Chưa ngày"} · {deliveryLabel(order)}
        </dd>
        <dt className="text-muted-foreground">Sổ gas</dt>
        <dd className={gasReady ? "text-[#2c8a58] font-medium" : "text-[#e3940f] font-medium"}>
          {gasReady ? "Đủ sổ gas" : "Thiếu sổ gas"}
        </dd>
        <dt className="text-muted-foreground">Thu</dt>
        <dd>
          {paymentLabel(order.payment_mode)} · {formatVND(order.total)}
        </dd>
        {order.address?.trim() ? (
          <>
            <dt className="text-muted-foreground">Địa chỉ</dt>
            <dd>{order.address}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Chai</dt>
        <dd>{goodsLine(order)}</dd>
        {order.note?.trim() ? (
          <>
            <dt className="text-muted-foreground">Ghi chú</dt>
            <dd>{order.note}</dd>
          </>
        ) : null}
      </dl>
      {order.customer_id != null ? (
        <Link
          to={`/khach-hang?id=${order.customer_id}`}
          className="inline-block text-sm text-primary underline-offset-2 hover:underline"
        >
          {isCustomerSegment(order.customer_segment)
            ? CUSTOMER_SEGMENT_LABEL[order.customer_segment]
            : "Hồ sơ khách"}
        </Link>
      ) : null}
      {!gasReady && gaps.length > 0 ? (
        <ul className="list-inside list-disc space-y-1 rounded-md border border-amber-800/40 bg-amber-50/80 px-3 py-2 text-sm dark:border-amber-400/40 dark:bg-amber-950/30">
          {gaps.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 gap-1" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Sửa
        </Button>
        <Button variant="outline" className="min-h-11 gap-1" asChild>
          <Link to={`/don-hang/phieu/${order.id}`} target="_blank" rel="noopener noreferrer">
            <FileText className="h-3.5 w-3.5" /> In phiếu
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-1"
          aria-label={`Xóa đơn ${order.order_code}`}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" /> Xóa
        </Button>
      </div>
    </div>
  );
}

function QueueItem({
  order,
  selected,
  onSelect,
}: {
  order: OrderQueueRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const flag = rowFlag(order);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border-b px-3 py-2.5 text-left last:border-b-0 ${selected ? "bg-muted" : "hover:bg-muted/50"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{order.order_code}</span>
        <span className={`text-[11px] font-bold ${flag.warn ? "text-[#e3940f]" : "text-[#2c8a58]"}`}>
          {flag.warn ? <AlertTriangle className="mr-0.5 inline h-3 w-3" aria-hidden /> : <CheckCircle className="mr-0.5 inline h-3 w-3" aria-hidden />}
          {flag.text}
        </span>
      </div>
      <p className="truncate text-sm font-medium">{order.customer_name}</p>
      <p className="text-xs text-muted-foreground">
        {formatVND(order.total)} · {deliveryLabel(order)}
      </p>
    </button>
  );
}

interface QueueProps {
  orders: OrderQueueRow[];
  gapsFor: (o: OrderQueueRow) => string[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onEdit: (id: number) => void;
  onDelete: (o: { id: number; order_code: string }) => void;
}

/** Inbox: PC list trái + inspector phải. Điện thoại hàng đợi + sheet. */
export function OrderQueue({ orders, gapsFor, selectedId, onSelect, onEdit, onDelete }: QueueProps) {
  const isMobile = useIsMobile();
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  useEffect(() => {
    if (isMobile) return;
    if (orders.length === 0) return;
    if (selectedId != null && orders.some((o) => o.id === selectedId)) return;
    onSelect(orders[0].id);
  }, [isMobile, orders, selectedId, onSelect]);

  const list = (
    <div className={isMobile ? "" : "max-h-[min(70vh,44rem)] overflow-y-auto border-r"}>
      {orders.map((o) => (
        <QueueItem
          key={o.id}
          order={o}
          selected={!isMobile && selectedId === o.id}
          onSelect={() => onSelect(o.id)}
        />
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {list}
        <Sheet open={selected !== null} onOpenChange={(open) => !open && onSelect(null)}>
          <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md" side="right">
            {selected ? (
              <>
                <SheetHeader>
                  <SheetTitle className="font-mono text-base">{selected.order_code}</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <OrderInspector
                    order={selected}
                    gaps={gapsFor(selected)}
                    onEdit={() => onEdit(selected.id)}
                    onDelete={() => onDelete({ id: selected.id, order_code: selected.order_code })}
                  />
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="grid min-h-[24rem] md:grid-cols-[minmax(16rem,22rem)_1fr]">
      {list}
      <div className="p-4">
        {selected ? (
          <OrderInspector
            order={selected}
            gaps={gapsFor(selected)}
            onEdit={() => onEdit(selected.id)}
            onDelete={() => onDelete({ id: selected.id, order_code: selected.order_code })}
          />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">Chọn một đơn bên trái.</p>
        )}
      </div>
    </div>
  );
}
