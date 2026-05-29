import { OutboxPanel } from "@/features/system/OutboxPanel";
import { Screen } from "@/components/ui/Screen";

/** Outbox queue and conflict resolution. */
export default function OutboxScreen() {
  return (
    <Screen padded={false}>
      <OutboxPanel />
    </Screen>
  );
}
