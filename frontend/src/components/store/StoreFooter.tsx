import { STORE } from "@/lib/storeFacts";

/** Brand, contact and location links on an ink background. */
export function StoreFooter() {
  return (
    <footer className="store-section bg-[var(--store-ink)] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="store-stack">
          <div className="flex items-center gap-3">
            <img src="/brand/logo-mark-80.png" alt="" width={44} height={44} className="h-11 w-11 rounded-lg bg-white object-contain" />
            <p className="font-bold">Gas Huy Hoàng</p>
          </div>
          <p className="max-w-xs text-sm text-white/65">{STORE.tagline}</p>
        </div>
        <div className="store-stack">
          <p className="text-base leading-relaxed">{STORE.address}</p>
          <p className="text-base">{STORE.hours}</p>
        </div>
        <div className="store-stack">
          <a href={STORE.callTel} className="text-base font-semibold">
            Gọi {STORE.callDisplay}
          </a>
          <a href={STORE.phoneTel} className="text-base font-semibold">
            {STORE.phoneDisplay}
          </a>
          <a href={STORE.zaloUrl} target="_blank" rel="noreferrer" className="text-base font-semibold">
            Zalo {STORE.zaloDisplay}
          </a>
        </div>
        <div className="store-stack">
          <a href={STORE.facebookUrl} target="_blank" rel="noreferrer" className="text-base underline-offset-4 hover:underline">
            Facebook
          </a>
          <a href={STORE.mapsUrl} target="_blank" rel="noreferrer" className="text-base underline-offset-4 hover:underline">
            Google Maps
          </a>
        </div>
      </div>
    </footer>
  );
}
