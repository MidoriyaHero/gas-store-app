import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ClipboardList,
  FileBarChart,
  History,
  LayoutDashboard,
  LayoutTemplate,
  NotebookText,
  Package,
  ShoppingCart,
  SmilePlus,
  Users,
  WalletCards,
  Map,
  UserSearch,
} from "lucide-react";

/**
 * One navigation destination.
 */
export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

/**
 * Group of related navigation items under one domain label.
 */
export interface NavGroup {
  id: string;
  title: string;
  items: ReadonlyArray<NavItem>;
}

/** Domain-grouped navigation for admin sidebar. */
export const adminNavGroups: ReadonlyArray<NavGroup> = [
  {
    id: "overview",
    title: "Tổng quan & đơn hàng",
    items: [
      { title: "Tổng quan", url: "/", icon: LayoutDashboard },
      { title: "Đơn hàng", url: "/don-hang", icon: ShoppingCart },
      { title: "Vận hành hằng ngày", url: "/dieu-hanh", icon: ClipboardList },
    ],
  },
  {
    id: "debt_finance",
    title: "Nợ & tài chính",
    items: [
      { title: "Công nợ", url: "/tai-chinh-quan-tri", icon: WalletCards },
      { title: "Báo cáo thuế", url: "/bao-cao-thue", icon: FileBarChart },
    ],
  },
  {
    id: "warehouse_safety",
    title: "Kho hàng",
    items: [
      { title: "Sổ gas", url: "/so-gas", icon: BookOpen },
      { title: "Kho hàng", url: "/kho", icon: Package },
      { title: "Mẫu thông tin chai", url: "/mau-chai", icon: LayoutTemplate },
    ],
  },
  {
    id: "system",
    title: "Hệ thống",
    items: [
      { title: "Người dùng", url: "/nguoi-dung", icon: Users },
    ],
  },
  {
    id: "customer",
    title: "Khách hàng",
    items: [
      { title: "Chăm sóc khách hàng", url: "/trai-nghiem-khach-hang", icon: SmilePlus },
      { title: "Hồ sơ khách (mock)", url: "/khach-hang-mock", icon: UserSearch },
    ],
  },
];

/** Domain-grouped navigation for staff primary nav. */
export const staffNavGroups: ReadonlyArray<NavGroup> = [
  {
    id: "customer",
    title: "Khách hàng",
    items: [
      { title: "Đơn giao hàng", url: "/don-cua-toi", icon: History },
      { title: "Ghi chú giao", url: "/ghi-chu-giao", icon: NotebookText },
    ],
  },
  {
    id: "field",
    title: "Giao hàng",
    items: [{ title: "Bản đồ giao", url: "/ban-do", icon: Map }],
  },
];
