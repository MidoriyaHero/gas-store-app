import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { SAFETY_CHECKLIST_CATALOG } from "@/lib/feature-governance";

interface CapaTicket {
  id: string;
  title: string;
  owner: string;
  status: "open" | "in_progress" | "closed";
}

interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

const CAPA_STORAGE = "gas-store-capa-board";
const AUDIT_STORAGE = "gas-store-audit-log";

/**
 * Safety and compliance center with checklist gate, CAPA board and audit log.
 */
export default function SafetyCompliance() {
  const [checks, setChecks] = useState({
    valve: false,
    seal: false,
    leak: false,
    inspection: false,
  });
  const [inspectionDate, setInspectionDate] = useState("");
  const [capaTitle, setCapaTitle] = useState("");
  const [capaOwner, setCapaOwner] = useState("");
  const [capaItems, setCapaItems] = useState<CapaTicket[]>([]);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [logFilter, setLogFilter] = useState("");

  useEffect(() => {
    try {
      setCapaItems(JSON.parse(localStorage.getItem(CAPA_STORAGE) || "[]"));
    } catch {
      setCapaItems([]);
    }
    try {
      setAuditRows(JSON.parse(localStorage.getItem(AUDIT_STORAGE) || "[]"));
    } catch {
      setAuditRows([]);
    }
  }, []);

  const checklistReady = checks.valve && checks.seal && checks.leak && checks.inspection;
  const inspectionExpired = inspectionDate ? new Date(inspectionDate) < new Date() : true;

  const appendAudit = (action: string, target: string) => {
    const next = [
      {
        id: crypto.randomUUID(),
        actor: "admin",
        action,
        target,
        at: new Date().toISOString(),
      },
      ...auditRows,
    ];
    setAuditRows(next);
    localStorage.setItem(AUDIT_STORAGE, JSON.stringify(next));
  };

  const saveCapa = (items: CapaTicket[]) => {
    setCapaItems(items);
    localStorage.setItem(CAPA_STORAGE, JSON.stringify(items));
  };

  const createCapa = () => {
    if (!capaTitle.trim()) return;
    const next = [
      {
        id: crypto.randomUUID(),
        title: capaTitle.trim(),
        owner: capaOwner.trim() || "An toàn",
        status: "open" as const,
      },
      ...capaItems,
    ];
    saveCapa(next);
    appendAudit("CREATE_CAPA", capaTitle.trim());
    setCapaTitle("");
    setCapaOwner("");
  };

  const cycleCapa = (id: string) => {
    const next = capaItems.map((i) => {
      if (i.id !== id) return i;
      if (i.status === "open") return { ...i, status: "in_progress" as const };
      if (i.status === "in_progress") return { ...i, status: "closed" as const };
      return i;
    });
    saveCapa(next);
    appendAudit("UPDATE_CAPA", id);
  };

  const completeDispatch = () => {
    if (!checklistReady || inspectionExpired) return;
    appendAudit("COMPLETE_DISPATCH", "Checklist đạt và kiểm định hợp lệ");
  };

  const filteredAudit = useMemo(() => {
    const q = logFilter.trim().toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter((r) => `${r.actor} ${r.action} ${r.target}`.toLowerCase().includes(q));
  }, [auditRows, logFilter]);

  return (
    <AppLayout title="An toàn & tuân thủ" description="Checklist bắt buộc, CAPA board và nhật ký audit thao tác nhạy cảm">
      <div className="space-y-4">
        <Card className="p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Checklist an toàn trước giao</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ChecklistItem
              id="check-valve"
              checked={checks.valve}
              label="Van bình hoạt động bình thường"
              onCheckedChange={(v) => setChecks((prev) => ({ ...prev, valve: Boolean(v) }))}
            />
            <ChecklistItem
              id="check-seal"
              checked={checks.seal}
              label="Niêm chì/tem còn nguyên"
              onCheckedChange={(v) => setChecks((prev) => ({ ...prev, seal: Boolean(v) }))}
            />
            <ChecklistItem
              id="check-leak"
              checked={checks.leak}
              label="Không phát hiện rò rỉ"
              onCheckedChange={(v) => setChecks((prev) => ({ ...prev, leak: Boolean(v) }))}
            />
            <ChecklistItem
              id="check-inspection"
              checked={checks.inspection}
              label="Đã kiểm tra hạn kiểm định"
              onCheckedChange={(v) => setChecks((prev) => ({ ...prev, inspection: Boolean(v) }))}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="inspection-date">Hạn kiểm định bình</Label>
              <Input id="inspection-date" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Trạng thái kiểm định</p>
              <div className="mt-2">
                {inspectionExpired ? (
                  <StatusBadge status="overdue" label="Đã quá hạn kiểm định" />
                ) : (
                  <StatusBadge status="ready" label="Hạn kiểm định hợp lệ" />
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {checklistReady ? <StatusBadge status="ready" label="Checklist đã đủ" /> : <StatusBadge status="missing" label="Checklist chưa đủ" />}
            <Button type="button" className="min-h-11" disabled={!checklistReady || inspectionExpired} onClick={completeDispatch}>
              Hoàn tất giao hàng
            </Button>
            {(!checklistReady || inspectionExpired) && (
              <p className="text-xs text-muted-foreground">Phải hoàn thành checklist và còn hạn kiểm định mới được hoàn tất giao hàng.</p>
            )}
          </div>
        </Card>

        <Card className="p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold">Danh mục checklist tuân thủ</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {SAFETY_CHECKLIST_CATALOG.map((row) => (
              <div key={row.code} className="rounded-lg border bg-card p-3">
                <p className="text-sm font-medium">{row.item}</p>
                <p className="text-xs text-muted-foreground">Mức độ: {row.severity}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">CAPA board</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Nội dung sự cố / hành động" value={capaTitle} onChange={(e) => setCapaTitle(e.target.value)} />
              <div className="flex gap-2">
                <Input placeholder="Owner phụ trách" value={capaOwner} onChange={(e) => setCapaOwner(e.target.value)} />
                <Button type="button" onClick={createCapa}>
                  Thêm
                </Button>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {capaItems.length === 0 ? (
                <li className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">Chưa có mục CAPA.</li>
              ) : (
                capaItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Owner: {item.owner}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <Button type="button" variant="outline" size="sm" onClick={() => cycleCapa(item.id)}>
                        Cập nhật
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card className="p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Audit log</h2>
            </div>
            <Input
              placeholder="Lọc theo actor/action/target"
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="mb-3"
            />
            <ul className="space-y-2">
              {filteredAudit.length === 0 ? (
                <li className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">Chưa có bản ghi audit.</li>
              ) : (
                filteredAudit.slice(0, 20).map((row) => (
                  <li key={row.id} className="rounded-lg border bg-card p-3">
                    <p className="text-sm font-medium">{row.action}</p>
                    <p className="text-xs text-muted-foreground">Target: {row.target}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.actor} • {formatDateTime(row.at)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function ChecklistItem({
  id,
  checked,
  label,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm leading-relaxed">
        {label}
      </Label>
    </div>
  );
}
