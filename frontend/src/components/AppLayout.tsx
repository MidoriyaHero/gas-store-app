import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, description, actions, children }: Props) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-soft">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 h-14 flex items-center gap-3 border-b bg-background/80 backdrop-blur px-4">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold truncate">{title}</h1>
              {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </header>
          <main className="flex-1 p-4 md:p-6 animate-fade-in">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
