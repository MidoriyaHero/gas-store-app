import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Package, FileBarChart, Store, BookOpen, LogOut, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const adminItems = [
  { title: "Tổng quan", url: "/", icon: LayoutDashboard },
  { title: "Đơn hàng", url: "/don-hang", icon: ShoppingCart },
  { title: "Sổ gas", url: "/so-gas", icon: BookOpen },
  { title: "Kho hàng", url: "/kho", icon: Package },
  { title: "Báo cáo thuế", url: "/bao-cao-thue", icon: FileBarChart },
  { title: "Người dùng", url: "/nguoi-dung", icon: Users },
];

const userItems = [{ title: "Tạo đơn hàng", url: "/tao-don", icon: ShoppingCart }];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const items = user?.role === "admin" ? adminItems : userItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-elegant">
            <Store className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold">Gas Huy Hoàng</p>
              <p className="text-xs text-muted-foreground">Quản lý bán hàng</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Điều hướng</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <NavLink to={item.url} end={item.url === "/"}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => {
            void logout();
          }}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Đăng xuất</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
