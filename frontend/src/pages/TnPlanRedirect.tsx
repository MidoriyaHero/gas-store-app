import { useEffect } from "react";

/** Public route: hard-navigate to standalone TN workout plan HTML (no auth). */
export default function TnPlanRedirect() {
  useEffect(() => {
    window.location.replace("/tn-plan/");
  }, []);
  return <p className="p-6 text-sm text-muted-foreground">Đang mở lịch tập…</p>;
}
