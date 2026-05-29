import { ReactNode } from "react";
import { StyleSheet, View, ViewProps } from "react-native";

import { colors, radius, shadow, spacing } from "@/theme/tokens";

type CardProps = ViewProps & {
  children: ReactNode;
  elevated?: boolean;
  padding?: number;
};

/** Surface card with consistent elevation and padding. */
export function Card({ children, elevated, padding = spacing.md, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, elevated ? shadow.elevated : shadow.card, { padding }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
