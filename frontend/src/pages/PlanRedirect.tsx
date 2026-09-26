import { useEffect } from "react";

/** Public route: hard-navigate to standalone plan HTML (no auth). */
export default function PlanRedirect() {
  useEffect(() => {
    window.location.replace("/plan/");
  }, []);
  return <p className="p-6 text-sm text-muted-foreground">Đang mở kế hoạch tập…</p>;
}
