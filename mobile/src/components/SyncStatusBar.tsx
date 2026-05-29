import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { subscribeAutoSync, triggerAutoSync, type AutoSyncSnapshot } from "@/sync/auto-sync";
import { colors, spacing } from "@/theme/tokens";

/** Pending sync banner — auto-sync runs on WiFi/mobile data without user action. */
export function SyncStatusBar() {
  const [snap, setSnap] = useState<AutoSyncSnapshot>({
    online: true,
    syncing: false,
    pending: 0,
    lastSyncAt: null,
    lastError: null,
  });

  useEffect(() => subscribeAutoSync(setSnap), []);

  if (snap.online && snap.pending === 0 && !snap.syncing) {
    return null;
  }

  const offline = !snap.online;

  return (
    <Pressable
      onPress={() => {
        if (snap.pending > 0) {
          router.push("/outbox" as Href);
        } else if (snap.online) {
          void triggerAutoSync("manual-tap");
        }
      }}
      style={[styles.bar, offline ? styles.offline : styles.pending]}
      accessibilityRole="alert"
      accessibilityHint={offline ? "Đang offline" : "Chạm để xem hàng đợi"}
    >
      <Ionicons
        name={offline ? "cloud-offline-outline" : snap.syncing ? "sync-outline" : "cloud-upload-outline"}
        size={18}
        color={offline ? colors.offlineText : colors.warning}
      />
      <View style={styles.textWrap}>
        {offline ? (
          <AppText variant="label" style={{ color: colors.offlineText }}>
            Offline — sẽ tự đồng bộ khi có WiFi/4G
          </AppText>
        ) : snap.syncing ? (
          <AppText variant="label" style={{ color: colors.warning }}>
            Đang tự động đồng bộ…
          </AppText>
        ) : (
          <AppText variant="label" style={{ color: colors.warning }}>
            {snap.pending} thao tác chờ gửi — tự sync khi có mạng · chạm xem
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
  },
  offline: {
    backgroundColor: colors.offlineBg,
    borderBottomColor: "#FDE68A",
  },
  pending: {
    backgroundColor: colors.warningSoft,
    borderBottomColor: "#FDE68A",
  },
  textWrap: { flex: 1 },
});
