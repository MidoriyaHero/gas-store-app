# Feature gate — widget / chart trên dashboard

Trước khi thêm KPI hoặc biểu đồ mới, trả lời ngắn các mục sau (giữ ~5 điểm nhìn ưu tiên mỗi trang).

1. **Câu hỏi kinh doanh** — Feature trả lời câu nào? Nếu không gắn được một câu, đưa sang trang báo cáo khác hoặc route riêng.
2. **Trang** — Thuộc `/` (Tổng quan), `/tai-chinh-quan-tri`, `/dieu-hanh`, hay route mới + mục nav?
3. **Trade-off** — Thêm mục này thì gập, ẩn, hoặc đưa xuống “Chi tiết / Xem thêm” mục nào?
4. **Dữ liệu** — API, empty/error, có cần filter hoặc drill-down ngay không?
5. **A11y** — Legend/nhãn tooltip đúng nghĩa, tóm tắt `sr-only` cho chart nếu cần.

Sau khi duyệt: code theo pattern `AppLayout` + `AsyncStatePanel` + Recharts hiện có, rồi smoke test các route admin liên quan.
