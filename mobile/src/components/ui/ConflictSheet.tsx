import { Modal, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { colors, spacing } from "@/theme/tokens";
import type { OutboxRow } from "@/sync/outbox";
import { outboxRowLabel } from "@/sync/outbox";

type ConflictSheetProps = {
  visible: boolean;
  row: OutboxRow | null;
  onKeepServer: () => void;
  onRetryLocal: () => void;
  onCancel: () => void;
};

/** Resolve sync conflict or failed mutation. */
export function ConflictSheet({ visible, row, onKeepServer, onRetryLocal, onCancel }: ConflictSheetProps) {
  if (!row) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <AppText variant="h3">Xung đột / lỗi đồng bộ</AppText>
          <AppText variant="bodyMedium" style={{ marginTop: spacing.xs }}>
            {outboxRowLabel(row)}
          </AppText>
          {row.lastError ? (
            <AppText variant="caption" muted style={styles.err}>
              {row.lastError}
            </AppText>
          ) : null}
          <AppText variant="caption" muted style={{ marginVertical: spacing.sm }}>
            Chọn bản dữ liệu giữ lại trên máy
          </AppText>
          <Button label="Giữ bản server (bỏ thay đổi local)" variant="primary" fullWidth onPress={onKeepServer} />
          <Button label="Thử gửi lại bản của tôi" variant="secondary" fullWidth onPress={onRetryLocal} style={{ marginTop: spacing.sm }} />
          <Button label="Hủy" variant="ghost" fullWidth onPress={onCancel} style={{ marginTop: spacing.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.md, paddingBottom: spacing.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  err: { color: colors.error, marginTop: spacing.xs },
});
