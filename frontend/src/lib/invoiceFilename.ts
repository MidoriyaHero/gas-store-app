/**
 * Filename stem aligned with backend ``invoice_filename_stem``: ``TenKH-so``.
 */
export function invoiceFilenameStem(
  customerName: string,
  phone: string | null | undefined,
  fallback: string
): string {
  const rawName = (customerName || "").trim() || fallback;
  const safeName = rawName.replace(/[<>:"/\\|?*\r\n]+/g, "").replace(/\s+/g, "-").slice(0, 120) || fallback;
  const digits = (phone || "").replace(/\D/g, "").slice(0, 20);
  const stem = digits ? `${safeName}-${digits}` : safeName;
  return stem.slice(0, 200);
}

/** Suggested download name for per-order exports (HTML/CSV). */
export function invoiceDownloadFilename(
  customerName: string,
  phone: string | null | undefined,
  ext: string
): string {
  return `${invoiceFilenameStem(customerName, phone, "khach")}.${ext}`;
}
