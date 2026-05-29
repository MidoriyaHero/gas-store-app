import { AdminMenuPanel } from "@/features/admin/AdminMenuPanel";
import { Screen } from "@/components/ui/Screen";

/** Admin overflow menu for P2 modules (stack entry). */
export default function AdminMenuScreen() {
  return (
    <Screen scroll>
      <AdminMenuPanel />
    </Screen>
  );
}
