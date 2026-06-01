import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type CallHistoryGroup,
  formatRelativeCallTime,
  getCallLogPermissionState,
  loadGroupedCallHistory,
  requestCallLogPermission,
  type CallLogPermissionState,
} from "@/lib/call-log";
import { lookupCustomerFromPhoneLocal } from "@/lib/customer-from-phone";
import { formatPhoneDisplay } from "@/lib/phone-normalize";

export type CallHistoryRow = CallHistoryGroup & {
  displayPhone: string;
  customerName: string | null;
};

export type CallTypeFilter = "all" | "incoming" | "outgoing";

/** Load and filter grouped call history for admin order picker. */
export function useCallLogPicker() {
  const [permission, setPermission] = useState<CallLogPermissionState>("unknown");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CallTypeFilter>("all");

  const enrichGroups = useCallback(async (groups: CallHistoryGroup[]): Promise<CallHistoryRow[]> => {
    return Promise.all(
      groups.map(async (g) => {
        const hint = await lookupCustomerFromPhoneLocal(g.phone);
        return {
          ...g,
          displayPhone: formatPhoneDisplay(g.phone),
          customerName: hint?.customerName ?? null,
        };
      }),
    );
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getCallLogPermissionState();
      setPermission(state);
      if (state !== "granted") {
        setRows([]);
        return;
      }
      const groups = await loadGroupedCallHistory();
      setRows(await enrichGroups(groups));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được lịch sử cuộc gọi");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [enrichGroups]);

  const requestPermission = useCallback(async () => {
    const state = await requestCallLogPermission();
    setPermission(state);
    if (state === "granted") {
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.lastCallType !== typeFilter) return false;
      if (!q) return true;
      const hay = `${r.displayPhone} ${r.phone} ${r.customerName ?? ""}`.toLowerCase();
      return hay.includes(q.replace(/\s/g, ""));
    });
  }, [rows, search, typeFilter]);

  return {
    permission,
    loading,
    rows: filtered,
    error,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    refresh,
    requestPermission,
    formatRelativeCallTime,
  };
}
