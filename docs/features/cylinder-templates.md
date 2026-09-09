# Cylinder templates (mẫu chai)

Preset thông tin chai dùng chung khi tạo dòng đơn. Admin CRUD; mọi user đăng nhập đọc mẫu đang active.

## Mục đích

- Không nhập lại chủ sở hữu / nơi nhập / hạn kiểm / ngày nhập mỗi lần tạo đơn.
- Serial chai vẫn nhập từng dòng trên đơn (không lưu trên mẫu).

## Actor

| Thao tác | admin | user |
|----------|-------|------|
| Xem mẫu active | ✓ | ✓ |
| `include_inactive=true` | ✓ | ✗ |
| CRUD | ✓ | ✗ |

## API

| Method | Path |
|--------|------|
| GET | `/cylinder-templates` |
| POST / PATCH / DELETE | `/cylinder-templates`, `/cylinder-templates/{id}` |

→ [endpoints.md](../api/endpoints.md)

## DB

- `cylinder_templates` — [relations §2](../database/relations-postgresql.md#2-catalog--inventory)
- Không FK tới đơn; đơn copy snapshot field lúc tạo dòng.

## Web

- `/mau-chai` — [CylinderTemplates.tsx](../../frontend/src/pages/CylinderTemplates.tsx)
- Form tạo đơn (`/don-hang`) chọn mẫu để điền preset

## Mobile

- `GET /cylinder-templates` khi admin tạo đơn (FAB) — [admin-orders](../../mobile/design-system/pages/admin-orders.md)

## Edge cases

- Cột `users.template_*` cũ có thể còn trên DB; API không đọc/ghi.
- Owner mặc định trên form web: **Gas Hoàng Ân** (có thể sửa).
