import { geocodeReverse, geocodeSearch } from "@/api/client";
import type { GeocodeHit } from "@/lib/geocode";

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const AT_COORD = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const D3D = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/i;
const LL = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/i;
const Q_PAIR = /[?&]q=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)(?:\b|&)/i;
const STATICMAP = /staticmap\?center=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)/i;
const PLACE_PATH = /\/maps\/place\/([^/@?]+)/i;

/** Parse two decimal degree strings when both are valid WGS84. */
function parsePair(a: string, b: string): { lat: number; lng: number } | null {
  const lat = Number(a.replace(",", "."));
  const lng = Number(b.replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

/** Extract the first coordinate pair from Maps URL/HTML text (pin before viewport @). */
function extractCoordsFromText(text: string): { lat: number; lng: number } | null {
  for (const rx of [D3D, AT_COORD, LL, Q_PAIR, STATICMAP]) {
    const m = text.match(rx);
    if (!m) {
      continue;
    }
    const pair = parsePair(m[1], m[2]);
    if (pair) {
      return pair;
    }
  }
  return null;
}

/** Decode ``/maps/place/…`` slug into a geocodable address string. */
function extractPlaceQuery(finalUrl: string): string | null {
  const m = finalUrl.match(PLACE_PATH);
  if (!m) {
    return null;
  }
  const slug = decodeURIComponent(m[1].replace(/\+/g, " ")).split("/data=")[0].trim();
  return slug.length >= 8 ? slug : null;
}

/** Build shorter place queries when the full Google label misses in Nominatim. */
function placeQueryVariants(placeQ: string): string[] {
  const parts = placeQ.split(",").map((p) => p.trim()).filter(Boolean);
  const variants = [placeQ];
  if (parts.length > 2) {
    variants.push(parts.slice(-3).join(", "));
  }
  if (parts.length > 1) {
    variants.push(parts.slice(-2).join(", "));
  }
  return [...new Set(variants.filter(Boolean))];
}

/**
 * Resolve a pasted Google Maps URL on-device (follow redirect, read og:staticmap).

 * Short ``maps.app.goo.gl`` links often lack ``@lat,lng``; fetching from the phone
 * returns the correct preview center for the user's region.
 */
export async function resolveGoogleMapsPasteClient(raw: string): Promise<GeocodeHit | null> {
  const urlMatch = raw.trim().match(URL_IN_TEXT);
  if (!urlMatch) {
    return null;
  }

  let finalUrl = urlMatch[0];
  let html = "";
  try {
    const resp = await fetch(finalUrl, { method: "GET", redirect: "follow" });
    finalUrl = resp.url;
    html = await resp.text();
  } catch {
    return null;
  }

  const coords = extractCoordsFromText(finalUrl) ?? extractCoordsFromText(html);
  if (coords) {
    try {
      return await geocodeReverse(coords.lat, coords.lng);
    } catch {
      return {
        lat: coords.lat,
        lng: coords.lng,
        display_name: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
        place_id: "client-coords",
      };
    }
  }

  const placeQ = extractPlaceQuery(finalUrl);
  if (!placeQ) {
    return null;
  }

  for (const q of placeQueryVariants(placeQ)) {
    const hits = await geocodeSearch(q, 1);
    if (hits[0]) {
      return hits[0];
    }
  }
  return null;
}
