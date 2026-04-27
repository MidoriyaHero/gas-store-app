import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, MessageSquare, Send, Star } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AsyncStatePanel } from "@/components/AsyncStatePanel";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { apiGet } from "@/lib/api";
import type { AsyncViewState } from "@/lib/ui-foundation";
import { CUSTOMER_JOURNEY_STEPS } from "@/lib/feature-governance";

interface OrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  created_at: string;
}

interface OrdersEnvelope {
  items: OrderRow[];
  total: number;
}

interface ComplaintTicket {
  id: string;
  customer: string;
  issue: string;
  owner: string;
  dueAt: string;
  status: "open" | "in_progress" | "closed";
}

const STORAGE_KEY = "gas-store-cx-complaints";

/**
 * Customer experience center: reminders, templates, timeline and complaints SLA board.
 */
export default function CustomerExperience() {
  const [state, setState] = useState<AsyncViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [template, setTemplate] = useState(
    "Chào {{customer_name}}, cửa hàng xin nhắc lịch đổi gas định kỳ. Anh/chị phản hồi để chốt khung giờ giao nhé."
  );
  const [tickets, setTickets] = useState<ComplaintTicket[]>([]);
  const [draft, setDraft] = useState({ customer: "", issue: "", owner: "" });

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const payload = await apiGet<OrdersEnvelope>("/api/orders?limit=50&offset=0");
      setOrders(payload.items ?? []);
      setState((payload.items ?? []).length > 0 ? "success" : "empty");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu khách hàng");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ComplaintTicket[];
      setTickets(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTickets([]);
    }
  }, []);

  const persistTickets = (next: ComplaintTicket[]) => {
    setTickets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const latestTimeline = useMemo(() => orders.slice(0, 6), [orders]);

  const createTicket = () => {
    if (!draft.customer.trim() || !draft.issue.trim()) return;
    const due = new Date();
    due.setHours(due.getHours() + 24);
    const next: ComplaintTicket[] = [
      {
        id: crypto.randomUUID(),
        customer: draft.customer.trim(),
        issue: draft.issue.trim(),
        owner: draft.owner.trim() || "CSKH",
        dueAt: due.toISOString(),
        status: "open",
      },
      ...tickets,
    ];
    persistTickets(next);
    setDraft({ customer: "", issue: "", owner: "" });
  };

  const cycleTicket = (id: string) => {
    const next = tickets.map((t) => {
      if (t.id !== id) return t;
      if (t.status === "open") return { ...t, status: "in_progress" as const };
      if (t.status === "in_progress") return { ...t, status: "closed" as const };
      return t;
    });
    persistTickets(next);
  };

  return (
    <AppLayout
      title="Trải nghiệm khách hàng"
      description="Nhắc định kỳ, template nhắn tin, timeline giao hàng và SLA khiếu nại"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Làm mới
        </Button>
      }
    >
      <AsyncStatePanel state={state} title={state === "error" ? "Không tải được trung tâm trải nghiệm khách hàng" : undefined} description={error ?? undefined} onRetry={() => void load()} />

      {state === "success" && (
        <div className="space-y-4">
          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Template nhắc định kỳ Zalo/SMS</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="cx-template">Mẫu tin nhắn</Label>
                <Textarea
                  id="cx-template"
                  rows={4}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  aria-describedby="cx-template-help"
                />
                <p id="cx-template-help" className="text-xs text-muted-foreground">
                  Hỗ trợ biến: {"{{customer_name}}"}.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Preview</p>
                <p className="mt-2 text-sm leading-relaxed">{template.replaceAll("{{customer_name}}", "Khách hàng")}</p>
                <Button type="button" size="sm" className="mt-3 min-h-11">
                  <Send className="mr-1 h-4 w-4" /> Gửi nhắc thử
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 shadow-card">
              <h2 className="mb-3 text-sm font-semibold">Timeline đơn gần nhất</h2>
              <ul className="space-y-2">
                {latestTimeline.map((o) => (
                  <li key={o.id} className="rounded-lg border bg-card p-3">
                    <p className="text-sm font-medium">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{o.order_code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-4 shadow-card">
              <h2 className="mb-3 text-sm font-semibold">Loyalty snapshot</h2>
              <div className="grid gap-3">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Khách thân thiết tháng này</p>
                  <p className="mt-1 text-xl font-semibold">32</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Điểm CSAT sau giao</p>
                  <p className="mt-1 flex items-center gap-1 text-xl font-semibold">
                    4.7 <Star className="h-4 w-4 text-warning" aria-hidden />
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Scope hành trình khách hàng</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CUSTOMER_JOURNEY_STEPS.map((step) => (
                <div key={step.key} className="rounded-lg border bg-card p-3">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.sla}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Ticket khiếu nại & SLA</h2>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                placeholder="Tên khách hàng"
                value={draft.customer}
                onChange={(e) => setDraft((prev) => ({ ...prev, customer: e.target.value }))}
              />
              <Input
                placeholder="Nội dung khiếu nại"
                value={draft.issue}
                onChange={(e) => setDraft((prev) => ({ ...prev, issue: e.target.value }))}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Owner phụ trách"
                  value={draft.owner}
                  onChange={(e) => setDraft((prev) => ({ ...prev, owner: e.target.value }))}
                />
                <Button type="button" onClick={createTicket} className="min-h-11">
                  Thêm
                </Button>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {tickets.length === 0 ? (
                <li className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">Chưa có ticket khiếu nại.</li>
              ) : (
                tickets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.customer}</p>
                      <p className="text-xs text-muted-foreground">{t.issue}</p>
                      <p className="text-xs text-muted-foreground">
                        Owner: {t.owner} • Hạn: {formatDateTime(t.dueAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      <Button type="button" variant="outline" size="sm" onClick={() => cycleTicket(t.id)}>
                        Cập nhật
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
