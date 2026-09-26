import { STORE } from "@/lib/storeFacts";

/** Address, phone, and map links on an ink background. */
export function StoreFooter() {
  return (
    <footer className="store-section bg-[var(--store-ink)] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-3">
        <div className="store-stack">
          <p className="store-copy text-base leading-snug">{STORE.address}</p>
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
