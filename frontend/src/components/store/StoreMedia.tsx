import { STORE } from "@/lib/storeFacts";

/** Place embed so Google can show the listing, including a rating when one exists. */
export function StoreMedia() {
  return (
    <section id="duong-di" className="scroll-mt-28">
      <iframe
        title="Bản đồ GAS Huy Hoàng, 199 ĐT784, Truông Mít"
        src={STORE.mapsEmbed}
        className="h-[420px] w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="store-pad mx-auto max-w-6xl py-4">
        <a
          className="text-[var(--store-blue)] underline-offset-4 hover:underline"
          href={STORE.mapsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Mở GAS Huy Hoàng trên Google Maps
        </a>
      </p>
    </section>
  );
}
