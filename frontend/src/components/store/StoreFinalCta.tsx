import { STORE } from "@/lib/storeFacts";
import { StoreLinkButton, StorePhoneLine } from "./StoreActions";

/** Full-width orange close, with the numbers on the left and glass buttons on the right. */
export function StoreFinalCta() {
  return (
    <section className="store-band store-section">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8">
        <div className="store-stack">
          <h2 className="text-3xl text-white sm:text-4xl">{STORE.hours}</h2>
          <p className="store-copy max-w-md text-base text-white/90">{STORE.address}</p>
          <StorePhoneLine className="text-lg" />
        </div>
        <div className="flex flex-wrap gap-3">
          <StoreLinkButton kind="call" className="store-btn-on-band">
            Gọi
          </StoreLinkButton>
          <StoreLinkButton kind="zalo" className="store-btn-on-band">
            Zalo
          </StoreLinkButton>
        </div>
      </div>
    </section>
  );
}
