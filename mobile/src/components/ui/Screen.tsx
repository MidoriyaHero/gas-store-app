import { ReactNode } from "react";
import { ScrollView, StatusBar, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme/tokens";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Include top safe inset when native header is hidden (e.g. admin tabs). */
  safeTop?: boolean;
  style?: ViewStyle;
};

/** Safe-area screen shell with consistent background. */
export function Screen({ children, scroll, padded = true, safeTop = false, style }: ScreenProps) {
  const content = (
    <View style={[styles.fill, padded ? styles.padded : undefined, style]}>{children}</View>
  );

  const edges = safeTop ? (["top", "left", "right"] as const) : (["left", "right"] as const);

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  scrollContent: { flexGrow: 1 },
});
