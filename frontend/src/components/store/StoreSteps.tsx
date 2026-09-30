import { ClipboardCheck, PackageCheck, PhoneCall } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STORE } from "@/lib/storeFacts";
import { StoreSectionHeading } from "./StoreSectionHeading";

const ICONS: LucideIcon[] = [PhoneCall, ClipboardCheck, PackageCheck];

/** Three-step ordering flow for first-time customers. */
export function StoreSteps() {
  return (
    <section className="store-section">
      <div className="store-stack mx-auto max-w-6xl">
        <StoreSectionHeading
          label="Cách đặt gas"
          title="Ba bước là gas tới nhà"
          description="Liên hệ trực tiếp, xác nhận nhanh và nhận hàng tận nơi."
        />
        <ol className="store-steps grid gap-4 md:grid-cols-3">
          {STORE.steps.map((step, index) => {
            const Icon = ICONS[index];
            return (
              <li key={step.title} className="store-glass store-step relative p-6">
                <div className="mb-8 flex items-center justify-between">
                  <span className="store-icon-ring">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="text-4xl font-extrabold text-[var(--store-orange)]/20">0{index + 1}</span>
                </div>
                <h3 className="text-xl">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-black/65">{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
