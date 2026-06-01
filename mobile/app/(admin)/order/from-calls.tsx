import { CallHistoryOrderPicker } from "@/features/admin/CallHistoryOrderPicker";
import { Screen } from "@/components/ui/Screen";

/** Admin: pick a recent call → prefill create order. */
export default function AdminFromCallsScreen() {
  return (
    <Screen padded={false}>
      <CallHistoryOrderPicker />
    </Screen>
  );
}
