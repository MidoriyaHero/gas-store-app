import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

interface UserRow {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

const empty = { username: "", password: "", role: "user" as "admin" | "user", is_active: true };

/** Admin page for user CRUD and account status. */
export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const load = async () => {
    try {
      const data = await apiGet<UserRow[]>("/api/users");
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách user");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setForm({ username: user.username, password: "", role: user.role, is_active: user.is_active });
    setOpen(true);
  };

  const save = async () => {
    if (!form.username.trim()) {
      toast.error("Username không được trống");
      return;
    }
    if (!editing && form.password.trim().length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiPatch<UserRow>(`/api/users/${editing.id}`, {
          username: form.username.trim(),
          role: form.role,
          is_active: form.is_active,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        });
        toast.success("Đã cập nhật user");
      } else {
        await apiPost<UserRow>("/api/users", {
          username: form.username.trim(),
          password: form.password.trim(),
          role: form.role,
          is_active: form.is_active,
        });
        toast.success("Đã tạo user mới");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
    setSaving(false);
  };

  const performDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/users/${deleteTarget.id}`);
      toast.success("Đã xóa user");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      throw e;
    }
  };

  return (
    <AppLayout
      title="Người dùng"
      description={`${rows.length} tài khoản`}
      actions={
        <Button onClick={openNew} className="gap-1">
          <Plus className="h-4 w-4" /> Tạo user
        </Button>
      }
    >
      <Card className="shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Chưa có user nào.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.username}</TableCell>
                    <TableCell>
                      <Badge variant={row.role === "admin" ? "default" : "secondary"}>{row.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.is_active ? "outline" : "destructive"}>
                        {row.is_active ? "active" : "inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(row)}
                          aria-label={`Xóa user ${row.username}`}
                        >
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
        title="Xóa user?"
        description={
          deleteTarget
            ? `Tài khoản "${deleteTarget.username}" sẽ bị gỡ vĩnh viễn. Thao tác này không hoàn tác.`
            : ""
        }
        onConfirm={performDeleteUser}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Cập nhật user" : "Tạo user mới"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Username</Label>
              <Input value={form.username} onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>{editing ? "Mật khẩu mới (không bắt buộc)" : "Mật khẩu"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as "admin" | "user" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="user">user</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Trạng thái</Label>
                <Select
                  value={form.is_active ? "active" : "inactive"}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="inactive">inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
