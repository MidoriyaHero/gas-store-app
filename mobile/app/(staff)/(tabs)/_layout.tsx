import { Tabs, router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { logoutSession } from "@/auth/logout";
import { OfflineSessionBanner } from "@/components/OfflineSessionBanner";
import { navTheme, colors, spacing } from "@/theme/tokens";

/** Staff bottom navigation (UX v2: orders + map) with logout. */
export default function StaffTabsLayout() {
  async function logout() {
    await logoutSession();
    router.replace("/login");
  }

  return (
    <>
    <OfflineSessionBanner />
    <Tabs
      screenOptions={{
        ...navTheme,
        headerRight: () => (
          <Pressable onPress={() => void logout()} style={styles.logoutBtn} accessibilityRole="button" accessibilityLabel="Đăng xuất">
            <Ionicons name="log-out-outline" size={22} color={colors.primary} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Đơn giao",
          tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: "Ghi chú",
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="directions"
        options={{
          title: "Điểm giao",
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
