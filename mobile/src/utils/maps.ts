import { Linking, Platform } from "react-native";

/** Open Google Maps place search (pick location, copy link back to app). */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim() || "Việt Nam")}`;
}

/** Open Google Maps search for an address or coordinates. */
export async function openGoogleMapsSearch(query: string): Promise<boolean> {
  try {
    await Linking.openURL(googleMapsSearchUrl(query));
    return true;
  } catch {
    return false;
  }
}

/** Google Maps directions deep link (same contract as web geocode-map). */
export function googleDirectionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function mapsFallbackUrls(destination: string): string[] {
  const trimmed = destination.trim();
  const urls = [googleDirectionsUrl(trimmed), `https://maps.google.com/maps?daddr=${encodeURIComponent(trimmed)}`];
  const coordMatch = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (coordMatch) {
    urls.unshift(`geo:${coordMatch[1]},${coordMatch[2]}?q=${encodeURIComponent(trimmed)}`);
    if (Platform.OS === "android") {
      urls.unshift(`google.navigation:q=${coordMatch[1]},${coordMatch[2]}`);
    }
  }
  return urls;
}

/** Open Google Maps / browser with driving directions to destination. */
export async function openGoogleMapsDirections(destination: string): Promise<boolean> {
  for (const url of mapsFallbackUrls(destination)) {
    try {
      // canOpenURL often returns false on Android 11+ even when openURL works.
      await Linking.openURL(url);
      return true;
    } catch {
      /* try next scheme */
    }
  }
  return false;
}

/** Dial customer phone when supported on device. */
export async function openPhoneDialer(phone: string): Promise<boolean> {
  const normalized = phone.replace(/\s/g, "");
  const urls = Platform.OS === "ios" ? [`telprompt:${normalized}`, `tel:${normalized}`] : [`tel:${normalized}`];
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
