/**
 * Catalog list price for a customer segment. Retail is ``sellPrice`` / ``sell_price``.
 */
export function unitPriceForSegment(
  product: {
    sellPrice?: string | number;
    sell_price?: string | number;
    wholesalePrice?: string | number | null;
    wholesale_price?: string | number | null;
    restaurantPrice?: string | number | null;
    restaurant_price?: string | number | null;
  },
  segment: string | null | undefined,
): number {
  const retail = Number(String(product.sellPrice ?? product.sell_price ?? "0").replace(/[^\d.-]/g, "")) || 0;
  if (segment === "wholesale") {
    const tagged = Number(String(product.wholesalePrice ?? product.wholesale_price ?? "0").replace(/[^\d.-]/g, "")) || 0;
    return tagged > 0 ? tagged : retail;
  }
  if (segment === "restaurant") {
    const tagged = Number(String(product.restaurantPrice ?? product.restaurant_price ?? "0").replace(/[^\d.-]/g, "")) || 0;
    return tagged > 0 ? tagged : retail;
  }
  return retail;
}
