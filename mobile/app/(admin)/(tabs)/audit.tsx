import { AdminAuditPanel } from "@/features/admin/AdminPanels";
import { Screen } from "@/components/ui/Screen";

/** Admin daily audit screen shell. */
export default function AdminAuditScreen() {
  return (
    <Screen scroll padded={false} safeTop>
      <AdminAuditPanel />
    </Screen>
  );
}
