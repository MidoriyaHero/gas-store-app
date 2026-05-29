# Page Override: Staff / Orders (UX v2)

> Master: `../gas-store-mobile/MASTER.md`  
> **Nguyên tắc:** 1 màn / 1 luồng — ghi chú + voice **inline** trong chi tiết đơn (không tab Ghi chú riêng).

## Navigation

- Bottom tab **2 mục:** `Đơn giao` | `Bản đồ`
- Bỏ tab `Ghi chú giao` — mọi ghi chú gắn với đơn

## Frame: `Staff / Orders — List`

- Compact cards, hint `"N ghi chú"` nếu có
- Tap card → Detail (không qua màn notes)

## Frame: `Staff / Order Detail — Unified`

1. **Khách & hàng** (1 card): tên, SĐT, địa chỉ, line items, chip nợ vỏ  
   - Row: **Gọi** | **Chỉ đường** (40dp)
2. **Ghi chú giao** (cùng màn):
   - List note cũ (text badge + voice row có ▶)
   - Compose row: `textarea` + **Mic 48×48** (1 tap = ghi, không navigate)
   - Helper: "Chạm mic — ghi âm ngay trên màn này"
3. Sticky: **Hoàn thành giao**

## Frame: `Staff / Order Detail — Recording`

- Cùng layout Detail; mic = đỏ + badge `REC mm:ss`
- Offline: banner + voice vào outbox

## UX rationale (field worker)

- Giảm context switch (Upper / DispatchTrack: single-app workflow)
- Voice embedded tại stop, không màn riêng
- Touch target mic ≥ 48dp
