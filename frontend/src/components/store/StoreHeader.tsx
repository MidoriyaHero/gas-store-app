import { useEffect, useState } from "react";
import { STORE } from "@/lib/storeFacts";
import { cn } from "@/lib/utils";
import { StoreLinkButton, StorePhoneLine } from "./StoreActions";

const NAV = [
  { href: "#san-pham", label: "Sản phẩm" },
  { href: "#hoi-dap", label: "Hỏi đáp" },
] as const;

/** Sticky hours bar and navigation. The nav turns to glass after the page scrolls. */
export function StoreHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={cn("store-chrome sticky top-0 z-30", scrolled && "is-scrolled")}>
      <div className="store-pad flex min-h-10 items-center justify-between gap-3 bg-[var(--store-orange)] py-2 text-sm text-white">
        <span>{STORE.hours}</span>
        <StorePhoneLine />
      </div>
      <header
        className={cn(
          "store-pad grid h-16 grid-cols-[1fr_auto] items-center gap-4 bg-transparent lg:grid-cols-[1fr_auto_1fr]",
          scrolled && "store-glass rounded-none",
        )}
      >
        <a href="#dau-trang" className="flex items-center gap-3 text-lg font-semibold text-[var(--store-ink)]">
          <img src="/brand/logo-mark.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" />
          Gas Huy Hoàng
        </a>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Mục trên trang">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-base font-medium hover:text-[var(--store-orange)]">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="hidden justify-self-end lg:block">
          <StoreLinkButton kind="call">Gọi</StoreLinkButton>
        </div>
      </header>
    </div>
  );
}
