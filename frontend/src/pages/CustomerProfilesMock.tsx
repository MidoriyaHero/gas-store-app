import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MOCK_CUSTOMERS } from "@/lib/ui-mock-contract";
import { formatDateTime, formatVND } from "@/lib/format";

/**
 * Phase-2 mock UI for customer profile and phone-first search.
 */
export default function CustomerProfilesMock() {
  return (
    <AppLayout title="Khách hàng (mock)" description="Hồ sơ khách + tìm nhanh theo số điện thoại">
      <Card className="mb-4 p-4 shadow-card">
        <div className="grid gap-1.5">
          <Label>Tìm theo SĐT</Label>
          <Input className="min-h-11" placeholder="Nhập số điện thoại để tìm nhanh khách hàng" />
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MOCK_CUSTOMERS.map((customer) => (
          <Card key={customer.id} className="p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">{customer.name}</p>
              <Badge variant={customer.debtBalance > 0 ? "destructive" : "secondary"}>
                {customer.debtBalance > 0 ? "Còn nợ" : "Đã trả"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{customer.phone}</p>
            <p className="text-sm text-muted-foreground">Khu vực: {customer.area}</p>
            <p className="mt-2 text-sm">Nhóm khách: {customer.segment}</p>
            <p className="text-sm">Dư nợ: {formatVND(customer.debtBalance)}</p>
            <p className="text-xs text-muted-foreground">Lần mua gần nhất: {formatDateTime(customer.lastOrderAt)}</p>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
