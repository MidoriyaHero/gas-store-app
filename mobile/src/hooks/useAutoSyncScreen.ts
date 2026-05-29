import { useEffect, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";

import { triggerAutoSync } from "@/sync/auto-sync";
import { subscribeSyncComplete } from "@/sync/sync-notify";

type Options = {
  /** Pull from server when the screen gains focus (default true). */
  syncOnFocus?: boolean;
};

/**
 * Reload local SQLite-backed UI when sync completes and when the screen is focused.
 * Uses ``useIsFocused`` so nested panels inside tab/stack screens work reliably.
 */
export function useAutoSyncScreen(reloadFn: () => void | Promise<void>, options: Options = {}): void {
  const { syncOnFocus = true } = options;
  const isFocused = useIsFocused();
  const reloadRef = useRef(reloadFn);
  reloadRef.current = reloadFn;
  const syncedFocusRef = useRef(false);

  useEffect(() => {
    return subscribeSyncComplete(() => {
      try {
        void Promise.resolve(reloadRef.current());
      } catch {
        /* ignore listener errors */
      }
    });
  }, []);

  useEffect(() => {
    if (!isFocused) {
      syncedFocusRef.current = false;
      return;
    }
    void Promise.resolve(reloadRef.current());
    if (syncOnFocus && !syncedFocusRef.current) {
      syncedFocusRef.current = true;
      void triggerAutoSync("screen-focus");
    }
  }, [isFocused, syncOnFocus]);
}
