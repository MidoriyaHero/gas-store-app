/**
 * Shared governance definitions aligned with the feature execution plan.
 */
export const CORE_FEATURE_SCOPE = {
  mustHave: [
    "Sổ bình serial/QR theo vòng đời",
    "Đặt cọc vỏ và công nợ tách biệt",
    "Đối soát thu tiền theo ca giao",
    "Dashboard vận hành trong ngày",
  ],
  shouldHave: ["Gợi ý gom đơn theo khu vực", "Cảnh báo bất thường thu thiếu/chưa chốt trạng thái"],
} as const;

export const FINANCE_KPI_DEFINITIONS = [
  {
    key: "report_latency_d1",
    label: "Độ trễ báo cáo nội bộ",
    target: "<= D+1",
    source: "Đơn hàng đã chốt và báo cáo tài chính ngày",
  },
  {
    key: "cash_reconcile_delta",
    label: "Sai lệch doanh thu - ngân quỹ",
    target: "<= 0.5%",
    source: "Đối soát ca giao, tổng thu theo phương thức",
  },
  {
    key: "forecast_stockout_rate",
    label: "Tỷ lệ thiếu hàng do dự báo sai",
    target: "Giảm >= 20%",
    source: "Tồn kho theo SKU + tốc độ bán",
  },
] as const;

export const CUSTOMER_JOURNEY_STEPS = [
  { key: "remind", title: "Nhắc định kỳ", sla: "Tự động theo chu kỳ tiêu thụ" },
  { key: "reorder", title: "Đặt lại 1 chạm", sla: "<= 15 giây thao tác" },
  { key: "track", title: "Theo dõi trạng thái", sla: "Nhất quán giữa khách và nội bộ" },
  { key: "feedback", title: "Phản hồi sau giao", sla: "Owner + deadline rõ ràng" },
] as const;

export const SAFETY_CHECKLIST_CATALOG = [
  {
    code: "safe-valve",
    item: "Van bình hoạt động bình thường",
    severity: "critical",
  },
  {
    code: "safe-seal",
    item: "Tem/niêm chì nguyên vẹn",
    severity: "critical",
  },
  {
    code: "safe-leak",
    item: "Không phát hiện rò rỉ",
    severity: "critical",
  },
  {
    code: "safe-inspection",
    item: "Bình còn hạn kiểm định",
    severity: "critical",
  },
] as const;
