import { Stack } from "expo-router";

import { colors } from "@/theme/tokens";

/** Admin stack: tabs + order detail. */
export default function AdminLayout() {
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
      <Stack.Screen name="menu" options={{ title: "Thêm chức năng" }} />
      <Stack.Screen name="module/debt" options={{ title: "Công nợ" }} />
      <Stack.Screen name="module/debt-collection" options={{ title: "Đòi nợ tiền" }} />
      <Stack.Screen name="module/shell-debt" options={{ title: "Nợ vỏ theo đơn" }} />
      <Stack.Screen name="module/collection" options={{ title: "Nợ vỏ theo đơn" }} />
      <Stack.Screen name="module/gas-ledger" options={{ title: "Sổ gas" }} />
      <Stack.Screen name="module/tax" options={{ title: "Báo cáo thuế" }} />
      <Stack.Screen name="module/cylinder-templates" options={{ title: "Mẫu chai" }} />
      <Stack.Screen name="module/inventory" options={{ title: "Kho hàng" }} />
      <Stack.Screen name="module/users" options={{ title: "Người dùng" }} />
      <Stack.Screen name="module/operations" options={{ title: "Vận hành" }} />
      <Stack.Screen name="order/[id]" options={{ title: "Chi tiết đơn" }} />
      <Stack.Screen name="order/create" options={{ title: "Tạo đơn" }} />
    </Stack>
  );
}
