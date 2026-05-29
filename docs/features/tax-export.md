# Tax Export

Báo cáo thuế và export CSV/HTML.

## Mục đích

- Tổng hợp VAT theo đơn trong kỳ.
- Export CSV phục vụ kê khai.

## Actor

Admin only.

## Luồng export

```mermaid
flowchart LR
  A[Chọn kỳ / filter] --> B[GET orders/tax-report]
  B --> C[Hiển thị bảng web]
  C --> D[GET tax-export.csv]
  D --> E[Tải file CSV]
```

## API

| Method | Path |
|--------|------|
| GET | `/orders/tax-report` |
| GET | `/tax-export.csv` |

## DB

- `sales_orders` (subtotal, vat_rate, vat_amount, total)

## Web

- `/bao-cao-thue`

## Mobile

Không có màn riêng — dùng web admin.

## Tài liệu chi tiết

→ [thue-va-xuat-du-lieu.md](../thue-va-xuat-du-lieu.md)
