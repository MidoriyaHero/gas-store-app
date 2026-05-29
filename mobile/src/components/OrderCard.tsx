import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge, StatusTone } from "@/components/ui/StatusBadge";
import { colors, spacing } from "@/theme/tokens";

type OrderCardProps = {
  orderCode: string;
  customerName: string;
  subtitle?: string;
  statusLabel: string;
  statusTone: StatusTone;
  meta?: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
  primaryAction?: { label: string; onPress: () => void; loading?: boolean };
  secondaryAction?: { label: string; onPress: () => void };
  footer?: ReactNode;
  onPress?: () => void;
};

/** Reusable delivery / order list card. */
export function OrderCard({
  orderCode,
  customerName,
  subtitle,
  statusLabel,
  statusTone,
  meta = [],
  primaryAction,
  secondaryAction,
  footer,
  onPress,
}: OrderCardProps) {
  const body = (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AppText variant="mono" style={styles.code}>
            {orderCode}
          </AppText>
          <AppText variant="h3">{customerName}</AppText>
          {subtitle ? (
            <AppText variant="caption" muted>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </View>

      {meta.length > 0 ? (
        <View style={styles.metaRow}>
          {meta.map((m) => (
            <View key={m.text} style={styles.metaItem}>
              <Ionicons name={m.icon} size={16} color={colors.textMuted} />
              <AppText variant="caption" muted>
                {m.text}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {footer}

      {(primaryAction || secondaryAction) && (
        <View style={styles.actions}>
          {secondaryAction ? (
            <Button label={secondaryAction.label} variant="ghost" onPress={secondaryAction.onPress} style={styles.actionBtn} />
          ) : null}
          {primaryAction ? (
            <Button
              label={primaryAction.label}
              variant="accent"
              loading={primaryAction.loading}
              onPress={primaryAction.onPress}
              fullWidth
              style={styles.actionBtn}
            />
          ) : null}
        </View>
      )}
    </Card>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  headerLeft: { flex: 1, gap: 2 },
  code: { color: colors.primary, letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  actionBtn: { flex: 1 },
});
