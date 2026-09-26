import { STORE } from "@/lib/storeFacts";
import { StoreLinkButton, StorePhoneLine } from "./StoreActions";

const CHIPS = [STORE.hours, STORE.offers, STORE.gift] as const;

/** Glass copy panel overlapping the storefront photo. */
export function StoreHero() {
  return (
    <section id="dau-trang" className="relative grid scroll-mt-28 lg:min-h-[70vh] lg:grid-cols-2">
      <img
        src="/brand/store-only.png"
        alt="Mặt tiền Đại lý Gas Huy Hoàng tại Truông Mít"
        className="h-72 w-full object-cover object-center lg:col-start-2 lg:row-start-1 lg:h-full lg:min-h-[70vh]"
      />
      <div className="store-glass store-stack z-10 -mt-10 mx-4 mb-6 justify-center px-6 py-10 text-[var(--store-ink)] lg:col-start-1 lg:row-start-1 lg:my-auto lg:ml-8 lg:-mr-16 lg:px-10 lg:py-14">
        <h1 className="store-rise max-w-[12ch] text-5xl font-bold leading-[1.05] sm:text-6xl">
          Gas Truông Mít, <span className="text-[var(--store-orange)]">Tây Ninh</span>
        </h1>
        <p className="store-rise store-copy max-w-[28ch] text-xl leading-snug" style={{ animationDelay: "100ms" }}>
          {STORE.address}
        </p>
        <div className="store-rise flex flex-wrap gap-3" style={{ animationDelay: "200ms" }}>
          <StoreLinkButton kind="call">Gọi</StoreLinkButton>
          <StoreLinkButton kind="zalo">Zalo</StoreLinkButton>
        </div>
        <StorePhoneLine className="store-rise text-lg" style={{ animationDelay: "300ms" }} />
        <ul className="store-rise flex flex-wrap gap-2" style={{ animationDelay: "400ms" }}>
          {CHIPS.map((text) => (
            <li key={text} className="store-glass px-3 py-1.5 text-sm font-medium">
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
