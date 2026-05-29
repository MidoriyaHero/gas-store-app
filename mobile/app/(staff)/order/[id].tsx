import { useLocalSearchParams } from "expo-router";

import { StaffOrderDetailPanel } from "@/features/staff/StaffOrderDetailPanel";
import { Screen } from "@/components/ui/Screen";

/** Order detail with inline notes and voice capture. */
export default function StaffOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);

  return (
    <Screen scroll padded={false}>
      <StaffOrderDetailPanel orderId={orderId} />
    </Screen>
  );
}
