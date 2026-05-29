import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { colors, spacing } from "@/theme/tokens";

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Friendly empty list with optional CTA. */
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={colors.textMuted} />
      </View>
      <AppText variant="h3" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" muted style={styles.desc}>
        {description}
      </AppText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} style={styles.btn} />
      ) : null}
    </View>
  );
}

/** Metric tile for dashboard overview. */
export function MetricCard({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "primary" | "accent" | "success" | "warning";
}) {
  const iconColor =
    tone === "accent"
      ? colors.accent
      : tone === "success"
        ? colors.success
        : tone === "warning"
          ? colors.warning
          : colors.primary;
  const bg =
    tone === "accent"
      ? colors.accentSoft
      : tone === "success"
        ? colors.successSoft
        : tone === "warning"
          ? colors.warningSoft
          : colors.primarySoft;

  return (
    <View style={[metricStyles.card, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <AppText variant="h2" style={{ color: colors.text, marginTop: spacing.sm }}>
        {value}
      </AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: { textAlign: "center", marginBottom: spacing.sm },
  desc: { textAlign: "center", maxWidth: 280 },
  btn: { marginTop: spacing.lg },
});

const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    padding: spacing.md,
    borderRadius: 16,
    minHeight: 112,
  },
});
