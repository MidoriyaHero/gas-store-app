import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_SEGMENT_LABEL, CUSTOMER_SEGMENT_OPTIONS, isCustomerSegment, type CustomerSegment } from "@/lib/customer-segment";
import {
  CUSTOMER_GROUP_LABEL,
  type CustomerDetailResponse,
  type CustomerListResponse,
  type CustomerResponse,
  type CustomerWritePayload,
} from "@/lib/customer";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatVND } from "@/lib/format";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

interface StaffUserRow {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
}

const emptyForm: CustomerWritePayload = {
  name: "",
  phone: "",
  address: null,
  hamlet: null,
  notes: null,
  customer_segment: null,
  assigned_to_user_id: null,
};

/**
 * Admin directory of real customer profiles (search, CRUD, order history).
 */
export default function Customers() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<CustomerResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [atRisk, setAtRisk] = useState(false);
  const [hasDebt, setHasDebt] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerResponse | null>(null);
  const [form, setForm] = useState<CustomerWritePayload>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffUserRow[]>([]);
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim().slice(0, 100));
      if (atRisk) params.set("at_risk", "true");
      if (hasDebt) params.set("has_debt", "true");
      params.set("limit", "20");
      const data = await apiGet<CustomerListResponse>(`/api/customers?${params.toString()}`);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách khách");
    }
  }, [searchQuery, atRisk, hasDebt]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!isAdmin) return;
    void apiGet<StaffUserRow[]>("/api/users")
      .then((rows) => setStaff((rows ?? []).filter((u) => u.role === "user" && u.is_active)))
      .catch(() => setStaff([]));
  }, [isAdmin]);

  const detailId = searchParams.get("id");

  const selectCustomer = (id: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("id", String(id));
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    const id = Number(detailId);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<CustomerDetailResponse>(`/api/customers/${id}`);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          toast.error(e instanceof Error ? e.message : "Không tải được hồ sơ khách");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: CustomerResponse) => {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone,
      address: row.address,
      hamlet: row.hamlet,
      notes: row.notes,
      customer_segment: isCustomerSegment(row.customer_segment) ? row.customer_segment : null,
      assigned_to_user_id: row.assigned_to_user_id,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Tên khách không được trống");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Số điện thoại là bắt buộc");
      return;
    }
    setSaving(true);
    try {
      const payload: CustomerWritePayload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address?.trim() || null,
        hamlet: form.hamlet?.trim() || null,
        notes: form.notes?.trim() || null,
        customer_segment: form.customer_segment,
        assigned_to_user_id: form.assigned_to_user_id,
      };
      if (editing) {
        await apiPatch<CustomerResponse>(`/api/customers/${editing.id}`, payload);
        toast.success("Đã cập nhật khách");
      } else {
        await apiPost<CustomerResponse>("/api/customers", payload);
        toast.success("Đã tạo khách");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSaving(false);
  };

  const closeDetail = (nextOpen: boolean) => {
    if (nextOpen) return;
    setDetail(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("id");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <AppLayout
      title="Khách hàng"
      description={`${total} hồ sơ`}
      actions={
        isAdmin ? (
          <Button onClick={openNew} className="gap-1">
            <Plus className="h-4 w-4" /> Tạo khách
          </Button>
        ) : undefined
      }
    >
      <Card className="mb-4 space-y-3 p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label>Tìm SĐT / tên</Label>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="0909… hoặc tên khách"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={atRisk} onCheckedChange={(v) => setAtRisk(v === true)} />
            At-risk
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={hasDebt} onCheckedChange={(v) => setHasDebt(v === true)} />
            Còn nợ
          </label>
        </div>
      </Card>

      <Card className="shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khách</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead className="text-right">Dư nợ</TableHead>
                <TableHead>Mua gần nhất</TableHead>
                {isAdmin ? <TableHead className="text-right">Hành động</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-muted-foreground">
                    Chưa có khách.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => selectCustomer(row.id)}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.computed_group === "at_risk" ? "destructive" : "secondary"}>
                        {CUSTOMER_GROUP_LABEL[row.computed_group]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatVND(row.outstanding)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.last_order_at ? formatDateTime(row.last_order_at) : "—"}
                    </TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Sửa ${row.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(row);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isAdmin && open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Cập nhật khách" : "Tạo khách mới"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Tên</Label>
              <Input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Số điện thoại</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
                inputMode="tel"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Thôn / xóm</Label>
              <Input value={form.hamlet ?? ""} onChange={(e) => setForm((v) => ({ ...v, hamlet: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Địa chỉ</Label>
              <Textarea
                value={form.address ?? ""}
                onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tệp khách hàng</Label>
              <Select
                value={form.customer_segment ?? "__none__"}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    customer_segment: v === "__none__" ? null : (v as CustomerSegment),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chưa chọn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Chưa chọn</SelectItem>
                  {CUSTOMER_SEGMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Ghi chú</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Nhân viên phụ trách</Label>
              <Select
                value={form.assigned_to_user_id != null ? String(form.assigned_to_user_id) : "__none__"}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    assigned_to_user_id: v === "__none__" ? null : Number(v),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Không gán" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không gán</SelectItem>
                  {staff.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={detail !== null} onOpenChange={closeDetail}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.customer.name}</SheetTitle>
                <SheetDescription>{detail.customer.phone}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <p>
                  Tệp:{" "}
                  {isCustomerSegment(detail.customer.customer_segment)
                    ? CUSTOMER_SEGMENT_LABEL[detail.customer.customer_segment]
                    : "Chưa phân loại"}
                </p>
                <p>Sản phẩm hay mua: {detail.customer.typical_product_name ?? "—"}</p>
                <p>Dư nợ: {formatVND(detail.customer.outstanding)}</p>
                <Button asChild className="w-full">
                  <Link to={`/tao-don?customer_id=${detail.customer.id}`}>Tạo đơn</Link>
                </Button>
                <div>
                  <p className="mb-2 font-medium">20 đơn gần nhất</p>
                  {detail.recent_orders.length === 0 ? (
                    <p className="text-muted-foreground">Chưa có đơn.</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.recent_orders.map((o) => (
                        <li key={o.id}>
                          <Link to="/don-hang" className="text-primary underline-offset-2 hover:underline">
                            {o.order_code}
                          </Link>
                          <span className="text-muted-foreground">
                            {" "}
                            · {formatVND(o.total)} · {formatDateTime(o.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
