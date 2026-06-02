import { useState } from "react";
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  /** Eye icon to toggle password visibility (use with secureTextEntry). */
  passwordToggle?: boolean;
};

/** Labeled input with visible label (not placeholder-only). */
export function TextField({ label, hint, error, style, passwordToggle, secureTextEntry, ...rest }: TextFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const a11y = label ?? (typeof rest.placeholder === "string" ? rest.placeholder : "Input");
  const isSecure = Boolean(secureTextEntry) && !(passwordToggle && passwordVisible);

  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={a11y}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            passwordToggle ? styles.inputWithToggle : null,
            error ? styles.inputError : null,
            style,
          ]}
          secureTextEntry={isSecure}
          {...rest}
        />
        {passwordToggle ? (
          <Pressable
            style={styles.toggleBtn}
            onPress={() => setPasswordVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            hitSlop={8}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
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
  inputRow: { position: "relative" },
  inputWithToggle: { paddingRight: spacing.xl + spacing.sm },
  toggleBtn: {
    position: "absolute",
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    minWidth: 40,
    alignItems: "center",
  },
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
