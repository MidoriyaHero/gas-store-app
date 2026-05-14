import { AppLayout } from "@/components/AppLayout";
import { DeliveryMapPanel } from "@/components/DeliveryMapPanel";

/**
 * Staff full-page wrapper around ``DeliveryMapPanel`` (in-transit orders).
 */
export default function StaffDeliveryMap() {
  return (
    <AppLayout
      title="Bản đồ giao hàng"
      description="Đơn đang giao — chọn đơn để xem bản đồ và mở Google Maps chỉ đường."
    >
      <DeliveryMapPanel />
    </AppLayout>
  );
}
