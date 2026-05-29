import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

const toneMap: Record<StatusTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: colors.successSoft, fg: colors.success, icon: "checkmark-circle" },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: "time" },
  error: { bg: colors.errorSoft, fg: colors.error, icon: "alert-circle" },
  info: { bg: colors.primarySoft, fg: colors.primary, icon: "information-circle" },
  neutral: { bg: "#F1F5F9", fg: colors.textSecondary, icon: "ellipse" },
};

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

/** Compact status pill for orders and sync state. */
export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  const t = toneMap[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]} accessibilityRole="text">
      <Ionicons name={t.icon} size={14} color={t.fg} />
      <AppText variant="caption" style={{ color: t.fg, fontFamily: "Inter_600SemiBold" }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
});
