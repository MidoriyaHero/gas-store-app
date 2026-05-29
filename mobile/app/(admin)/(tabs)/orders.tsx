import { AdminOrdersPanel } from "@/features/admin/AdminPanels";
import { Screen } from "@/components/ui/Screen";

/** Admin orders screen shell. */
export default function AdminOrdersScreen() {
  return (
    <Screen padded={false}>
      <AdminOrdersPanel />
    </Screen>
  );
}
