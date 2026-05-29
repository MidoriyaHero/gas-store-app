import { StaffDirectionsPanel } from "@/features/staff/StaffDirectionsPanel";
import { Screen } from "@/components/ui/Screen";

/** Staff delivery stops — external Google Maps only. */
export default function StaffDirectionsScreen() {
  return (
    <Screen padded={false}>
      <StaffDirectionsPanel />
    </Screen>
  );
}
