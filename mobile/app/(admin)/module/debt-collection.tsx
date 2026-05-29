import { AdminDebtCollectionPanel } from "@/features/admin/AdminExtendedPanels";
import { Screen } from "@/components/ui/Screen";

/** Admin debt collection queue (monetary, live API). */
export default function AdminDebtCollectionScreen() {
  return (
    <Screen padded={false}>
      <AdminDebtCollectionPanel />
    </Screen>
  );
}
