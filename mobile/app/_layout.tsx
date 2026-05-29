import { Stack, router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { SyncStatusBar } from "@/components/SyncStatusBar";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { setSessionExpiredHandler } from "@/auth/session-events";
import { migrateLocalDb } from "@/db/client";
import { startAutoSync } from "@/sync/auto-sync";
import { colors } from "@/theme/tokens";

/** Root layout: fonts, DB bootstrap, sync banner. */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    migrateLocalDb();
    const stopAutoSync = startAutoSync();
    setSessionExpiredHandler(() => {
      router.replace("/login");
    });
    return () => {
      stopAutoSync();
      setSessionExpiredHandler(null);
    };
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ToastProvider>
      <SyncStatusBar />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="(staff)" options={{ headerShown: false }} />
        <Stack.Screen name="outbox" options={{ title: "Chờ đồng bộ" }} />
      </Stack>
    </ToastProvider>
  );
}
