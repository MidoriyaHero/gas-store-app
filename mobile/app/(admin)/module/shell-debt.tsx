import { AdminShellDebtPanel } from "@/features/admin/AdminModulePanels";
import { Screen } from "@/components/ui/Screen";

/** Orders with borrowed shell units (synced cache). */
export default function AdminShellDebtScreen() {
  return (
    <Screen padded={false}>
      <AdminShellDebtPanel />
    </Screen>
  );
}
