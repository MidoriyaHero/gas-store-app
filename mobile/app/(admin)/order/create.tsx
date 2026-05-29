import { AdminCreateOrderPanel } from "@/features/admin/AdminCreateOrderPanel";
import { Screen } from "@/components/ui/Screen";

/** Admin create order screen (stack, opened from FAB). */
export default function AdminCreateOrderScreen() {
  return (
    <Screen padded={false}>
      <AdminCreateOrderPanel />
    </Screen>
  );
}
