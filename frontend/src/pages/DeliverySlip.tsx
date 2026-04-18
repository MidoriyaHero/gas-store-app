import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiExportPath } from "@/lib/api";
import { invoiceDownloadFilename, invoiceFilenameStem } from "@/lib/invoiceFilename";
import { formatDate, formatDateTime } from "@/lib/format";

interface OrderLine {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  subtotal: string | number;
  owner_name?: string | null;
  cylinder_type?: string | null;
  cylinder_serial?: string | null;
  inspection_expiry?: string | null;
  import_source?: string | null;
  import_date?: string | null;
}

interface OrderDetail {
  id: number;
  order_code: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  delivery_date?: string | null;
  store_contact?: string | null;
  created_at: string;
  order_items: OrderLine[];
}

const DEFAULT_STORE =
  typeof import.meta.env.VITE_DEFAULT_STORE_CONTACT === "string"
    ? import.meta.env.VITE_DEFAULT_STORE_CONTACT
    : "";

/**
 * Printable delivery slip(s): one block per order line (phiếu / chai), matching the DOCX labels.
 */
export default function DeliverySlip() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const o = await apiGet<OrderDetail>(`/api/orders/${id}`);
        setOrder(o);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải được đơn");
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!order) return;
    const stem = invoiceFilenameStem(order.customer_name, order.phone, "phieu");
    const prev = document.title;
    document.title = stem;
    return () => {
      document.title = prev;
    };
  }, [order]);

  const customerBlock = [
    order?.customer_name,
    order?.address,
    order?.phone ? `Điện thoại: ${order.phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const deliveryLabel = order?.delivery_date ? formatDate(order.delivery_date) : formatDate(order?.created_at ?? "");

  const storeLine = order?.store_contact?.trim() || DEFAULT_STORE;

  return (
    <div className="min-h-screen bg-background p-6 print:p-8">
      <div className="mx-auto max-w-2xl print:max-w-none">
        <div className="mb-6 flex flex-wrap justify-end gap-2 print:hidden">
          {id && order && (
            <Button variant="outline" className="gap-2" asChild>
              <a
                href={apiExportPath(`/api/orders/${id}/delivery-slip.html`)}
                download={invoiceDownloadFilename(order.customer_name, order.phone, "html")}
              >
                Tải HTML
              </a>
            </Button>
          )}
          <Button type="button" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" /> In phiếu
          </Button>
        </div>

        {!order ? (
          <p className="text-muted-foreground">Đang tải...</p>
        ) : (
          order.order_items.map((line, idx) => (
            <section
              key={line.id}
              className={`space-y-4 ${idx < order.order_items.length - 1 ? "page-break-after mb-12 border-b pb-12 print:mb-0 print:border-0 print:pb-0" : ""}`}
              style={
                idx < order.order_items.length - 1 ? { pageBreakAfter: "always" as const } : undefined
              }
            >
              <h1 className="text-center text-xl font-bold uppercase tracking-wide">Phiếu giao hàng</h1>

              <dl className="grid gap-3 text-sm leading-relaxed">
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Chủ sở hữu:</dt>
                  <dd className="min-h-[1.25rem]">{line.owner_name ?? "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Loại chai:</dt>
                  <dd className="min-h-[1.25rem]">{line.cylinder_type ?? "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Số sê ri chai:</dt>
                  <dd className="font-mono text-base">{line.cylinder_serial ?? "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Hạn kiểm định trên chai:</dt>
                  <dd>{line.inspection_expiry ? formatDate(line.inspection_expiry) : "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Nơi nhập chai chứa cho cửa hàng:</dt>
                  <dd className="whitespace-pre-wrap">{line.import_source ?? "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Ngày nhập (chai vào cửa hàng):</dt>
                  <dd>{line.import_date ? formatDate(line.import_date) : "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Tên và địa chỉ khách hàng sử dụng:</dt>
                  <dd className="whitespace-pre-wrap">{customerBlock || "—"}</dd>
                </div>
                <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-2">
                  <dt>Ngày giao chai cho khách hàng:</dt>
                  <dd>{deliveryLabel}</dd>
                </div>
              </dl>

              <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Hàng hoá:</span> {line.product_name} × {line.quantity} (
                Mã đơn: <span className="font-mono">{order.order_code}</span>, tạo lúc {formatDateTime(order.created_at)})
              </div>

              <div className="mt-8 text-sm">
                <p className="mb-2 font-medium">Tên, địa chỉ và điện thoại liên hệ của cửa hàng:</p>
                <p className="min-h-[3rem] whitespace-pre-wrap border-b border-foreground/20 pb-1">{storeLine || "—"}</p>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
