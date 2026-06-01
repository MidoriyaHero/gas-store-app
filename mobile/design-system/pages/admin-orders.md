# Page Override: Admin / Orders

## Frame: `Admin / TabBar — FAB`

- Layout **2 | FAB | 2** (đối xứng):
  - Trái: **Tổng quan**, **Đơn hàng**
  - Giữa: FAB **+** (Tạo đơn — stack, không phải tab)
  - Phải: **Kiểm kê**, **Thêm** → màn `menu` (công nợ, kho, users, outbox…)
- FAB không đổi tab state

### Brainstorm tab phải (đã chọn **Thêm**)

| Ứng viên | Ưu | Nhược |
|----------|-----|--------|
| **Thêm** (menu P2) | Đã có `menu.tsx`, gom module phụ, cân 2+2 | Không phải tab nội dung chính |
| Kho | Hay dùng khi tạo đơn | Trùng inventory trong menu |
| Chờ sync | Badge outbox hữu ích | Ít dùng hàng ngày |
| Công nợ | Nghiệp vụ quan trọng | Hẹp hơn menu tổng |

## Frame: `Admin / Create Order — Step 1`

- Nút **Chọn từ cuộc gọi** (cam) → stack `order/from-calls`
- Label **Địa chỉ** full width → hàng **input + nút Maps** (cùng baseline 48dp) → hint ghim tọa độ **dưới**
- Block dán link Google Maps + **Áp dụng**
- Nhân viên giao: horizontal chips từ users role `user`
- CTA sticky: **Tiếp theo**

## Frame: `Admin / Create Order — Step 2`

- Mẫu chai chip (`GET /cylinder-templates` hoặc mặc định local)
- Thêm sản phẩm từ cache SQLite; mỗi dòng: owner (default **Gas Huy Hoàng**), seri optional, hạn kiểm, ngày nhập
- Thanh toán: cash / debt / partial + nợ vỏ; preview tổng VAT
- CTA sticky: **Quay lại** | **Tạo đơn**

## Frame: `Admin / Create Order — Offline`

- Banner offline; CTA vẫn **Tạo đơn** → outbox `sales_order` create + toast “Đã xếp hàng”

## Frame: `Admin / Create Order — Success`

- Toast success; redirect chi tiết đơn (online) hoặc back list (offline)

## Frame: `Admin / Orders — List`

- Search + filter chip (trạng thái giao)
- Caption: `{filtered}/{total} đơn · kéo xuống để đồng bộ từ server`
- TextField: placeholder `Mã đơn, tên khách hoặc SĐT…`
- Nút ghost **Đồng bộ** cạnh search (optional — có trong v5.3)
- Sort mới nhất trước (`created_at` desc trên cache)
- OrderCard admin variant: thêm nút quick **Sửa**
- Pull-to-refresh indicator (design static state)

**Figma v5.3:** [node 35:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=35-2) — `index-v5.3-orders-sync.html`

## Frame: `Admin / Dashboard — Pull refresh` (v5.3)

- KPI + chart như v5.2
- Caption mờ: *Kéo xuống để đồng bộ dữ liệu*
- Pull indicator (annotation)

## Frame: `Admin / Orders — Empty search` (v5.3)

- Search có text, 0 kết quả + empty state

## Frame: `Admin / Order — Detail`

- Tabs hoặc sections: Thông tin | Hàng | Nợ vỏ | Lịch sử
- **Lịch sử:** timeline `order_change_log` (ai, lúc nào, field đổi)

## Frame: `Admin / Order — Edit`

- Form: số lượng, nợ vỏ, ghi chú admin
- Sticky: **Lưu** (primary) — disabled khi invalid
- Offline: banner "Thay đổi sẽ đồng bộ sau"

## Frame: `Admin / Order — Change log`

- Read-only list, monospace cho giá trị số

## Conflict (link `sync-states.md`)

- Frame `Admin / Conflict — Order` khi 2 admin sửa cùng đơn
