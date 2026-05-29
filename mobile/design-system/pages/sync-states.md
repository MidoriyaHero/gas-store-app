# Page Override: System / Sync & Offline (shared)

Dùng **cùng component instances** trên mọi màn — không vẽ lại ad-hoc.

## SyncBanner variants

| Variant | Màu | Icon | Text mẫu |
|---------|-----|------|----------|
| online | success | cloud-done | "Đã kết nối — dữ liệu đồng bộ" |
| offline | warning | cloud-offline | "Offline — thay đổi được lưu trên máy" |
| syncing | primary | sync | "Đang đồng bộ…" |
| error | error | alert-circle | "Đồng bộ lỗi — Chạm để thử lại" |

- Luôn có **text + icon** (WCAG: không chỉ màu)
- Tap error → modal retry / xem chi tiết lỗi

## Frame: `System / Conflict — Generic`

- Title: "Xung đột dữ liệu"
- Subtitle: entity name (mã đơn)
- Two columns hoặc stacked cards:
  - **Trên server** (timestamp, user)
  - **Trên máy bạn**
- Field-level diff highlight
- Actions: **Giữ bản server** | **Giữ bản của tôi** | **Hủy** (ghost)

## Frame: `System / Outbox — Pending list` (P1)

- List mutation pending: type, entity, thời gian
- Swipe retry / delete (destructive confirm)

## Frame: `System / Pull — Refreshing`

- Skeleton list 3–5 rows
- SyncBanner syncing

## Manual pull sync vs outbox (v5.3)

| Màn | Kéo xuống | Gọi `runSyncCycle` | Ghi chú |
|-----|-----------|-------------------|---------|
| Admin **Tổng quan** | ✓ | ✓ + toast | KPI/chart reload từ SQLite |
| Admin **Đơn hàng** | ✓ | ✓ + toast | Caption + nút Đồng bộ |
| Staff **Đơn giao** / **Điểm giao** | ✓ | ✓ | Đã có từ trước |
| **Outbox** | ✓ | ✓ | Nút "Đồng bộ ngay" |
| SyncBanner lỗi | Chạm | → outbox / retry | Không thay pull refresh |

**Không thêm:** auto-sync sau đăng nhập. Timer 5 phút / foreground giữ nguyên.

Helper code: `mobile/src/lib/sync-refresh.ts` → `manualSyncAndReload(reloadFn)`.

## Empty / Error globals

| Frame | Dùng khi |
|-------|----------|
| `System / Empty — No data` | List rỗng sau filter |
| `System / Error — Network` | API fail có retry |
| `System / Error — Session expired` | → Login |

## Pre-wire trong Figma

Đặt một page `05 — System States` chứa tất cả variant; màn hình khác **instance** SyncBanner từ đây.
