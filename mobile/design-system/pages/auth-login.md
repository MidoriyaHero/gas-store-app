# Page Override: Auth / Login

> Master: `../gas-store-mobile/MASTER.md`

## Frame

- **Name:** `Auth / Login`
- **Size:** 390 × 844
- **Spec file:** dùng khi vẽ frame này trong Figma

## Layout (top → bottom)

1. **Hero gradient** (~220dp): primary blue gradient, logo circle, title "Gas Huy Hoàng", subtitle "Quản lý giao gas — offline-first"
2. **Form card** (surface, radius 16, padding 24):
   - TextField `Tài khoản` (autocomplete username)
   - TextField `Mật khẩu` (secure + toggle show)
   - Inline error (role=alert) — frame riêng `Auth / Login — Error`
   - Button primary full-width: **Đăng nhập** (loading state = spinner trong button)
3. **Footer caption:** phiên bản app / "Cần hỗ trợ? Liên hệ quản trị"

## States (variants hoặc frame riêng)

| State | UI |
|-------|-----|
| Default | Form trống |
| Error | Banner đỏ dưới form: "Đăng nhập thất bại…" |
| Loading | Button disabled + spinner |
| Keyboard open | Form scroll; hero có thể collapse nhẹ |

## Routing (annotation sticky)

- `role === admin` → `Admin / Dashboard`
- else → `Staff / Orders — List`

## A11y

- Label visible cho mọi field
- Error không chỉ đổi màu border — có message text
- Focus order: username → password → submit
