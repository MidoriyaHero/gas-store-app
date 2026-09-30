import { BadgeCheck } from "lucide-react";
import { STORE } from "@/lib/storeFacts";

/** Continuous strip of confirmed storefront promises. */
export function StoreSign() {
  return (
    <section aria-label="Cam kết phục vụ" className="store-marquee border-y border-white/60 bg-white/45 py-4">
      <div className="store-marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="store-marquee-row" aria-hidden={copy === 1}>
            {STORE.promises.map((text) => (
              <span key={`${text}-${copy}`} className="flex shrink-0 items-center gap-2 whitespace-nowrap px-5 text-sm font-semibold">
                <BadgeCheck className="h-5 w-5 text-[var(--store-orange)]" aria-hidden />
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
