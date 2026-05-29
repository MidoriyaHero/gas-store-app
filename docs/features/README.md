# Features — Index

Danh sách tính năng nghiệp vụ × client × API.

| Feature | Web | Mobile P1 | API chính | Doc |
|---------|-----|-----------|-----------|-----|
| Auth & roles | `/login` | `login.tsx` | `/auth/*` | [auth-roles](./auth-roles.md) |
| Products & inventory | `/kho` | read-only inventory | `/products`, stock-receipts | [products-inventory](./products-inventory.md) |
| Orders & delivery | `/don-hang` | staff + admin create/PATCH/hoàn thành | `/orders`, `/me/orders`, `/cylinder-templates` | [orders-delivery](./orders-delivery.md) |
| Order notes & voice | `/ghi-chu-giao` | order detail + toast | `/order-notes`, voice | [order-notes-voice](./order-notes-voice.md) |
| Debt & finance | `/tai-chinh-quan-tri` (Sổ nợ + Sổ nợ vỏ) | thu nợ sheet | `/debt-*`, `/shell-debt-ledger` | [debt-finance](./debt-finance.md) |
| Gas ledger & audit | `/so-gas`, kiểm kê | GET/PUT audit + offline | `/gas-ledger`, daily-cylinder-audit | [gas-ledger-audit](./gas-ledger-audit.md) |
| Tax export | `/bao-cao-thue` | — | `/orders/tax-report`, exports | [tax-export](./tax-export.md) |
| Dashboard & reports | `/` | KPI hôm nay + charts cache | `/dashboard` (web); mobile SQLite | [dashboard-reports](./dashboard-reports.md) |
| Users admin | `/nguoi-dung` | read-only list | `/users` | [users-admin](./users-admin.md) |
| Geocode & maps | order map, `/ban-do` | Maps + tel toast | `/geocode` | [geocode-maps](./geocode-maps.md) |
| Sync offline | — | outbox, sync bar | `/sync/*` | [sync-offline-mobile](./sync-offline-mobile.md) |
| Staff delivery | `/don-cua-toi` | staff tabs + toast | `/me/orders`, sync | [staff-delivery](./staff-delivery.md) |
| Admin mobile | — | FAB create + CRUD cốt lõi P1 | POST/PATCH order, audit, debt | [admin-mobile](./admin-mobile.md) |
| Mobile UX toast | — | ToastProvider toàn app | — | [mobile-ux-feedback](./mobile-ux-feedback.md) |

## Nav web

- Admin: [frontend/src/lib/navGroups.ts](../../frontend/src/lib/navGroups.ts) — `adminNavGroups`
- Staff: `staffNavGroups`

## Mobile routes

- Staff: `mobile/app/(staff)/`
- Admin: `mobile/app/(admin)/`
- Outbox: `mobile/app/outbox.tsx`

## Design specs (mobile UX)

[mobile/design-system/pages/](../../mobile/design-system/pages/)
