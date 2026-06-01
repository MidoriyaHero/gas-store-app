import { PermissionsAndroid, Platform } from "react-native";
import CallLogs from "react-native-call-log";

import { normalizePhoneKey } from "@/lib/phone-normalize";

export type CallHistoryGroup = {
  phone: string;
  callCount: number;
  lastCallAt: number;
  lastCallType: "incoming" | "outgoing";
};

export type CallLogPermissionState = "unknown" | "granted" | "denied";

const RAW_LIMIT = 100;
const WINDOW_DAYS = 7;

const PERMISSION_RATIONALE = {
  title: "Quyền lịch sử cuộc gọi",
  message:
    "Gas Huy Hoàng cần đọc lịch sử cuộc gọi để bạn chọn số khách và tạo đơn nhanh. Dữ liệu cuộc gọi chỉ lưu trên máy, không gửi lên server.",
  buttonPositive: "Cho phép",
  buttonNegative: "Từ chối",
};

/** Map native call log type to incoming/outgoing/missed. */
function parseCallType(raw: string): "incoming" | "outgoing" | "missed" | null {
  const t = raw.trim().toUpperCase();
  if (t === "1" || t === "INCOMING") return "incoming";
  if (t === "2" || t === "OUTGOING") return "outgoing";
  if (t === "3" || t === "MISSED" || t === "VOICEMAIL" || t === "REJECTED" || t === "BLOCKED") return "missed";
  return null;
}

/** Group non-missed calls by normalized phone. */
export function groupCallEntries(
  entries: Array<{ phoneNumber: string; type: string; dateTime: string }>,
): CallHistoryGroup[] {
  const minTs = Date.now() - WINDOW_DAYS * 24 * 3600_000;
  const groups = new Map<string, CallHistoryGroup>();

  for (const entry of entries) {
    const kind = parseCallType(entry.type);
    if (!kind || kind === "missed") continue;

    const phone = normalizePhoneKey(entry.phoneNumber);
    if (!phone || phone.length < 9) continue;

    const ts = Number(entry.dateTime);
    if (!Number.isFinite(ts) || ts < minTs) continue;

    const existing = groups.get(phone);
    if (!existing || ts > existing.lastCallAt) {
      groups.set(phone, {
        phone,
        callCount: (existing?.callCount ?? 0) + 1,
        lastCallAt: ts,
        lastCallType: kind,
      });
    } else {
      groups.set(phone, { ...existing, callCount: existing.callCount + 1 });
    }
  }

  return [...groups.values()].sort((a, b) => b.lastCallAt - a.lastCallAt);
}

/** Request Android READ_CALL_LOG permission. */
export async function requestCallLogPermission(): Promise<CallLogPermissionState> {
  if (Platform.OS !== "android") return "denied";
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
    PERMISSION_RATIONALE,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
}

/** Current READ_CALL_LOG permission without prompting. */
export async function getCallLogPermissionState(): Promise<CallLogPermissionState> {
  if (Platform.OS !== "android") return "denied";
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
  return granted ? "granted" : "denied";
}

/** Load grouped call history from device (local only). */
export async function loadGroupedCallHistory(): Promise<CallHistoryGroup[]> {
  const minTimestamp = Date.now() - WINDOW_DAYS * 24 * 3600_000;
  const raw = await CallLogs.load(RAW_LIMIT, { minTimestamp });
  return groupCallEntries(raw);
}

/** Relative time label for last call timestamp. */
export function formatRelativeCallTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
