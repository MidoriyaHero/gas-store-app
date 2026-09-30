import { CookingPot, Cylinder, Flame, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STORE } from "@/lib/storeFacts";
import { StoreLinkButton } from "./StoreActions";
import { StoreSectionHeading } from "./StoreSectionHeading";

const ICONS: Record<(typeof STORE.products)[number]["icon"], LucideIcon> = {
  cylinder: Cylinder,
  flame: Flame,
  wrench: Wrench,
  cookingPot: CookingPot,
};

/** Product overview with direct ordering actions. */
export function StoreProducts() {
  return (
    <section id="san-pham" className="store-section scroll-mt-24">
      <div className="store-stack mx-auto max-w-6xl">
        <StoreSectionHeading
          label="Sản phẩm"
          title="Đủ lựa chọn cho gia đình và quán ăn"
          description="Gọi cửa hàng để được tư vấn loại gas, van hoặc bếp phù hợp với nhu cầu đang dùng."
        />
        <ul className="store-stagger grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STORE.products.map((product) => {
            const Icon = ICONS[product.icon];
            return (
              <li key={product.name}>
                <article className="store-glass store-card flex h-full flex-col p-6">
                  <span className="store-icon-ring mb-6">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="text-2xl leading-tight">{product.name}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-black/65">{product.description}</p>
                  <div className="mt-6">
                    <StoreLinkButton kind="call" className="w-full">
                      Gọi đặt
                    </StoreLinkButton>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
