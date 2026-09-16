import { desc } from "drizzle-orm";

import { searchOrders } from "@/api/client";
import { db } from "@/db/client";
import { salesOrders } from "@/db/schema";
import { isOnline } from "@/lib/network";
import { normalizePhoneKey, phonesMatch } from "@/lib/phone-normalize";

export type CustomerFromPhone = {
  customerName: string;
  address?: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  customerSegment?: "wholesale" | "restaurant" | "retail" | null;
};

/** Lookup customer hints from local SQLite orders by phone. */
export async function lookupCustomerFromPhoneLocal(phone: string): Promise<CustomerFromPhone | null> {
  const key = normalizePhoneKey(phone);
  if (!key) return null;

  const rows = await db.select().from(salesOrders).orderBy(desc(salesOrders.createdAt)).limit(200);
  const match = rows.find((r) => r.phone && phonesMatch(r.phone, key));
  if (!match) return null;

  return {
    customerName: match.customerName,
    address: match.deliveryAddress ?? undefined,
    deliveryLatitude: match.deliveryLatitude,
    deliveryLongitude: match.deliveryLongitude,
    customerSegment:
      match.customerSegment === "wholesale" || match.customerSegment === "restaurant" || match.customerSegment === "retail"
        ? match.customerSegment
        : null,
  };
}

/** Lookup customer from SQLite, then API when online. */
export async function lookupCustomerFromPhone(phone: string): Promise<CustomerFromPhone | null> {
  const local = await lookupCustomerFromPhoneLocal(phone);
  if (local) return local;

  if (!(await isOnline())) return null;

  try {
    const res = await searchOrders(phone, 10);
    const key = normalizePhoneKey(phone);
    const item = res.items.find((o) => phonesMatch(o.phone, key));
    if (!item) return null;
    return {
      customerName: item.customer_name,
      address: item.delivery_address ?? item.address ?? undefined,
      deliveryLatitude: item.delivery_latitude ?? null,
      deliveryLongitude: item.delivery_longitude ?? null,
      customerSegment:
        item.customer_segment === "wholesale" ||
        item.customer_segment === "restaurant" ||
        item.customer_segment === "retail"
          ? item.customer_segment
          : null,
    };
  } catch {
    return null;
  }
}
