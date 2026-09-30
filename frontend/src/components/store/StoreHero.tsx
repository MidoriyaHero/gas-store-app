import { STORE } from "@/lib/storeFacts";
import { StoreLinkButton, StorePhoneLine } from "./StoreActions";

const CHIPS = STORE.promises.slice(0, 3);

/** Storefront hero pairing the brand promise with the physical store. */
export function StoreHero() {
  return (
    <section id="dau-trang" className="store-pad scroll-mt-24 py-5 sm:py-8">
      <div className="relative mx-auto grid max-w-7xl overflow-hidden rounded-[2rem] lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="store-hero-copy store-stack z-10 order-2 justify-center px-6 py-10 text-[var(--store-ink)] sm:px-10 lg:order-1 lg:px-14">
          <p className="store-rise store-eyebrow">Đại lý gas tại Truông Mít, Tây Ninh</p>
          <h1 className="store-rise max-w-[11ch] text-5xl font-extrabold leading-[0.98] sm:text-6xl lg:text-7xl">
            Gas Huy Hoàng
          </h1>
          <p className="store-rise max-w-[32ch] text-xl font-semibold leading-snug text-[var(--store-blue)]" style={{ animationDelay: "80ms" }}>
            {STORE.tagline}
          </p>
          <p className="store-rise max-w-[38ch] text-base leading-relaxed text-black/70 sm:text-lg" style={{ animationDelay: "120ms" }}>
            Giao gas tận nơi, tư vấn tận tâm và hỗ trợ nhanh 24/7 cho gia đình tại Truông Mít và khu vực lân cận.
          </p>
          <div className="store-rise flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
            <StoreLinkButton kind="call">Gọi đặt gas</StoreLinkButton>
            <StoreLinkButton kind="zalo">Nhắn Zalo</StoreLinkButton>
          </div>
          <StorePhoneLine className="store-rise text-base" style={{ animationDelay: "220ms" }} />
          <ul className="store-rise flex flex-wrap gap-2" style={{ animationDelay: "260ms" }}>
            {CHIPS.map((text) => (
              <li key={text} className="store-pill text-sm">
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="store-hero-media relative order-1 min-h-[360px] lg:order-2 lg:min-h-full">
          <img
            src="/brand/store-only.webp"
            alt="Mặt tiền Đại lý Gas Huy Hoàng tại Truông Mít"
            width={1200}
            height={875}
            fetchPriority="high"
            className="store-hero-img absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="store-hero-badge store-glass absolute bottom-5 right-5 max-w-[220px] p-4">
            <p className="font-bold">{STORE.hours}</p>
            <p className="mt-1 text-sm leading-snug text-black/65">{STORE.address}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
