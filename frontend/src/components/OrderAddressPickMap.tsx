import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MousePointerClick, Smartphone } from "lucide-react";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Subscribes to ``prefers-reduced-motion`` for fly/pan animation. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/** Keeps Leaflet layout correct inside dialogs and after layout shifts. */
function InvalidateWhenVisible({ visible }: { visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      map.invalidateSize();
    }, 280);
    return () => window.clearTimeout(id);
  }, [map, visible]);
  return null;
}

/** Pans/zooms when the focused marker changes (geocode hit or saved GPS). */
function FollowMarker({ marker }: { marker: { lat: number; lng: number } | null }) {
  const map = useMap();
  const reduceMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (!marker) return;
    map.setView([marker.lat, marker.lng], Math.max(map.getZoom(), 15), { animate: !reduceMotion });
  }, [map, marker?.lat, marker?.lng, reduceMotion]);
  return null;
}

/** Zoom with Ctrl/Meta + wheel so dialog scroll is not captured by the map. */
function WheelZoomWithModifier() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z = map.getZoom();
      const step = e.deltaY > 0 ? -1 : 1;
      map.setZoom(Math.min(19, Math.max(3, z + step)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [map]);
  return null;
}

/** Desktop: click or right-click. Long-press on touch fires ``contextmenu`` on many browsers. */
function PointerPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Touch: hold ~500ms without moving finger to drop a pin (same as ``onPick``).
 * Single tap still works via Leaflet ``click`` for quick picks.
 */
function TouchHoldPick({ onPick, holdMs = 520 }: { onPick: (lat: number, lng: number) => void; holdMs?: number }) {
  const map = useMap();
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const el = map.getContainer();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0;
    let sy = 0;

    const clear = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const onTouchStart = (ev: TouchEvent) => {
      clear();
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      timer = window.setTimeout(() => {
        timer = null;
        const rect = el.getBoundingClientRect();
        const ll = map.containerPointToLatLng(L.point(sx - rect.left, sy - rect.top));
        onPickRef.current(ll.lat, ll.lng);
      }, holdMs);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (timer == null || ev.touches.length !== 1) return;
      const t = ev.touches[0];
      if (Math.hypot(t.clientX - sx, t.clientY - sy) > 14) clear();
    };

    const end = () => clear();

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      clear();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [map, holdMs]);

  return null;
}

export interface OrderAddressPickMapProps {
  /** Current pin from geocode or saved GPS; controls ``Marker`` visibility. */
  marker: { lat: number; lng: number } | null;
  /** Map center when there is no marker yet. */
  fallbackCenter: [number, number];
  /** Parent dialog open — triggers ``invalidateSize`` so tiles render. */
  visible: boolean;
  /** User chose a point on the map (click, right-click, long-press, or tap). */
  onPick: (lat: number, lng: number) => void;
  className?: string;
}

/**
 * Interactive OSM map for choosing ``delivery_latitude`` / ``delivery_longitude``
 * without typing numbers. Cross-origin embeds cannot receive pointer events from the host page.
 */
export function OrderAddressPickMap({ marker, fallbackCenter, visible, onPick, className }: OrderAddressPickMapProps) {
  const center = marker ?? { lat: fallbackCenter[0], lng: fallbackCenter[1] };
  const stablePick = useCallback(
    (lat: number, lng: number) => {
      const la = Math.round(lat * 1e6) / 1e6;
      const lo = Math.round(lng * 1e6) / 1e6;
      onPick(la, lo);
    },
    [onPick]
  );

  return (
    <div
      className={className}
      role="group"
      aria-label="Bản đồ chọn vị trí giao hàng: bấm hoặc giữ trên bản đồ để ghim tọa độ GPS."
    >
      <div className="flex flex-col gap-1 border-b bg-muted/40 px-2 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-start gap-2">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Máy tính:</span> bấm trái hoặc phải trên bản đồ để ghim.
          </span>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Điện thoại:</span> chạm hoặc giữ khoảng nửa giây để ghim.
          </span>
        </div>
        <p className="border-t border-border/60 pt-1.5 text-[11px] leading-snug">
          Phóng to: nút + và − trên bản đồ. Trên máy tính có thể giữ <kbd className="rounded border bg-background px-1 font-mono text-[10px]">Ctrl</kbd> hoặc{" "}
          <kbd className="rounded border bg-background px-1 font-mono text-[10px]">⌘</kbd> rồi cuộn chuột trên bản đồ — cuộn thường vẫn cuộn form.
        </p>
      </div>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={marker ? 16 : 12}
        className="h-[min(50vh,380px)] w-full touch-manipulation rounded-b-md z-0"
        scrollWheelZoom={false}
        attributionControl
      >
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <WheelZoomWithModifier />
        <InvalidateWhenVisible visible={visible} />
        <FollowMarker marker={marker} />
        <PointerPick onPick={stablePick} />
        <TouchHoldPick onPick={stablePick} />
        {marker ? <Marker position={[marker.lat, marker.lng]} /> : null}
      </MapContainer>
    </div>
  );
}
