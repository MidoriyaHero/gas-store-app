import { ReactNode } from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
};

/** Labeled input with visible label (not placeholder-only). */
export function TextField({ label, hint, error, style, ...rest }: TextFieldProps) {
  const a11y = label ?? (typeof rest.placeholder === "string" ? rest.placeholder : "Input");
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        accessibilityLabel={a11y}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color={colors.error}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
  },
  inputError: { borderColor: colors.error },
});
