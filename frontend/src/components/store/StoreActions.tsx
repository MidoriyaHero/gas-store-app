import type { CSSProperties, ReactNode } from "react";
import { Phone } from "lucide-react";
import { STORE } from "@/lib/storeFacts";
import { cn } from "@/lib/utils";

const NUMBERS = [
  { href: STORE.callTel, text: STORE.callDisplay },
  { href: STORE.phoneTel, text: STORE.phoneDisplay },
] as const;

/** Both shop numbers, each as a call link. */
export function StorePhoneLine({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <p className={cn("flex flex-wrap gap-x-4 gap-y-1", className)} style={style}>
      {NUMBERS.map((item) => (
        <a key={item.href} href={item.href} className="font-semibold">
          {item.text}
        </a>
      ))}
    </p>
  );
}

type Kind = "call" | "zalo";

/** Text button that calls the shop or opens Zalo. The number stays in the accessible name. */
export function StoreLinkButton({
  kind,
  className,
  children,
}: {
  kind: Kind;
  className?: string;
  children: ReactNode;
}) {
  const isCall = kind === "call";
  return (
    <a
      href={isCall ? STORE.callTel : STORE.zaloUrl}
      aria-label={isCall ? `Gọi ${STORE.callDisplay}` : `Nhắn Zalo ${STORE.zaloDisplay}`}
      target={isCall ? undefined : "_blank"}
      rel={isCall ? undefined : "noreferrer"}
      className={cn("store-btn", isCall ? "store-btn-call" : "store-btn-zalo", className)}
    >
      {isCall ? (
        <Phone className="h-4 w-4" aria-hidden />
      ) : (
        <img src="/brand/zalo-icon-40.png" alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
      )}
      {children}
    </a>
  );
}
