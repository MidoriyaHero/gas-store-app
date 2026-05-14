/** One Nominatim-style hit from ``/api/geocode``. */
export interface GeocodeHit {
  lat: number;
  lng: number;
  display_name: string;
  place_id: string;
}

/** Open Google Maps directions to a free-text place or ``lat,lng`` pair. */
export function googleDirectionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Build an OSM embed URL centered on ``lat``/``lng`` with a marker. */
export function osmEmbedUrl(lat: number, lng: number, delta = 0.02): string {
  const minLng = lng - delta;
  const minLat = lat - delta;
  const maxLng = lng + delta;
  const maxLat = lat + delta;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}

/** Trung tâm TP. Tây Ninh (WGS84) — OSM vẫn phủ khu vực; dùng khi chưa ghim đơn. */
const TAY_NINH_CITY_CENTER: [number, number] = [11.3182, 106.0988];

/**
 * Tâm bản đồ ghim địa chỉ đơn khi chưa có GPS/ghim (ưu tiên ``VITE_MAP_DEFAULT_LAT`` / ``VITE_MAP_DEFAULT_LNG``).
 */
export function defaultOrderMapCenter(): [number, number] {
  const rawLat = typeof import.meta.env.VITE_MAP_DEFAULT_LAT === "string" ? import.meta.env.VITE_MAP_DEFAULT_LAT.trim() : "";
  const rawLng = typeof import.meta.env.VITE_MAP_DEFAULT_LNG === "string" ? import.meta.env.VITE_MAP_DEFAULT_LNG.trim() : "";
  if (!rawLat || !rawLng) return TAY_NINH_CITY_CENTER;
  const la = Number(rawLat.replace(",", "."));
  const lo = Number(rawLng.replace(",", "."));
  if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    return TAY_NINH_CITY_CENTER;
  }
  return [la, lo];
}
