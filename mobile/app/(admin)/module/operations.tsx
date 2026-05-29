import { AdminOperationsPanel } from "@/features/admin/AdminModulePanels";
import { Screen } from "@/components/ui/Screen";

export default function AdminOperationsScreen() {
  return <Screen padded={false} scroll><AdminOperationsPanel /></Screen>;
}
