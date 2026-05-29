import { AdminTaxPanel } from "@/features/admin/AdminExtendedPanels";
import { Screen } from "@/components/ui/Screen";

export default function AdminTaxScreen() {
  return (
    <Screen padded={false}>
      <AdminTaxPanel />
    </Screen>
  );
}
