import { Clock, Gift, MapPin, Phone, Ticket, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { STORE } from "@/lib/storeFacts";
import { StoreSectionHeading } from "./StoreSectionHeading";

const QUESTIONS: Array<{ icon?: LucideIcon; img?: string; q: string; a: ReactNode }> = [
  { icon: MapPin, q: "Cửa hàng ở đâu?", a: STORE.address },
  { icon: Clock, q: "Mấy giờ mở cửa?", a: "GAS Huy Hoàng mở cửa 24 giờ." },
  { icon: Truck, q: "Giao ở đâu?", a: STORE.areas.join(", ") },
  { icon: Gift, q: "Đổi gas hoặc mua bếp có quà không?", a: STORE.gift },
  { icon: Ticket, q: "Rút thăm khi nào?", a: "Mỗi năm." },
  { icon: Phone, q: "Gọi số nào?", a: `${STORE.callDisplay} hoặc ${STORE.phoneDisplay}` },
  { img: "/brand/zalo-icon-40.png", q: "Nhắn Zalo số nào?", a: STORE.zaloDisplay },
  {
    img: "/brand/ggmap-icon-40.png",
    q: "Làm sao tới cửa hàng?",
    a: (
      <a
        className="text-[var(--store-blue)] underline-offset-4 hover:underline"
        href={STORE.directionsUrl}
        target="_blank"
        rel="noreferrer"
      >
        Chỉ đường tới 199 ĐT784
      </a>
    ),
  },
];

/** Questions in one narrow column. The chevron turns when a row opens. */
export function StoreFaq() {
  return (
    <section id="hoi-dap" className="store-section scroll-mt-24">
      <div className="store-stack mx-auto max-w-2xl">
        <StoreSectionHeading
          label="Hỏi đáp"
          title="Thông tin cần biết"
          description="Những câu trả lời nhanh trước khi gọi hoặc ghé cửa hàng."
        />
        <Accordion type="single" collapsible className="store-glass px-5 sm:px-7">
          {QUESTIONS.map((item, index) => (
            <AccordionItem key={item.q} value={`q-${index}`} className="border-black/10">
              <AccordionTrigger className="text-left text-base hover:no-underline">
                <span className="flex items-center gap-3">
                  {item.icon ? (
                    <item.icon className="h-5 w-5 shrink-0 text-[var(--store-orange)]" aria-hidden />
                  ) : (
                    <img src={item.img} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                  )}
                  {item.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pl-8 text-base leading-relaxed text-black/65">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
