import { StoreLinkButton } from "./StoreActions";

/** Floating glass call and Zalo bar for narrow screens. The call control pulses. */
export function StoreMobileBar() {
  return (
    <div className="store-glass store-mobile-bar fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-1 p-1 lg:hidden">
      <StoreLinkButton kind="call" className="store-pulse">
        Gọi
      </StoreLinkButton>
      <StoreLinkButton kind="zalo">Zalo</StoreLinkButton>
    </div>
  );
}
