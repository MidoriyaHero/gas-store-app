import { Text, TextProps, StyleSheet } from "react-native";

import { colors, typography } from "@/theme/tokens";

type Variant = keyof typeof typography;

type AppTextProps = TextProps & {
  variant?: Variant;
  muted?: boolean;
  color?: string;
};

/** Themed text with Inter variants and accessible default size. */
export function AppText({ variant = "body", muted, color, style, ...rest }: AppTextProps) {
  return (
    <Text
      style={[
        typography[variant],
        { color: color ?? (muted ? colors.textSecondary : colors.text) },
        style,
      ]}
      {...rest}
    />
  );
}

/** Uppercase section label above lists. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <AppText variant="label" style={styles.section}>
      {children.toUpperCase()}
    </AppText>
  );
}

const styles = StyleSheet.create({
  section: {
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
});
