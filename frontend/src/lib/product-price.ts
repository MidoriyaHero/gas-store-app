/**
 * Catalog list price for a customer segment. Retail is ``sell_price``.
 */
export function unitPriceForSegment(
  product: {
    sell_price: string | number;
    wholesale_price?: string | number | null;
    restaurant_price?: string | number | null;
  },
  segment: string | null | undefined,
): number {
  const retail = Number(product.sell_price) || 0;
  if (segment === "wholesale") {
    const tagged = Number(product.wholesale_price) || 0;
    return tagged > 0 ? tagged : retail;
  }
  if (segment === "restaurant") {
    const tagged = Number(product.restaurant_price) || 0;
    return tagged > 0 ? tagged : retail;
  }
  return retail;
}
