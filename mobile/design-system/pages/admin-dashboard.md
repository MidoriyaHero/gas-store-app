# Page Override: Admin / Dashboard (UX v2 — chart-first)

> Master: `../gas-store-mobile/MASTER.md`  
> Align với web `Dashboard.tsx`: **chart-first**, không chỉ số lẻ trên nền trống.

## Frame: `Admin / Dashboard`

**Density:** gap 6–8dp giữa block; scroll một cột — không để vùng trống lớn.

1. **Filter chips:** `7 ngày` | `30 ngày` | `Từ đầu tháng`
2. **KPI row (3 cột compact):** Doanh thu, Số đơn, Dư nợ PS — mỗi ô có **delta** ↑↓
3. **Line chart:** Doanh thu (hoặc số đơn) theo ngày — chiều cao ~120dp
4. **2 cột chart:**
   - Donut: Cơ cấu trạng thái nợ (đã trả / còn nợ)
   - Bar: SKU tồn thấp
5. **Horizontal bar:** Top khách nợ cao
6. **Quick links** (compact list, không card cao)

## Anti-pattern (v1)

- 4 MetricCard lớn + nhiều whitespace → cảm giác "trôi", khó focus
- Thiếu biểu đồ → admin không thấy trend

## A11y

- Chart cần text summary ngắn (screen reader) — mirror web `sr-only` / figcaption
