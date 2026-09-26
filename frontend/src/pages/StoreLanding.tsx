import { useEffect } from "react";
import { StoreFaq } from "@/components/store/StoreFaq";
import { StoreFinalCta } from "@/components/store/StoreFinalCta";
import { StoreFooter } from "@/components/store/StoreFooter";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreHero } from "@/components/store/StoreHero";
import { StoreMedia } from "@/components/store/StoreMedia";
import { StoreMobileBar } from "@/components/store/StoreMobileBar";
import { StoreProducts } from "@/components/store/StoreProducts";
import { StoreReveal } from "@/components/store/StoreReveal";
import { StoreSign } from "@/components/store/StoreSign";
import { StoreWhy } from "@/components/store/StoreWhy";
import { STORE } from "@/lib/storeFacts";

/**
 * Public storefront on a light blue field.
 * Products are named without prices.
 */
export default function StoreLanding() {
  useEffect(() => {
    document.title = STORE.pageTitle;
  }, []);

  return (
    <div className="store-landing min-h-screen pb-24 lg:pb-0">
      <div className="store-wash" aria-hidden="true" />
      <StoreHeader />
      <main>
        <StoreHero />
        <StoreSign />
        <StoreReveal>
          <StoreProducts />
        </StoreReveal>
        <StoreReveal>
          <StoreWhy />
        </StoreReveal>
        <StoreReveal>
          <StoreMedia />
        </StoreReveal>
        <StoreReveal>
          <StoreFaq />
        </StoreReveal>
        <StoreReveal>
          <StoreFinalCta />
        </StoreReveal>
      </main>
      <StoreFooter />
      <StoreMobileBar />
    </div>
  );
}
