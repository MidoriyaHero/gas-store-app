import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { colors, spacing } from "@/theme/tokens";

const MODULES: Array<{ href: Href; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { href: "/(admin)/module/operations" as Href, title: "Vận hành", desc: "Đơn đang giao / hoàn thành", icon: "clipboard-outline" },
  { href: "/(admin)/module/debt" as Href, title: "Công nợ", desc: "Thu nợ & sổ công nợ", icon: "wallet-outline" },
  { href: "/(admin)/module/debt-collection" as Href, title: "Đòi nợ tiền", desc: "Danh sách thu nợ (live API)", icon: "hand-left-outline" },
  { href: "/(admin)/module/shell-debt" as Href, title: "Nợ vỏ theo đơn", desc: "Đơn có vỏ mượn", icon: "cube-outline" },
  { href: "/(admin)/module/gas-ledger" as Href, title: "Sổ gas", desc: "Sổ kiểm kê gas", icon: "book-outline" },
  { href: "/(admin)/module/tax" as Href, title: "Báo cáo thuế", desc: "VAT theo kỳ", icon: "document-text-outline" },
  { href: "/(admin)/module/inventory" as Href, title: "Kho hàng", desc: "Sản phẩm & nhập kho", icon: "layers-outline" },
  { href: "/(admin)/module/cylinder-templates" as Href, title: "Mẫu chai", desc: "Preset thông tin bình", icon: "flask-outline" },
  { href: "/(admin)/module/users" as Href, title: "Người dùng", desc: "Tài khoản hệ thống", icon: "people-outline" },
  { href: "/outbox" as Href, title: "Chờ đồng bộ", desc: "Outbox & xung đột", icon: "cloud-upload-outline" },
];

/** Admin overflow menu — P2 modules (tab Thêm + stack menu). */
export function AdminMenuPanel() {
  return (
    <>
      <AppText variant="h2" style={{ marginBottom: spacing.md }}>
        Thêm chức năng
      </AppText>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {MODULES.map((m) => (
          <Pressable key={m.title} onPress={() => router.push(m.href)}>
            <Card style={styles.row}>
              <Ionicons name={m.icon} size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">{m.title}</AppText>
                <AppText variant="caption" muted>{m.desc}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
