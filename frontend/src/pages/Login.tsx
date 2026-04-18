import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, Sparkles, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/** Styled login page for cookie-based JWT authentication. */
export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === "admin" ? "/" : "/tao-don"} replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-soft px-4 py-10 sm:px-6">
        <div className="mx-auto flex w-full max-w-md items-center justify-center">
          <Card className="w-full border-0 shadow-elegant">
            <CardContent className="py-10 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-sm font-medium">Đang kiểm tra phiên đăng nhập...</p>
              <p className="mt-1 text-xs text-muted-foreground">Vui lòng chờ trong giây lát.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success("Đăng nhập thành công");
      navigate("/home", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng nhập thất bại");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-soft px-4 py-10 sm:px-6">
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-0 bg-gradient-primary text-primary-foreground shadow-elegant lg:hidden">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Gas Huy Hoàng</p>
                <p className="text-xs text-primary-foreground/80">Bán hàng và vận hành nhanh trên di động</p>
              </div>
            </div>
            <p className="text-xs text-primary-foreground/80">
              Bảo mật bằng cookie httpOnly, không lưu token ở localStorage.
            </p>
          </CardContent>
        </Card>

        <Card className="hidden border-0 bg-gradient-primary text-primary-foreground shadow-elegant lg:block">
          <CardHeader>
            <CardTitle className="text-3xl">Gas Huy Hoàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed text-primary-foreground/90">
            <div className="flex items-start gap-3 rounded-xl bg-white/10 p-4 backdrop-blur">
              <ShieldCheck className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-medium text-white">Bảo mật bằng cookie httpOnly</p>
                <p>Phiên đăng nhập không lưu localStorage, chống rò token phía client.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-white/10 p-4 backdrop-blur">
              <Sparkles className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-medium text-white">Trải nghiệm theo vai trò</p>
                <p>Admin quản trị toàn bộ, nhân viên chỉ tập trung tạo đơn nhanh trên điện thoại.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-elegant">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Đăng nhập hệ thống</CardTitle>
            <p className="text-sm text-muted-foreground">Vui lòng nhập tài khoản để tiếp tục.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-1.5">
                <Label htmlFor="username">Tài khoản</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  className="h-11"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập username"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-11 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button className="h-11 w-full" type="submit" disabled={submitting}>
                {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">Liên hệ admin nếu quên mật khẩu.</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
