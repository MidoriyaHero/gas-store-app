# Customer experience (chăm sóc khách)

Trang `/trai-nghiem-khach-hang`: nhắc định kỳ, template tin nhắn, timeline đơn gần đây, bảng khiếu nại SLA.

## Mục đích

- Nhìn đơn gần nhất để soạn nhắc lịch.
- Theo dõi khiếu nại trên UI admin.

## Actor

Admin.

## Nguồn dữ liệu (quan trọng)

| Phần UI | Nguồn |
|---------|--------|
| Timeline / danh sách khách từ đơn | `GET /orders?limit=50` (API) |
| Template nhắc tin nhắn | State local trên trang (không persist server) |
| Bảng khiếu nại SLA | **localStorage** key `gas-store-cx-complaints` — không gọi `/complaint-tickets` |

API governance `GET/POST/PATCH /complaint-tickets` tồn tại trên backend (dashboard/governance) nhưng **trang CX hiện không dùng**. Đừng giả định ticket trên trình duyệt này đồng bộ giữa máy hoặc với mobile.

## Web

- `/trai-nghiem-khach-hang` — [CustomerExperience.tsx](../../frontend/src/pages/CustomerExperience.tsx)

## Mobile

Không có màn CX tương đương.

## Mock liên quan

- `/khach-hang-mock` — hồ sơ khách mock, **không production**. Nav ghi rõ “(mock)”.
