import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";

import { evaluateOfflineGate } from "@/auth/offline-policy";
import { getAccessToken, getSessionProfile } from "@/auth/session";
import { AppText } from "@/components/ui/AppText";
import { networkIsOnline } from "@/lib/network";
import { colors, spacing } from "@/theme/tokens";

/** Warn when offline or session is in restricted (expired token) mode. */
export function OfflineSessionBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    async function refresh() {
      const access = await getAccessToken();
      const profile = await getSessionProfile();
      const state = await NetInfo.fetch();
      const online = networkIsOnline(state);

      if (online) {
        setMessage(null);
        setRestricted(false);
        return;
      }

      const gate = evaluateOfflineGate(access, profile?.lastOnlineAuthAt ?? null);
      if (gate.kind === "restricted") {
        setRestricted(true);
        setMessage("Phiên sắp cần làm mới — kết nối mạng trong 72h để đồng bộ");
        return;
      }

      setRestricted(false);
      setMessage("Đang offline — dữ liệu local, cần mạng để đồng bộ");
    }

    void refresh();
    const unsub = NetInfo.addEventListener(() => {
      void refresh();
    });
    return () => unsub();
  }, []);

  if (!message) {
    return null;
  }

  return (
    <View style={[styles.bar, restricted ? styles.restricted : styles.offline]} accessibilityRole="alert">
      <Ionicons
        name={restricted ? "warning-outline" : "cloud-offline-outline"}
        size={16}
        color={restricted ? colors.error : colors.offlineText}
      />
      <AppText variant="caption" style={{ color: restricted ? colors.error : colors.offlineText, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  offline: { backgroundColor: colors.offlineBg },
  restricted: { backgroundColor: colors.errorSoft },
});
