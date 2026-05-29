# Page Override: Admin / Audit (Kiểm kê vỏ/nước)

## Business rule (sticky trên Figma)

- **Ngày nghiệp vụ UTC+7** — hiển thị rõ: "Ngày kiểm kê: 22/05/2026 (GMT+7)"

## Frame: `Admin / Audit — Form`

Sections:

1. Date picker (readonly nếu chỉ cuối ngày)
2. Bảng nhập theo loại chai / nước
3. Numeric fields — keyboard số
4. Tổng tự động (read-only)
5. **Lưu kiểm kê** primary

## Frame: `Admin / Audit — Validation error`

- Error dưới từng field, không chỉ toast
- Summary trên cùng nếu nhiều lỗi

## Frame: `Admin / Audit — Saved offline`

- Success banner + SyncBanner pending
- Cho phép sửa lại trước khi sync (autosave draft)

## UX

- Input height ≥ 48dp
- Tabular numbers cho cột số lượng
- Confirm nếu thoát khi chưa lưu
