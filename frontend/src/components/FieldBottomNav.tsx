import { Link, useLocation } from "react-router-dom";
import { ClipboardList, LayoutDashboard, Map, NotebookPen, PlusCircle, Users, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ADMIN_HOME_PATH } from "@/lib/appPaths";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ADMIN_TABS: TabItem[] = [
  { label: "Khách", href: "/khach-hang", icon: Users },
  { label: "Tạo đơn", href: "/tao-don", icon: PlusCircle },
  { label: "Đơn", href: "/don-hang", icon: ClipboardList },
  { label: "Bản đồ", href: "/ban-do", icon: Map },
  { label: "Tổng quan", href: ADMIN_HOME_PATH, icon: LayoutDashboard },
];

const STAFF_TABS: TabItem[] = [
  { label: "Khách", href: "/khach-hang", icon: Users },
  { label: "Tạo đơn", href: "/tao-don", icon: PlusCircle },
  { label: "Đơn giao", href: "/don-cua-toi", icon: ClipboardList },
  { label: "Bản đồ", href: "/ban-do", icon: Map },
  { label: "Ghi chú", href: "/ghi-chu-giao", icon: NotebookPen },
];

/**
 * Fixed phone bottom navigation for staff and admin mobile shells.
 */
export function FieldBottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null;
  const tabs = user.role === "admin" ? ADMIN_TABS : STAFF_TABS;

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 inset-x-0 z-40 h-16 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-full max-w-lg grid-cols-5">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="h-full">
              <Link
                to={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[11px] leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
