import { StaffOrdersPanel } from "@/features/staff/StaffPanels";
import { Screen } from "@/components/ui/Screen";

/** Staff orders tab. */
export default function StaffOrdersScreen() {
  return (
    <Screen padded={false}>
      <StaffOrdersPanel />
    </Screen>
  );
}
