import { AdminUsersCrudPanel } from "@/features/admin/AdminExtendedPanels";
import { Screen } from "@/components/ui/Screen";

export default function AdminUsersScreen() {
  return <Screen padded={false}><AdminUsersCrudPanel /></Screen>;
}
