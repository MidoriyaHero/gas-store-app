import { Pressable, StyleSheet, View } from "react-native";
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";

import { AppText } from "@/components/ui/AppText";
import { colors, radius, shadow, spacing } from "@/theme/tokens";

const FAB_SIZE = 56;
const FAB_HALF = FAB_SIZE / 2;

/** Admin bottom tabs with centered elevated FAB for quick create order. */
export function AdminTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const routes = state.routes;

  function renderTab(routeIndex: number) {
    const route = routes[routeIndex];
    if (!route) return null;
    const { options } = descriptors[route.key];
    const label = options.title ?? route.name;
    const isFocused = state.index === routeIndex;
    const color = isFocused ? colors.primary : colors.textMuted;

    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
      >
        {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
        <AppText variant="caption" style={{ color, fontFamily: isFocused ? "Inter_600SemiBold" : "Inter_400Regular" }}>
          {label}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.row}>
        <View style={styles.halfLeft}>
          {renderTab(0)}
          {renderTab(1)}
        </View>
        <View style={styles.halfRight}>
          {renderTab(2)}
          {renderTab(3)}
        </View>
      </View>
      <Pressable
        style={styles.fab}
        onPress={() => router.push("/(admin)/order/create" as Href)}
        accessibilityRole="button"
        accessibilityLabel="Tạo đơn nhanh"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 48,
  },
  halfLeft: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingRight: FAB_HALF + spacing.xs,
  },
  halfRight: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingLeft: FAB_HALF + spacing.xs,
  },
  tab: {
    alignItems: "center",
    gap: 2,
    minWidth: 72,
    minHeight: 48,
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    left: "50%",
    marginLeft: -FAB_HALF,
    top: -20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.elevated,
  },
});
