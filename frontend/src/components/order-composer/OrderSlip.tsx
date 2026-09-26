import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OrderSlipProps = {
  customerName: string;
  phone: string;
  segmentLabel: string;
  address: string;
  deliveryDate: string;
  goodsLabel: string;
  paymentLabel: string;
  total: number;
  ready: boolean;
  className?: string;
};

/** `YYYY-MM-DD` → `DD/MM/YYYY` for the phiếu. */
function slipDate(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso.trim();
}

function SlipValue({ value, empty }: { value: string; empty: string }) {
  const text = value.trim();
  return (
    <b className={cn("text-right font-semibold", !text && "font-medium text-[#e3940f]")}>
      {text || empty}
    </b>
  );
}

/**
 * Live delivery slip shown while composing an order.
 * Empty fields stay flame-orange so sổ gas gaps are visible before save.
 */
export function OrderSlip({
  customerName,
  phone,
  segmentLabel,
  address,
  deliveryDate,
  goodsLabel,
  paymentLabel,
  total,
  ready,
  className,
}: OrderSlipProps) {
  return (
    <aside
      className={cn(
        "relative border border-[#e6dcc8] bg-[#fffdf8] text-[#1a2330] shadow-[0_1px_0_rgba(26,35,48,0.04),0_18px_40px_-24px_rgba(26,35,48,0.35)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-3.5 border-r border-dashed border-[#e6dcc8]"
        style={{
          background:
            "radial-gradient(circle at 7px 10px, #f4f7f8 5px, transparent 5.5px) 0 0 / 14px 20px",
        }}
      />
      <div className="py-4 pl-7 pr-4">
        <p className="m-0 text-xs font-semibold text-primary">Gas Huy Hoàng</p>
        <p className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight">Phiếu giao</p>
        <span
          className={cn(
            "mt-2.5 inline-block rotate-[-2deg] border-2 px-2 py-0.5 text-[11px] font-bold",
            ready ? "border-[#2c8a58] text-[#2c8a58]" : "border-[#e3940f] text-[#e3940f]",
          )}
        >
          {ready ? "Đủ sổ gas" : "Thiếu sổ gas"}
        </span>
        <ul className="mt-4 list-none space-y-0 p-0 text-[13px]">
          <li className="flex justify-between gap-3 border-b border-dotted border-[#e6dcc8] py-1.5">
            <span className="text-muted-foreground">Khách</span>
            <SlipValue value={customerName} empty="Chưa ghi tên" />
          </li>
          <li className="flex justify-between gap-3 border-b border-dotted border-[#e6dcc8] py-1.5">
            <span className="text-muted-foreground">Điện thoại</span>
            <SlipValue value={phone} empty="Chưa có SĐT" />
          </li>
          <li className="flex justify-between gap-3 border-b border-dotted border-[#e6dcc8] py-1.5">
            <span className="text-muted-foreground">Tệp</span>
            <SlipValue value={segmentLabel} empty="Chưa chọn tệp" />
          </li>
          <li className="flex justify-between gap-3 border-b border-dotted border-[#e6dcc8] py-1.5">
            <span className="text-muted-foreground">Điểm giao</span>
            <SlipValue value={address} empty="Chưa ghim điểm giao" />
          </li>
          <li className="flex justify-between gap-3 border-b border-dotted border-[#e6dcc8] py-1.5">
            <span className="text-muted-foreground">Ngày giao</span>
            <SlipValue value={slipDate(deliveryDate)} empty="Chưa chọn ngày" />
          </li>
          <li className="flex justify-between gap-3 border-b border-dotted border-[#e6dcc8] py-1.5">
            <span className="text-muted-foreground">Chai</span>
            <SlipValue value={goodsLabel} empty="Chưa thêm chai" />
          </li>
          <li className="flex justify-between gap-3 py-1.5">
            <span className="text-muted-foreground">Thu</span>
            <b className="text-right font-semibold">{paymentLabel}</b>
          </li>
        </ul>
        <div className="mt-3.5 flex items-baseline justify-between border-t-2 border-[#1a2330] pt-2.5 font-bold">
          <span>Tổng</span>
          <strong className="text-[22px] tabular-nums tracking-tight">{formatVND(total)}</strong>
        </div>
      </div>
    </aside>
  );
}
