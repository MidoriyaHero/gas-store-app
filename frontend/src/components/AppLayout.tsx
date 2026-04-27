import { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { StaffPrimaryNav } from "./StaffPrimaryNav";
import { useAuth } from "@/lib/auth";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, description, actions, children }: Props) {
  const { user, logout } = useAuth();

  if (user?.role === "user") {
    return (
      <div className="flex min-h-screen w-full flex-col bg-gradient-soft">
        <a
          href="#app-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Bỏ qua điều hướng, tới nội dung chính
        </a>
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b bg-background/80 px-4 py-2 backdrop-blur sm:py-0">
          <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
            <h1 className="truncate text-base font-semibold">{title}</h1>
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label="Đăng xuất"
            onClick={() => {
              void logout();
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <StaffPrimaryNav />
        <main id="app-main-content" className="flex-1 animate-fade-in p-4 md:p-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-soft">
        <a
          href="#app-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Bỏ qua điều hướng, tới nội dung chính
        </a>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">{title}</h1>
              {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </header>
          <main id="app-main-content" className="flex-1 animate-fade-in p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
