import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiFetch, mobileLogin } from "@/api/client";
import { resolveSessionRoute, sessionHref } from "@/auth/bootstrap";
import { saveSessionProfile, type SessionRole } from "@/auth/session";
import { clearLocalDb } from "@/lib/clear-local-db";
import { isOnline } from "@/lib/network";
import { triggerAutoSync } from "@/sync/auto-sync";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/theme/tokens";

/** Branded login — routes admin vs staff after auth. */
export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void isOnline().then((online) => setOffline(!online));
    void resolveSessionRoute()
      .then((route) => {
        if (route !== "/login") {
          router.replace(sessionHref(route));
        }
      })
      .catch(() => {
        /* stay on login */
      })
      .finally(() => setBooting(false));
  }, []);

  async function onLogin() {
    setError("");
    if (!username.trim() || !password) {
      setError("Vui lòng nhập tài khoản và mật khẩu");
      return;
    }
    const online = await isOnline();
    if (!online) {
      setError("Không có mạng. Đăng nhập lần đầu hoặc làm mới phiên cần kết nối API.");
      return;
    }
    setLoading(true);
    try {
      await mobileLogin(username.trim(), password);
      await clearLocalDb();
      void triggerAutoSync("login");
      const me = await apiFetch<{ user: { role: string; username: string } }>("/api/auth/me");
      const role: SessionRole = me.user.role === "admin" ? "admin" : "user";
      const now = new Date().toISOString();
      await saveSessionProfile({ role, username: me.user.username, lastOnlineAuthAt: now });
      if (me.user.role === "admin") {
        router.replace("/(admin)/(tabs)" as Href);
      } else {
        router.replace("/(staff)/(tabs)" as Href);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg.includes("Network request failed") || msg.includes("Failed to fetch")
          ? "Không kết nối được API. Kiểm tra mạng và địa chỉ server."
          : msg || "Đăng nhập thất bại. Kiểm tra mạng và tài khoản.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return null;
  }

  return (
    <Screen scroll padded={false}>
      <LinearGradient colors={["#1D4ED8", "#2563EB", "#3B82F6"]} style={styles.hero}>
        <View style={styles.logoCircle}>
          <Ionicons name="flame" size={36} color={colors.accent} />
        </View>
        <AppText variant="h1" style={styles.heroTitle}>
          Gas Huy Hoàng
        </AppText>
        <AppText variant="body" style={styles.heroSub}>
          Quản lý giao gas — offline-first
        </AppText>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.formWrap}
      >
        <Card elevated padding={spacing.lg} style={styles.formCard}>
          <AppText variant="h2" style={{ marginBottom: spacing.lg }}>
            Đăng nhập
          </AppText>

          {offline ? (
            <View style={styles.offlineBox} accessibilityRole="alert">
              <Ionicons name="cloud-offline-outline" size={18} color={colors.offlineText} />
              <AppText variant="caption" style={{ flex: 1, color: colors.offlineText }}>
                Không có mạng. Nếu đã đăng nhập trước đó, mở lại app khi có sóng. Đăng nhập mới cần kết nối API.
              </AppText>
            </View>
          ) : null}

          <View style={styles.fields}>
            <TextField
              label="Tài khoản"
              value={username}
              onChangeText={setUsername}
              placeholder="admin hoặc staff"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Mật khẩu"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              passwordToggle
            />
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>
                {error}
              </AppText>
            </View>
          ) : null}

          <Button
            label="Đăng nhập"
            loading={loading}
            fullWidth
            disabled={offline}
            onPress={() => void onLogin()}
          />
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: spacing.xxl + 16,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  heroTitle: { color: "#FFFFFF", textAlign: "center" },
  heroSub: { color: "rgba(255,255,255,0.85)", textAlign: "center", marginTop: spacing.xs },
  formWrap: {
    flex: 1,
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  formCard: { marginTop: 0 },
  fields: { gap: spacing.md, marginBottom: spacing.lg },
  offlineBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.offlineBg,
    padding: spacing.sm + 4,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    padding: spacing.sm + 4,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
});
