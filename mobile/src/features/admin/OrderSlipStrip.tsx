import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { isCustomerSegment } from "@/lib/customer-segment";
import type { CreateCartLine, CreateOrderForm } from "@/lib/order-create";
import { formatVnd } from "@/utils/format";

const SLIP = "#FFFDF8";
const RULE = "#E6DCC8";
const FLAME = "#E3940F";

/** First sổ-gas gap for the live phiếu strip, or empty when the slip is complete. */
export function firstComposerGap(form: CreateOrderForm, cart: CreateCartLine[]): string | null {
  if (!form.customerName.trim()) return "tên";
  if (!form.phone.trim()) return "SĐT";
  if (!isCustomerSegment(form.customerSegment)) return "tệp khách";
  if (!form.address.trim()) return "địa chỉ";
  if (!form.deliveryDate.trim()) return "ngày giao";
  if (cart.length === 0) return "hàng";
  if (cart.some((l) => !l.owner_name.trim())) return "chủ sở hữu chai";
  return null;
}

type OrderSlipStripProps = {
  form: CreateOrderForm;
  cart: CreateCartLine[];
  total: number;
};

/** Compact phiếu: name, first missing sổ-gas field, running total. */
export function OrderSlipStrip({ form, cart, total }: OrderSlipStripProps) {
  const gap = firstComposerGap(form, cart);
  const name = form.customerName.trim();
  return (
    <View style={styles.strip}>
      <View style={styles.copy}>
        <AppText variant="bodyMedium" style={!name ? styles.empty : undefined}>
          {name || "Chưa ghi tên"}
        </AppText>
        <AppText variant="caption" style={gap ? styles.empty : styles.ready}>
          {gap ? `Thiếu ${gap}` : "Đủ để vào sổ"}
        </AppText>
      </View>
      <AppText variant="h3">{formatVnd(total)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: SLIP,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  copy: { flex: 1, minWidth: 0 },
  empty: { color: FLAME, fontWeight: "600" },
  ready: { color: "#2C8A58" },
});
