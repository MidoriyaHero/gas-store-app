import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { staffNavGroups } from "@/lib/staffNav";

/**
 * Large primary navigation for staff on all viewports (replaces sidebar).
 * Uses icon + label and clear active styling for touch and keyboard users.
 */
export function StaffPrimaryNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Điều hướng chính" className="border-b bg-background/80 px-4 py-3">
      <div className="mx-auto max-w-4xl space-y-3">
        {staffNavGroups.map((group) => (
          <section key={group.id} aria-label={group.title} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
                return (
                  <Button
                    key={item.url}
                    asChild
                    variant={isActive ? "default" : "outline"}
                    size="lg"
                    className="h-auto min-h-12 w-full py-3"
                  >
                    <NavLink to={item.url} className="flex w-full items-center justify-center gap-2">
                      <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="text-sm font-medium leading-tight">{item.title}</span>
                    </NavLink>
                  </Button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}
