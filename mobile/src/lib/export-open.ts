import * as FileSystem from "expo-file-system";
import * as Linking from "expo-linking";

import { API_BASE_URL } from "@/config";
import { getAccessToken } from "@/auth/session";

/** Download authenticated CSV export to cache and open with system handler. */
export async function openAuthenticatedExport(path: string, filename: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Chưa đăng nhập");
  const target = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, target, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status >= 400) throw new Error(`Export failed (${result.status})`);
  await Linking.openURL(result.uri);
}

/** Fetch delivery slip HTML and open from local cache. */
export async function openDeliverySlip(orderId: number): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Chưa đăng nhập");
  const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/delivery-slip.html`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Không tải phiếu (${res.status})`);
  const html = await res.text();
  const target = `${FileSystem.cacheDirectory}slip-${orderId}.html`;
  await FileSystem.writeAsStringAsync(target, html);
  await Linking.openURL(target);
}
