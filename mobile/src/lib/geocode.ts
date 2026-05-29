/** Geocode hit from ``GET /api/geocode`` (Nominatim proxy). */
export type GeocodeHit = {
  lat: number;
  lng: number;
  display_name: string;
  place_id: string;
};

/** Round WGS84 to 6 decimals for API payload. */
export function roundCoord6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
