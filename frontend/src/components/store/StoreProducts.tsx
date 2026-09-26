import { STORE } from "@/lib/storeFacts";
import { StoreLinkButton } from "./StoreActions";

/** Four product names on glass cards. Prices stay off this page until the shop URL is real. */
export function StoreProducts() {
  return (
    <section id="san-pham" className="store-section scroll-mt-28">
      <div className="store-stack mx-auto max-w-6xl">
        <h2 className="text-3xl">Sản phẩm</h2>
        <ul className="store-stagger grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STORE.products.map((name) => (
            <li key={name}>
              <article className="store-glass store-card flex h-full flex-col p-6">
                <h3 className="text-3xl leading-tight">{name}</h3>
                <div className="mt-8">
                  <StoreLinkButton kind="call">Gọi</StoreLinkButton>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
