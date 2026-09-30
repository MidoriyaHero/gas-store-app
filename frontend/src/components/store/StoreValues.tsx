import { BadgeCheck, HandHeart, ShieldCheck, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STORE } from "@/lib/storeFacts";
import { StoreSectionHeading } from "./StoreSectionHeading";

const ICONS: LucideIcon[] = [ShieldCheck, Truck, HandHeart, BadgeCheck];

/** Service commitments paired with the store's branded poster. */
export function StoreValues() {
  return (
    <section id="cam-ket" className="store-section scroll-mt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="store-stack">
          <StoreSectionHeading
            label="Cam kết phục vụ"
            title="Bán gas bằng sự an tâm"
            description="Chất lượng sản phẩm, an toàn khi sử dụng và sự tận tâm là những điều Huy Hoàng luôn chú trọng."
          />
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {STORE.values.map((value, index) => {
              const Icon = ICONS[index];
              return (
                <li key={value.title} className="flex gap-4 rounded-2xl border border-white/70 bg-white/45 p-4">
                  <span className="store-icon-ring shrink-0">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-base">{value.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-black/60">{value.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <figure className="store-poster store-glass mx-auto max-w-md overflow-hidden p-3">
          <img
            src="/brand/avt2.webp"
            alt="Thông tin dịch vụ Đại lý Gas Huy Hoàng"
            width={800}
            height={1200}
            loading="lazy"
            className="w-full rounded-[18px]"
          />
        </figure>
      </div>
    </section>
  );
}
