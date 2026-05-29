import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { colors, spacing } from "@/theme/tokens";

type ToastBannerProps = {
  message: string;
  tone?: "success" | "error";
  onDismiss: () => void;
  durationMs?: number;
};

/** Short-lived feedback banner at top of screen. */
export function ToastBanner({ message, tone = "success", onDismiss, durationMs = 3200 }: ToastBannerProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  const bg = tone === "success" ? colors.successSoft : colors.errorSoft;
  const fg = tone === "success" ? colors.success : colors.error;
  const border = tone === "success" ? "#86efac" : "#fecaca";

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }]} accessibilityRole="alert">
      <AppText variant="bodyMedium" style={{ color: fg }}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
    padding: spacing.sm + 4,
    borderRadius: 10,
    borderWidth: 1,
  },
});
