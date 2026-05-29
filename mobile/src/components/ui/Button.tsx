import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  ViewStyle,
} from "react-native";

import { AppText } from "@/components/ui/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger";

type ButtonProps = PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
};

const variantStyle: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, text: "#FFFFFF" },
  secondary: { bg: colors.primarySoft, text: colors.primary },
  accent: { bg: colors.accent, text: "#FFFFFF" },
  ghost: { bg: "transparent", text: colors.primary, border: colors.border },
  danger: { bg: colors.errorSoft, text: colors.error },
};

/** Primary interactive control — min 48dp touch target. */
export function Button({
  label,
  variant = "primary",
  loading,
  fullWidth,
  icon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const v = variantStyle[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border ?? v.bg,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
          alignSelf: fullWidth ? ("stretch" as const) : undefined,
        },
        style as ViewStyle,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <>
          {icon}
          <AppText variant="bodyMedium" style={{ color: v.text }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
});
