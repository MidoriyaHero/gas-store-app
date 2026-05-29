import { AdminGasLedgerPanel } from "@/features/admin/AdminExtendedPanels";
import { Screen } from "@/components/ui/Screen";

export default function AdminGasLedgerScreen() {
  return (
    <Screen padded={false}>
      <AdminGasLedgerPanel />
    </Screen>
  );
}
