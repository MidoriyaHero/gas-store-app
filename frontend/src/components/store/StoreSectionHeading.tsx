import { cn } from "@/lib/utils";

interface StoreSectionHeadingProps {
  label: string;
  title: string;
  description?: string;
  className?: string;
}

/** Consistent storefront section heading with an optional supporting line. */
export function StoreSectionHeading({ label, title, description, className }: StoreSectionHeadingProps) {
  return (
    <div className={cn("store-stack max-w-2xl", className)}>
      <p className="store-eyebrow">{label}</p>
      <h2 className="text-3xl sm:text-4xl">{title}</h2>
      {description ? <p className="max-w-xl text-base leading-relaxed text-black/65">{description}</p> : null}
    </div>
  );
}
