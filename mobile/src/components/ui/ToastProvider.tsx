import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { View, StyleSheet } from "react-native";

import { ToastBanner } from "@/components/ui/ToastBanner";

type ToastTone = "success" | "error";

type ToastState = {
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Global toast host — wrap app root once. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((message: string, tone: ToastTone) => {
    setToast({ message, tone });
  }, []);

  const value = useMemo(
    () => ({
      showSuccess: (message: string) => show(message, "success"),
      showError: (message: string) => show(message, "error"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View style={styles.host} pointerEvents="none">
          <ToastBanner
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => setToast(null)}
          />
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

/** Access global toast from any screen. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
});
