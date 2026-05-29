import type { salesOrders } from "@/db/schema";

type OrderRow = typeof salesOrders.$inferSelect;

export type DeliveryTarget = {
  destination: string;
  label: string;
  hasGps: boolean;
};

/** Resolve navigation target from cached order row and payload fallback. */
export function resolveDeliveryTarget(order: OrderRow): DeliveryTarget | null {
  let address: string | null = order.deliveryAddress;
  let lat = order.deliveryLatitude;
  let lng = order.deliveryLongitude;

  if (address == null || lat == null || lng == null) {
    try {
      const payload = JSON.parse(order.payloadJson) as Record<string, unknown>;
      address ??= (payload.address as string | null) ?? null;
      lat ??= payload.delivery_latitude != null ? Number(payload.delivery_latitude) : null;
      lng ??= payload.delivery_longitude != null ? Number(payload.delivery_longitude) : null;
    } catch {
      /* ignore malformed payload */
    }
  }

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      destination: `${lat},${lng}`,
      label: address?.trim() || `${lat}, ${lng}`,
      hasGps: true,
    };
  }

  const text = address?.trim();
  if (text) {
    return { destination: text, label: text, hasGps: false };
  }

  return null;
}
