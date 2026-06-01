import { AdminMenuPanel } from "@/features/admin/AdminMenuPanel";
import { Screen } from "@/components/ui/Screen";

/** Admin tab: overflow menu (Figma v5.2 — cân 2+FAB+2). */
export default function AdminMoreTabScreen() {
  return (
    <Screen scroll safeTop>
      <AdminMenuPanel />
    </Screen>
  );
}
