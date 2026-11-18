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

export const CUSTOMER_JOURNEY_STEPS = [
  { key: "remind", title: "Nhắc định kỳ", sla: "Tự động theo chu kỳ tiêu thụ" },
  { key: "reorder", title: "Đặt lại 1 chạm", sla: "<= 15 giây thao tác" },
  { key: "track", title: "Theo dõi trạng thái", sla: "Nhất quán giữa khách và nội bộ" },
  { key: "feedback", title: "Phản hồi sau giao", sla: "Owner + deadline rõ ràng" },
] as const;
