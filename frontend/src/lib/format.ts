export const formatVND = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v.toLocaleString("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
};

export const formatNumber = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN");

export const formatDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const formatDateTime = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
