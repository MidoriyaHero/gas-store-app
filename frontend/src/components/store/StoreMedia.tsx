import { Clock3, MapPin, Navigation, Truck } from "lucide-react";
import { STORE } from "@/lib/storeFacts";
import { StoreSectionHeading } from "./StoreSectionHeading";

/** Store location with delivery coverage and direct directions. */
export function StoreMedia() {
  return (
    <section id="duong-di" className="store-section scroll-mt-24">
      <div className="store-stack mx-auto max-w-6xl">
        <StoreSectionHeading
          label="Đường đến cửa hàng"
          title="Ngay mặt tiền đường ĐT784"
          description="Ghé cửa hàng hoặc gọi để được giao tận nơi tại Truông Mít và các khu vực lân cận."
        />
        <div className="store-glass grid overflow-hidden p-2 lg:grid-cols-[1.35fr_0.65fr]">
          <iframe
            title="Bản đồ GAS Huy Hoàng, 199 ĐT784, Truông Mít"
            src={STORE.mapsEmbed}
            className="aspect-[4/3] h-full min-h-[360px] w-full rounded-[18px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="store-stack justify-center p-6 sm:p-8">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--store-orange)]" aria-hidden />
              <p className="text-sm leading-relaxed">{STORE.address}</p>
            </div>
            <div className="flex gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--store-orange)]" aria-hidden />
              <p className="text-sm">{STORE.hours}</p>
            </div>
            <div className="flex gap-3">
              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--store-orange)]" aria-hidden />
              <div className="flex flex-wrap gap-2">
                {STORE.areas.map((area) => (
                  <span key={area} className="store-pill text-xs">{area}</span>
                ))}
              </div>
            </div>
            <a className="store-btn store-btn-call mt-2 w-full" href={STORE.directionsUrl} target="_blank" rel="noreferrer">
              <Navigation className="h-4 w-4" aria-hidden />
              Chỉ đường
            </a>
            <a className="text-center text-sm text-[var(--store-blue)] underline-offset-4 hover:underline" href={STORE.mapsUrl} target="_blank" rel="noreferrer">
              Mở trên Google Maps
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
