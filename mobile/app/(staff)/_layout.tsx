import { Stack } from "expo-router";

import { colors } from "@/theme/tokens";

/** Staff stack: tabs + order detail. */
export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ title: "Chi tiết đơn" }} />
    </Stack>
  );
}
