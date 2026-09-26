import { Gift, Tag, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STORE } from "@/lib/storeFacts";

const TILES: Array<{ icon: LucideIcon; text: string; tone: string }> = [
  { icon: Tag, text: STORE.offers, tone: "var(--store-orange)" },
  { icon: Gift, text: STORE.gift, tone: "var(--store-sky)" },
  { icon: Ticket, text: STORE.raffle, tone: "var(--store-orange)" },
];

/** One row of three glass offer squares. A copy waits off-screen for the loop. */
export function StoreSign() {
  return (
    <section aria-label="Ưu đãi" className="store-marquee store-section">
      <div className="store-marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="store-marquee-row" aria-hidden={copy === 1}>
            {TILES.map((item) => (
              <article key={`${item.text}-${copy}`} className="store-glass store-tile">
                <item.icon className="mx-auto h-6 w-6" style={{ color: item.tone }} aria-hidden />
                <p className="text-[var(--store-ink)]">{item.text}</p>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
