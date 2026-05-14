# Phase 1 IA + Wireframe (Low fidelity)

## Information Architecture
- `Tổng quan` -> chart-first hero + 2 chart phụ + action queue
- `Đơn hàng` -> tạo đơn 2 bước + danh sách đơn + trạng thái xử lý
- `Lịch sử đơn nhân viên` -> filter/search theo SĐT + sheet detail

## Wireframe Blocks

### 1) Dashboard (`/`)
- Header: period/filter controls + refresh
- Row A: 3 KPI cards (doanh thu, số đơn, dư nợ phát sinh)
- Row B: hero line chart + donut cơ cấu
- Row C: 2 bar chart (top SKU tồn thấp, top khách nợ)
- Row D: quick insight cards + drill-down CTA

### 2) Orders create-only (`/tao-don`)
- Step switcher:
  - Step 1: thông tin khách + ngày giao + địa chỉ/ghi chú
  - Step 2: sản phẩm + thông tin chai + thanh toán + tổng tiền
- Sticky action bar:
  - Back step
  - Next step / Submit create

### 3) Staff order history (`/don-cua-toi`)
- Top filters:
  - Search: mã đơn/khách/SĐT
  - Payment status select
- Data table:
  - Mã đơn, khách, thanh toán, tổng, thời gian, action
- Row click => sheet detail with order lines

## Mock state flow for orders
- `draft` -> `pending_approval` -> `approved` -> `completed`
- fallback branches:
  - `pending_approval` -> `cancelled`
  - `approved`/`completed` with outstanding > 0 -> `debt_pending`
