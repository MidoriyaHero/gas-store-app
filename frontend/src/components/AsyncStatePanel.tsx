import { AlertCircle, FileX2, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AsyncViewState } from "@/lib/ui-foundation";

interface AsyncStatePanelProps {
  state: AsyncViewState;
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * Standardized async-state rendering for list/report screens.
 */
export function AsyncStatePanel({ state, title, description, onRetry }: AsyncStatePanelProps) {
  if (state === "success" || state === "idle") return null;

  if (state === "loading") {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{title ?? "Đang tải dữ liệu..."}</span>
        </div>
      </Card>
    );
  }

  if (state === "empty") {
    return (
      <Card className="p-6 text-center">
        <FileX2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="font-medium">{title ?? "Chưa có dữ liệu"}</p>
        <p className="text-sm text-muted-foreground">{description ?? "Dữ liệu sẽ xuất hiện khi có giao dịch mới."}</p>
      </Card>
    );
  }

  if (state === "permission-denied") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <p className="font-medium">{title ?? "Bạn không có quyền truy cập màn này"}</p>
            <p className="text-sm text-muted-foreground">{description ?? "Liên hệ quản trị viên để được cấp quyền phù hợp."}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="space-y-2">
          <p className="font-medium">{title ?? "Có lỗi xảy ra khi tải dữ liệu"}</p>
          <p className="text-sm text-muted-foreground">{description ?? "Vui lòng thử lại sau ít phút."}</p>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Thử lại
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
