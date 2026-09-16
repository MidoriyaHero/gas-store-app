import { AdminInventoryCrudPanel } from "@/features/admin/AdminExtendedPanels";
import { Screen } from "@/components/ui/Screen";

export default function AdminProductsScreen() {
  return (
    <Screen padded={false}>
      <AdminInventoryCrudPanel />
    </Screen>
  );
}
