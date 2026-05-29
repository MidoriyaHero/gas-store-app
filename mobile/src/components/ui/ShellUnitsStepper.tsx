import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/theme/tokens";

type Props = {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
};

/** Numeric stepper for borrowed shell units (parity with web order form). */
export function ShellUnitsStepper({ value, onChange, disabled }: Props) {
  const safe = Math.max(0, Math.floor(value));

  function setFromText(text: string) {
    const n = Number(text.replace(/[^\d]/g, ""));
    onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Giảm nợ vỏ"
        disabled={disabled || safe <= 0}
        onPress={() => onChange(Math.max(0, safe - 1))}
        style={[styles.btn, (disabled || safe <= 0) && styles.btnDisabled]}
      >
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.inputWrap}>
        <TextField
          value={String(safe)}
          onChangeText={setFromText}
          keyboardType="number-pad"
          editable={!disabled}
          style={styles.input}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tăng nợ vỏ"
        disabled={disabled}
        onPress={() => onChange(safe + 1)}
        style={[styles.btn, disabled && styles.btnDisabled]}
      >
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
      <AppText variant="caption" muted>
        bình
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.4 },
  inputWrap: { flex: 1, minWidth: 72 },
  input: { textAlign: "center" },
});
