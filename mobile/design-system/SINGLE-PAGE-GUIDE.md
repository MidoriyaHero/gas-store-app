# Gas Store Mobile — Single Page Layout Guide

> **Quy tắc làm việc:** Mình **tự build** mockup → đẩy vào Figma bằng `generate_figma_design` (không tốn quota `use_figma` Starter). Bạn **không** cần vẽ tay.
>
> **Mockup nguồn:** `figma-mockup/index.html` — chạy `python3 -m http.server 8765` trong thư mục đó rồi capture lại nếu cần.
>
> **Mục tiêu:** Toàn bộ Staff + Admin flows trên **1 page** (`Gas Store Mobile v1`), không tạo page mới, không cần Figma Pro.
>
> File: [Gas-store](https://www.figma.com/design/YqysrxDyidLcMiXb3iL4Wv/Gas-store?node-id=0-1)
>
> Tokens đã có: collection **`Gas Store Mobile`**. Logo: frame `logo` (node `6:2`).

---

## Bước 0 — Chuẩn bị (5 phút)

1. Mở file → page **`Gas Store Mobile v1`** (duy nhất).
2. **Không** `+` thêm page.
3. Frame màn hình: **390 × 844**, corner radius 0 (phone).
4. Font: **Inter** (Regular 14/16, Semi Bold labels, Bold titles).
5. Margin nội dung: **16dp** hai bên; safe area top ~47, bottom tab ~83.

---

## Bước 1 — Tạo 7 Section (xếp ngang)

Dùng **Section** (Shift+S) — kéo dài theo chiều ngang, cách nhau ~200px.

| Section name | X gợi ý | Width | Frames bên trong |
|--------------|---------|-------|------------------|
| `00 Cover` | 0 | 1000 | Cover board |
| `01 Components` | 1200 | 1400 | Component sets |
| `02 Auth` | 2700 | 900 | 2 frames |
| `03 Staff` | 3800 | 4200 | 8 frames |
| `04 Admin` | 8200 | 4200 | 8 frames |
| `05 System` | 12600 | 2400 | 6 frames |
| `06 Flows` | 15200 | 2000 | Flow diagram stickies |

*(X chỉ là gợi ý — kéo cho thoáng, tránh overlap.)*

---

## Bước 2 — Section `00 Cover`

Frame **Cover board** (800×600):

```
┌─────────────────────────────────────┐
│  [logo 120×120]                     │
│  Gas Store Mobile — Flows v1        │
│  Staff + Admin | Light | 390×844    │
│                                     │
│  [■ Primary][■ Accent][■ Success]   │
│  [■ Warning][■ Error][■ Surface]    │
│                                     │
│  Spec: mobile/design-system/pages/  │
└─────────────────────────────────────┘
```

- Gắn logo từ frame `logo` (scale ~120px).
- Swatch bind variable `color/*` đã tạo.

---

## Bước 3 — Section `01 Components`

Tạo **Component** (không Component Set nếu muốn đơn giản) — đặt cạnh nhau:

### 3.1 Button / Primary

- Auto-layout H, padding 12×24, height **48**, radius **8**
- Fill: `color/accent`, text trắng Semi Bold **16**
- Variants (optional): `Primary | Secondary | Ghost | Danger`

| Variant | Fill | Text |
|---------|------|------|
| Primary | accent | white |
| Secondary | surface + stroke border | text |
| Ghost | none | primary |
| Danger | error | white |

### 3.2 TextField

- Label Inter Medium 14 `color/text` (luôn hiện)
- Input frame H48, padding 12, stroke `color/border`, radius 8
- Placeholder muted: "Nhập…"

### 3.3 SyncBanner (4 variants)

Height ~40, full width, icon + text:

| Variant | BG nhạt | Text |
|---------|---------|------|
| online | success 10% | "Đã kết nối — dữ liệu đồng bộ" |
| offline | warning 10% | "Offline — thay đổi lưu trên máy" |
| syncing | primary 10% | "Đang đồng bộ…" |
| error | error 10% | "Đồng bộ lỗi — Chạm thử lại" |

### 3.4 OrderCard

- Surface card, radius 12, padding 16, shadow nhẹ
- Row1: `#DH-1024` + Badge trạng thái
- Row2: Tên KH · SĐT
- Row3: Địa chỉ (2 dòng)
- Row4: `12kg × 2` · chip `Nợ vỏ: 3`

Badge: `Chờ giao` (warning) | `Đang giao` (primary) | `Hoàn thành` (success)

### 3.5 BottomTab (Staff 3 tab / Admin 3 tab)

- Height 83, surface, top border
- 3 item: icon 24 + label 11, active = primary

**Staff:** Đơn giao | Ghi chú | Bản đồ  
**Admin:** Tổng quan | Đơn hàng | Kiểm kê

### 3.6 MetricCard (Admin)

- 160×100, số lớn Bold, label caption muted

### 3.7 EmptyState / VoiceNoteRow / ConflictPanel

- Empty: icon + title + desc + 1 button
- VoiceNoteRow: tên file + badge `Chờ tải`
- Conflict: 2 cột "Server" vs "Máy bạn" + 3 nút

---

## Bước 4 — Section `02 Auth`

| Frame name | Nội dung chính |
|------------|----------------|
| `Auth / Login` | Hero gradient `#1D4ED8→#2563EB`, logo, title **Gas Huy Hoàng**, form card: Tài khoản, Mật khẩu, **Đăng nhập** |
| `Auth / Login — Error` | Giống trên + banner đỏ "Đăng nhập thất bại…" |

Chi tiết: `pages/auth-login.md`

---

## Bước 5 — Section `03 Staff` (8 frames)

Xếp 2 hàng × 4 cột (gap 24):

| # | Frame | Ghi chú |
|---|-------|---------|
| 1 | `Staff / Orders — List` | AppBar + SyncBanner online + 3× OrderCard + BottomTab |
| 2 | `Staff / Orders — Empty` | EmptyState "Chưa có đơn giao" |
| 3 | `Staff / Orders — Offline` | SyncBanner offline + badge pending |
| 4 | `Staff / Order Detail` | Khách, hàng, sticky **Hoàn thành giao** |
| 5 | `Staff / Complete — Sheet` | Bottom sheet xác nhận |
| 6 | `Staff / Notes — List` | List ghi chú theo đơn |
| 7 | `Staff / Notes — Recording` | Timer + ghi âm MP3 |
| 8 | `Staff / Map — Placeholder` | Map grey + text "Bản đồ giao (P1)" |

Chi tiết: `pages/staff-orders.md`, `pages/staff-notes.md`

---

## Bước 6 — Section `04 Admin` (8 frames)

| # | Frame | Ghi chú |
|---|-------|---------|
| 1 | `Admin / Dashboard` | 4 MetricCard + quick links + BottomTab |
| 2 | `Admin / Dashboard — Pending` | Metric "Chờ đồng bộ" highlight |
| 3 | `Admin / Orders — List` | Search + OrderCard + filter chip |
| 4 | `Admin / Order — Detail` | Tabs: Thông tin / Hàng / Nợ vỏ / Lịch sử |
| 5 | `Admin / Order — Edit` | Form sửa + **Lưu** |
| 6 | `Admin / Order — Change log` | Timeline thay đổi |
| 7 | `Admin / Audit — Form` | "Ngày kiểm kê GMT+7" + bảng số |
| 8 | `Admin / Audit — Error` | Validation từng field |

Chi tiết: `pages/admin-dashboard.md`, `pages/admin-orders.md`, `pages/admin-audit.md`

---

## Bước 7 — Section `05 System` (6 frames)

| Frame | Mục đích |
|-------|----------|
| `System / Sync — Syncing` | Banner syncing + skeleton list |
| `System / Conflict — Order` | Panel xung đột 2 admin |
| `System / Outbox — Pending` | List mutation chờ push |
| `System / Empty — No data` | Generic empty |
| `System / Error — Network` | Retry |
| `System / Error — Session` | Hết phiên → Login |

Chi tiết: `pages/sync-states.md`

---

## Bước 8 — Section `06 Flows` (annotation)

Vẽ **connector** hoặc sticky giữa các frame (không bắt buộc FigJam):

```
Auth Login ──admin──> Admin Dashboard ──> Orders / Audit
         └──staff──> Staff Orders ──> Detail ──> Complete
                              └──> Notes ──> Voice queue
         offline anywhere ──> System Outbox ──> Sync ──> Conflict?
```

Copy Mermaid từ `FIGMA-BLUEPRINT.md` §4 vào sticky text nếu cần.

---

## Checklist hoàn thành (tick trước khi code RN)

- [ ] 7 sections trên **1 page**
- [ ] ≥ 32 frames 390×844 (2 auth + 8 staff + 8 admin + 6 system + components ref)
- [ ] Mọi list có **empty state**
- [ ] SyncBanner nhất quán (icon + text)
- [ ] Touch 48dp cho button / tab
- [ ] Copy **tiếng Việt** đúng nghiệp vụ
- [ ] Không dark mode frame

---

## Tiết kiệm quota MCP (nếu dùng AI sau này)

- Chỉnh tay trong Figma theo guide này — **0 tool call**.
- Khi MCP reset: nhắn "sync frame X theo pages/staff-orders.md" — 1 frame / lần.

---

## Tham chiếu token (đã trong file)

| Token | Hex |
|-------|-----|
| primary | `#2563EB` |
| accent | `#F97316` |
| bg | `#F8FAFC` |
| surface | `#FFFFFF` |
| text | `#1E293B` |
| text-muted | `#64748B` |
| success | `#16A34A` |
| warning | `#D97706` |
| error | `#DC2626` |
