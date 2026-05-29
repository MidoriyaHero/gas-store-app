import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AdminTabBar } from "@/components/navigation/AdminTabBar";
import { navTheme } from "@/theme/tokens";

/** Admin bottom navigation with center FAB for create order. */
export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={navTheme}
      tabBar={(props) => <AdminTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Tổng quan",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Đơn hàng",
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="audit"
        options={{
          title: "Kiểm kê",
          tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Thêm",
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
