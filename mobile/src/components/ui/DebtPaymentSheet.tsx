import { Modal, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/theme/tokens";

type DebtPaymentSheetProps = {
  visible: boolean;
  customerName: string;
  maxBalance: string;
  amount: string;
  returnedShells: string;
  note: string;
  loading?: boolean;
  onChangeAmount: (v: string) => void;
  onChangeReturnedShells: (v: string) => void;
  onChangeNote: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Bottom sheet to record a debt payment (admin, online). */
export function DebtPaymentSheet({
  visible,
  customerName,
  maxBalance,
  amount,
  returnedShells,
  note,
  loading,
  onChangeAmount,
  onChangeReturnedShells,
  onChangeNote,
  onConfirm,
  onCancel,
}: DebtPaymentSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <AppText variant="h3">Thu nợ</AppText>
          <AppText variant="caption" muted style={styles.sub}>
            {customerName} · Dư nợ: {Number(maxBalance).toLocaleString("vi-VN")} đ
          </AppText>
          <TextField label="Số tiền thu" value={amount} onChangeText={onChangeAmount} keyboardType="decimal-pad" />
          <TextField
            label="Vỏ khách trả"
            value={returnedShells}
            onChangeText={onChangeReturnedShells}
            keyboardType="number-pad"
          />
          <TextField label="Ghi chú" value={note} onChangeText={onChangeNote} />
          <Button label="Xác nhận thu nợ" variant="accent" loading={loading} fullWidth onPress={onConfirm} />
          <Button label="Hủy" variant="ghost" fullWidth onPress={onCancel} style={{ marginTop: spacing.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.xs,
  },
  sub: { marginBottom: spacing.xs },
});
