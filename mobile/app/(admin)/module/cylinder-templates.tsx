import { AdminCylinderTemplatesPanel } from "@/features/admin/AdminExtendedPanels";
import { Screen } from "@/components/ui/Screen";

export default function AdminCylinderTemplatesScreen() {
  return (
    <Screen padded={false}>
      <AdminCylinderTemplatesPanel />
    </Screen>
  );
}
