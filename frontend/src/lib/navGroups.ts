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
  ShieldAlert,
  ShoppingCart,
  SmilePlus,
  Users,
  WalletCards,
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
    id: "operations",
    title: "Điều hành",
    items: [
      { title: "Tổng quan", url: "/", icon: LayoutDashboard },
      { title: "Đơn hàng", url: "/don-hang", icon: ShoppingCart },
      { title: "Điều hành cốt lõi", url: "/dieu-hanh", icon: ClipboardList },
    ],
  },
  {
    id: "finance",
    title: "Tài chính",
    items: [
      { title: "Tài chính - quản trị", url: "/tai-chinh-quan-tri", icon: WalletCards },
      { title: "Báo cáo thuế", url: "/bao-cao-thue", icon: FileBarChart },
    ],
  },
  {
    id: "customer",
    title: "Khách hàng",
    items: [{ title: "Trải nghiệm khách hàng", url: "/trai-nghiem-khach-hang", icon: SmilePlus }],
  },
  {
    id: "safety",
    title: "An toàn",
    items: [
      { title: "Sổ gas", url: "/so-gas", icon: BookOpen },
      { title: "An toàn & tuân thủ", url: "/an-toan-tuan-thu", icon: ShieldAlert },
      { title: "Mẫu thông tin chai", url: "/mau-chai", icon: LayoutTemplate },
    ],
  },
  {
    id: "system",
    title: "Hệ thống",
    items: [
      { title: "Kho hàng", url: "/kho", icon: Package },
      { title: "Người dùng", url: "/nguoi-dung", icon: Users },
    ],
  },
];

/** Domain-grouped navigation for staff primary nav. */
export const staffNavGroups: ReadonlyArray<NavGroup> = [
  {
    id: "operations",
    title: "Điều hành",
    items: [{ title: "Tạo đơn hàng", url: "/tao-don", icon: ShoppingCart }],
  },
  {
    id: "customer",
    title: "Khách hàng",
    items: [
      { title: "Lịch sử đơn", url: "/don-cua-toi", icon: History },
      { title: "Ghi chú giao", url: "/ghi-chu-giao", icon: NotebookText },
    ],
  },
];
