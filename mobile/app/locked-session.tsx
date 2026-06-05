import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { resolveSessionRoute, sessionHref } from "@/auth/bootstrap";
import { logoutSession } from "@/auth/logout";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { colors, spacing } from "@/theme/tokens";

/** Shown when offline session exceeded the allowed timebox. */
export default function LockedSessionScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onRetry() {
    setLoading(true);
    setError("");
    try {
      const route = await resolveSessionRoute();
      if (route === "/locked-session") {
        setError("Vẫn chưa kết nối được máy chủ. Kiểm tra WiFi/4G rồi thử lại.");
      } else {
        router.replace(sessionHref(route));
      }
    } catch {
      setError("Không thể làm mới phiên. Thử lại khi có mạng.");
    }
    setLoading(false);
  }

  async function onLogout() {
    await logoutSession();
    router.replace("/login");
  }

  return (
    <Screen scroll padded>
      <Card elevated padding={spacing.lg} style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.warning} />
        </View>
        <AppText variant="h2" style={styles.title}>
          Phiên đã hết hạn
        </AppText>
        <AppText variant="body" color={colors.textMuted} style={styles.body}>
          Bạn đang offline quá lâu hoặc phiên cần xác thực lại. Kết nối WiFi/4G để làm mới phiên — không thể đăng nhập
          mới khi không có mạng.
        </AppText>
        {error ? (
          <AppText variant="caption" color={colors.error} style={styles.error}>
            {error}
          </AppText>
        ) : null}
        <View style={styles.actions}>
          <Button label="Thử lại" loading={loading} fullWidth onPress={() => void onRetry()} />
          <Button label="Đăng xuất" variant="outline" fullWidth onPress={() => void onLogout()} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.xxl },
  iconWrap: { alignItems: "center", marginBottom: spacing.md },
  title: { textAlign: "center", marginBottom: spacing.sm },
  body: { textAlign: "center", marginBottom: spacing.lg },
  error: { textAlign: "center", marginBottom: spacing.md },
  actions: { gap: spacing.sm },
});
