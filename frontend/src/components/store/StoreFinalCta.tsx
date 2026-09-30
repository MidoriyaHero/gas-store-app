import { STORE } from "@/lib/storeFacts";
import { StoreLinkButton, StorePhoneLine } from "./StoreActions";

/** High-contrast closing action for immediate ordering. */
export function StoreFinalCta() {
  return (
    <section className="store-band store-section">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8">
        <div className="store-stack">
          <p className="text-sm font-semibold text-white/80">{STORE.hours}</p>
          <h2 className="max-w-md text-3xl text-white sm:text-4xl">Cần gas? Gọi Huy Hoàng</h2>
          <p className="max-w-md text-base leading-relaxed text-white/90">{STORE.address}</p>
          <StorePhoneLine className="text-lg" />
        </div>
        <div className="flex flex-wrap gap-3">
          <StoreLinkButton kind="call" className="store-btn-on-band">
            Gọi đặt gas
          </StoreLinkButton>
          <StoreLinkButton kind="zalo" className="store-btn-on-band">
            Nhắn Zalo
          </StoreLinkButton>
        </div>
      </div>
    </section>
  );
}
