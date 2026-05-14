import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Phone, MapPin, ScrollText } from "lucide-react";

interface DebtAccountRow {
  id: number;
  customer_name: string;
  phone: string;
  current_balance: number | string;
  status: string;
  updated_at: string;
}

interface LedgerRow {
  id: number;
  entry_type: string;
  amount_signed: number | string;
  note: string | null;
  created_at: string;
  returned_shell_units?: number;
}

interface DebtDetailPayload {
  account: DebtAccountRow;
  ledger: LedgerRow[];
}

/** Google Maps search from customer name + phone when there is no saved coordinate. */
function googleSearchCustomerUrl(name: string, phone: string): string {
  const q = `${name} ${phone}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Admin debt collection queue: live balances from ``/api/debt-accounts``.
 */
export default function DebtCollection() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<DebtAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DebtDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = debounced ? `&search=${encodeURIComponent(debounced)}` : "";
      const data = await apiGet<DebtAccountRow[]>(`/api/debt-accounts?status=all&limit=200${q}`);
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được công nợ");
    }
    setLoading(false);
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const d = await apiGet<DebtDetailPayload>(`/api/debt-accounts/${detailId}?ledger_limit=80`);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Không mở được chi tiết");
      }
      if (!cancelled) setDetailLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const sorted = [...rows].sort((a, b) => Number(b.current_balance) - Number(a.current_balance));

  return (
    <AppLayout
      title="Danh sách thu nợ"
      description={loading ? "Đang tải…" : `${sorted.length} tài khoản công nợ`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/tai-chinh-quan-tri">Mở tài chính &amp; thu tiền</Link>
        </Button>
      }
    >
      <Card className="p-4 shadow-card space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md flex-1 space-y-1">
            <label htmlFor="debt-search" className="text-xs font-medium text-muted-foreground">
              Tìm theo tên hoặc SĐT
            </label>
            <Input id="debt-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ví dụ: 0909…" />
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            Làm mới
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Dư nợ</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.customer_name}</TableCell>
                <TableCell>
                  {r.phone ? (
                    <a className="text-primary underline-offset-2 hover:underline" href={`tel:${r.phone}`}>
                      {r.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "secondary" : "outline"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-semibold">{formatVND(r.current_balance)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    {r.phone ? (
                      <Button variant="outline" size="sm" className="min-h-10" asChild>
                        <a href={`tel:${r.phone}`}>
                          <Phone className="h-4 w-4" aria-hidden />
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="min-h-10" type="button" disabled>
                        <Phone className="h-4 w-4 opacity-40" aria-hidden />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="min-h-10" asChild>
                      <a href={googleSearchCustomerUrl(r.customer_name, r.phone)} target="_blank" rel="noreferrer">
                        <MapPin className="h-4 w-4" aria-hidden />
                      </a>
                    </Button>
                    <Button variant="secondary" size="sm" className="min-h-10" type="button" onClick={() => setDetailId(r.id)}>
                      <ScrollText className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Chi tiết công nợ</SheetTitle>
          </SheetHeader>
          {detailLoading && <p className="mt-4 text-sm text-muted-foreground">Đang tải…</p>}
          {!detailLoading && detail && (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Khách:</span> {detail.account.customer_name}
              </p>
              <p>
                <span className="text-muted-foreground">SĐT:</span> {detail.account.phone}
              </p>
              <p>
                <span className="text-muted-foreground">Dư nợ:</span> {formatVND(detail.account.current_balance)}
              </p>
              <h3 className="font-semibold">Sổ phụ (mới nhất)</h3>
              <ul className="space-y-2 border-t pt-2">
                {detail.ledger.map((e) => (
                  <li key={e.id} className="rounded-md border p-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{e.entry_type}</span>
                      <span>{formatVND(e.amount_signed)}</span>
                    </div>
                    <div className="text-muted-foreground">{formatDateTime(e.created_at)}</div>
                    {e.note && <div className="mt-1">{e.note}</div>}
                    {e.entry_type === "payment" && Number(e.returned_shell_units ?? 0) > 0 && (
                      <div className="mt-1 text-muted-foreground">Vỏ trả: {e.returned_shell_units}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
