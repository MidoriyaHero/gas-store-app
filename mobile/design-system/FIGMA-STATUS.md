# Figma — trạng thái hoàn tất

> Mobile design **đủ để sign-off và code**. Map **không nhúng SDK** — chỉ deep link Google Maps.

## Capture trên file [Gas-store](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store)

| Batch | HTML source | Node (approx) | Nội dung |
|-------|-------------|---------------|----------|
| v2 | `figma-mockup/index.html` | [12:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=12-2) | Staff 2 tab, order detail + mic, Admin chart-first |
| v3 | `figma-mockup/index-v3-more.html` | [14:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=14-2) | Auth, Audit, System, Admin detail/edit |
| v4 | `figma-mockup/index-v4-final.html` | [17:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=17-2) | Components, GG Maps, P2 admin, Outbox, Session |
| v5 | `figma-mockup/index-v5-create-order.html` | [30:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=30-2) | Batch đầu (superseded) |
| v5.1 | `figma-mockup/index-v5-create-order.html` | [31:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=31-2) | superseded |
| v5.2 | `figma-mockup/index-v5-create-order.html` | [34:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=34-2) | **2+FAB+2** tab bar · Maps căn input · Step 1 địa chỉ |
| v5.3 | `figma-mockup/index-v5.3-orders-sync.html` | [35:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=35-2) | **Orders search + sync hint** · Dashboard pull refresh · Empty search |

### v5.3 frames mới

- `Admin / Orders — List + Search + Sync` — search, chip trạng thái, caption kéo xuống đồng bộ, nút Đồng bộ
- `Admin / Dashboard — Pull refresh` — KPI + hint kéo xuống đồng bộ
- `Admin / Orders — Empty search` — 0 kết quả

### v5 frames mới

- `Admin / TabBar — FAB` — **2 + FAB + 2**: Tổng quan · Đơn hàng | **+** | Kiểm kê · **Thêm** (menu P2)
- `Admin / Create Order — Step 1` — địa chỉ + nút **Maps** (icon pin) cạnh ô input; block **Dán từ Google Maps** + **Áp dụng**; hint tọa độ đã ghim
- `Admin / Create Order — Step 2` — giỏ hàng, mẫu chai, thanh toán, sticky CTA
- `Admin / Create Order — Offline` — banner offline + “Lưu hàng đợi”
- `Admin / Create Order — Success` — toast + gợi ý redirect chi tiết đơn

### Deprecated (v5 — không xóa history v2–v4)

- `Staff / Map — Placeholder` → thay bằng Directions v4
- `Staff / Notes — Tab` → ghi chú inline trong detail
- `Admin / Bottle templates` wireframe → mẫu chai gộp form tạo đơn
- Trùng `Admin / Menu drawer` nếu đã có stack `menu.tsx`

**Capture:** `cd mobile/design-system/figma-mockup && python3 -m http.server 8765` → mở `index-v5-create-order.html` → Figma HTML-to-design capture (node [30:2](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=30-2)).

## Quyết định map (2026-05)

- Tab staff: **Điểm giao** (không canvas map trong app).
- Nút **Mở Google Maps** / **Chỉ đường** → `https://www.google.com/maps/dir/?api=1&destination=...`
- GPS từ `delivery_latitude` / `delivery_longitude`; fallback địa chỉ text.
- Frame map nhúng (v3) = **deprecated** — dùng v4 Directions.

## Checklist sign-off

- [x] P0 Staff + Admin tabs
- [x] Auth, sync, conflict, empty, error
- [x] Admin kiểm kê + đơn chi tiết
- [x] P2 admin parity (wireframe)
- [x] Component reference board
- [x] v5 Admin FAB + Create Order mockup
- [x] Product owner duyệt copy tiếng Việt
- [x] Bắt đầu implement RN (P0 batch 1 — xem commit/worktree)

## Sau Figma → code

- [x] Staff điểm giao + Google Maps + order detail + confirm/toast
- [x] Sync pull notes + voice upload multipart
- [x] Outbox screen + conflict sheet
- [x] Session expired → login redirect
- [x] Admin P2 modules (menu: công nợ, kho, users, đòi nợ, vận hành)
- [x] Admin FAB → `/(admin)/order/create` (2-step form, online POST + offline outbox)
