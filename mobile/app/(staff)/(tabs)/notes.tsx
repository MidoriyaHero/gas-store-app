import { StaffNotesPanel } from "@/features/staff/StaffNotesPanel";
import { Screen } from "@/components/ui/Screen";

export default function StaffNotesScreen() {
  return (
    <Screen padded={false}>
      <StaffNotesPanel />
    </Screen>
  );
}
