import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

interface TemplateRow {
  id: number;
  name: string;
  owner_name: string | null;
  import_source: string | null;
  inspection_expiry: string | null;
  import_date: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  name: "",
  owner_name: "",
  import_source: "",
  inspection_expiry: "",
  import_date: "",
  is_active: true,
};

/** Admin CRUD for shared cylinder field presets used when creating orders. */
export default function CylinderTemplatesPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);

  const load = async () => {
    try {
      const data = await apiGet<TemplateRow[]>("/api/cylinder-templates?include_inactive=true");
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được mẫu chai");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: TemplateRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      owner_name: row.owner_name ?? "",
      import_source: row.import_source ?? "",
      inspection_expiry: row.inspection_expiry ?? "",
      import_date: row.import_date ?? "",
      is_active: row.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Tên mẫu không được trống");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        owner_name: form.owner_name.trim() || null,
        import_source: form.import_source.trim() || null,
        inspection_expiry: form.inspection_expiry || null,
        import_date: form.import_date || null,
        is_active: form.is_active,
      };
      if (editing) {
        await apiPatch<TemplateRow>(`/api/cylinder-templates/${editing.id}`, body);
        toast.success("Đã cập nhật mẫu");
      } else {
        await apiPost<TemplateRow>("/api/cylinder-templates", body);
        toast.success("Đã tạo mẫu");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSaving(false);
  };

  const performDeleteTemplate = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/cylinder-templates/${deleteTarget.id}`);
      toast.success("Đã xóa mẫu");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      throw e;
    }
  };

  return (
    <AppLayout
      title="Mẫu thông tin chai"
      description="Nhân viên chọn mẫu khi tạo đơn; số seri nhập trên từng dòng hàng."
      actions={
        <Button onClick={openNew} className="gap-1">
          <Plus className="h-4 w-4" /> Thêm mẫu
        </Button>
      }
    >
      <Card className="shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên mẫu</TableHead>
                <TableHead>Chủ sở hữu</TableHead>
                <TableHead>Nơi nhập</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Chưa có mẫu. Tạo ít nhất một mẫu để nhân viên chọn khi bán.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.owner_name ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {row.import_source ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.is_active ? "outline" : "secondary"}>
                        {row.is_active ? "Đang dùng" : "Tắt"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Sửa mẫu">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row)} aria-label="Xóa mẫu">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DestructiveConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title="Xóa mẫu chai?"
        description={
          deleteTarget
            ? `Mẫu "${deleteTarget.name}" sẽ bị xóa vĩnh viễn. Thao tác này không hoàn tác.`
            : ""
        }
        onConfirm={performDeleteTemplate}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa mẫu chai" : "Mẫu chai mới"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Tên mẫu *</Label>
              <Input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="VD: Kho chính" />
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Chủ sở hữu</Label>
                <Input
                  value={form.owner_name}
                  onChange={(e) => setForm((v) => ({ ...v, owner_name: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Nơi nhập chai</Label>
                <Input
                  value={form.import_source}
                  onChange={(e) => setForm((v) => ({ ...v, import_source: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Hạn kiểm định</Label>
                <Input
                  type="date"
                  value={form.inspection_expiry}
                  onChange={(e) => setForm((v) => ({ ...v, inspection_expiry: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Ngày nhập</Label>
                <Input type="date" value={form.import_date} onChange={(e) => setForm((v) => ({ ...v, import_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Đang hoạt động</p>
                <p className="text-xs text-muted-foreground">Tắt để ẩn khỏi danh sách nhân viên</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
