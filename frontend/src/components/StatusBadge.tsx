import { CheckCircle2, AlertTriangle, Clock3, CircleDollarSign, CircleDashed, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BusinessStatus } from "@/lib/ui-foundation";

interface StatusBadgeProps {
  status: BusinessStatus;
  label?: string;
}

/**
 * Accessible badge with icon + text (never color-only).
 */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const resolved = resolveStatus(status, label);
  return (
    <Badge variant="outline" className={resolved.className} aria-label={resolved.a11yLabel}>
      <resolved.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {resolved.label}
    </Badge>
  );
}

function resolveStatus(status: BusinessStatus, label?: string) {
  switch (status) {
    case "ready":
      return {
        label: label ?? "Đủ điều kiện",
        a11yLabel: "Trạng thái đủ điều kiện",
        Icon: CheckCircle2,
        className: "gap-1 border-emerald-700 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100",
      };
    case "missing":
      return {
        label: label ?? "Thiếu thông tin",
        a11yLabel: "Trạng thái thiếu thông tin",
        Icon: AlertTriangle,
        className: "gap-1 border-amber-800 text-amber-950 dark:border-amber-400 dark:text-amber-100",
      };
    case "overdue":
      return {
        label: label ?? "Quá hạn",
        a11yLabel: "Trạng thái quá hạn",
        Icon: Clock3,
        className: "gap-1 border-red-700 text-red-900 dark:border-red-400 dark:text-red-100",
      };
    case "paid":
      return {
        label: label ?? "Đã thu",
        a11yLabel: "Trạng thái đã thu tiền",
        Icon: CircleDollarSign,
        className: "gap-1 border-emerald-700 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100",
      };
    case "unpaid":
      return {
        label: label ?? "Chưa thu",
        a11yLabel: "Trạng thái chưa thu tiền",
        Icon: CircleDashed,
        className: "gap-1 border-orange-700 text-orange-900 dark:border-orange-400 dark:text-orange-100",
      };
    case "in_progress":
      return {
        label: label ?? "Đang xử lý",
        a11yLabel: "Trạng thái đang xử lý",
        Icon: Loader2,
        className: "gap-1 border-blue-700 text-blue-900 dark:border-blue-400 dark:text-blue-100",
      };
    case "closed":
      return {
        label: label ?? "Đã đóng",
        a11yLabel: "Trạng thái đã đóng",
        Icon: ShieldCheck,
        className: "gap-1 border-emerald-700 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100",
      };
    case "open":
    default:
      return {
        label: label ?? "Đang mở",
        a11yLabel: "Trạng thái đang mở",
        Icon: ShieldAlert,
        className: "gap-1 border-purple-700 text-purple-900 dark:border-purple-400 dark:text-purple-100",
      };
  }
}
