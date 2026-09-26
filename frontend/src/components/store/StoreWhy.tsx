import { Clock, Gift, MapPin, Tag, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STORE } from "@/lib/storeFacts";

const POINTS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: Clock, text: STORE.hours },
  { icon: MapPin, text: `Giao ${STORE.areas.join(", ")}` },
  { icon: Tag, text: STORE.offers },
  { icon: Gift, text: STORE.gift },
  { icon: Ticket, text: STORE.raffle },
];

/** Five confirmed reasons, one icon each. */
export function StoreWhy() {
  return (
    <section aria-label="Vì sao chọn" className="store-section">
      <div className="store-stack mx-auto max-w-6xl">
        <h2 className="text-3xl">Vì sao chọn</h2>
        <ul className="store-stagger grid grid-cols-1 gap-4 lg:grid-cols-5">
          {POINTS.map((item) => (
            <li key={item.text} className="store-stack text-center">
              <item.icon className="mx-auto h-8 w-8 text-[var(--store-orange)]" aria-hidden />
              <p className={item.icon === MapPin ? "store-copy text-base leading-snug" : "text-base leading-snug"}>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
