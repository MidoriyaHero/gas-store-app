import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { STORE } from "@/lib/storeFacts";
import { cn } from "@/lib/utils";
import { StoreLinkButton } from "./StoreActions";

const NAV = [
  { href: "#san-pham", label: "Sản phẩm" },
  { href: "#cam-ket", label: "Cam kết" },
  { href: "#duong-di", label: "Đường đi" },
  { href: "#hoi-dap", label: "Hỏi đáp" },
] as const;

/** Compact sticky storefront navigation. */
export function StoreHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("store-chrome store-pad sticky top-0 z-30", scrolled && "is-scrolled")}>
      <div className="mx-auto grid h-[72px] max-w-7xl grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <a href="#dau-trang" className="flex items-center gap-3 text-base font-bold text-[var(--store-ink)] sm:text-lg">
          <img src="/brand/logo-mark-80.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" />
          Gas Huy Hoàng
        </a>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Mục trên trang">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-base font-medium hover:text-[var(--store-orange)]">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 justify-self-end">
          <span className="store-pill text-xs sm:text-sm">
            <Clock3 className="h-4 w-4 text-[var(--store-orange)]" aria-hidden />
            <span className="sm:hidden">24 giờ</span>
            <span className="hidden sm:inline">{STORE.hours}</span>
          </span>
          <StoreLinkButton kind="call" className="hidden lg:inline-flex">
            Gọi ngay
          </StoreLinkButton>
        </div>
      </div>
    </header>
  );
}
