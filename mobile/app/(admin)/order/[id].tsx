import { useLocalSearchParams } from "expo-router";

import { AdminOrderDetailPanel } from "@/features/admin/AdminOrderDetailPanel";
import { Screen } from "@/components/ui/Screen";

/** Admin order detail screen. */
export default function AdminOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen scroll>
      <AdminOrderDetailPanel orderId={Number(id)} />
    </Screen>
  );
}
