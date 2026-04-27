import { AppLayout } from "@/components/AppLayout";
import { DeliveryNotesPanel } from "@/components/DeliveryNotesPanel";

/** Delivery notes page for admin and staff (admin also has notes inside Đơn hàng). */
export default function OrderNotes() {
  return (
    <AppLayout title="Ghi chú giao hàng" description="Ghi chữ hoặc ghi âm nhanh, danh sách đơn giản.">
      <DeliveryNotesPanel />
    </AppLayout>
  );
}
