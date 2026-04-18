# Thuế và xuất dữ liệu (Gas Store)

Tài liệu này gom **toàn bộ ngữ cảnh liên quan thuế / xuất báo cáo** trong codebase MVP. Đây không phải **tư vấn pháp lý hay kế toán**; các quy định thực tế (mẫu biểu, thuế suất, kỳ kê khai) cần được đối chiếu với **cơ quan thuế**, **luật hiện hành** và **kế toán**.

---

## 1. Mục tiêu nghiệp vụ (mong muốn trong dự án)

- Có **khu vực xuất dữ liệu phục vụ khai báo / báo cáo thuế**, đúng định dạng **Việt Nam** khi đã chốt được mẫu chính thức.
- Trước mắt: **xuất file** (CSV placeholder) để có thể **đối chiếu doanh thu / bán hàng** theo đơn, theo dòng hàng, rồi map sang quy trình kê khai thực tế (Excel / phần mềm HTKK / hóa đơn điện tử — tùy doanh nghiệp).

---

## 2. Hiện trạng trong code (đã làm)

### 2.1 API xuất CSV

| Thành phần | Chi tiết |
|------------|----------|
| **HTTP** | `GET /api/tax-export.csv` |
| **Query (tuỳ chọn)** | `from`, `to` — lọc theo `sales_orders.created_at` (so sánh trực tiếp với datetime đơn hàng). |
| **Định dạng đáp** | `text/csv; charset=utf-8`, header `Content-Disposition: attachment; filename="tax_export.csv"` |
| **Ý nghĩa** | **Placeholder**: bảng chi tiết bán hàng theo **dòng đơn**, phục vụ đối soát / import tay — **chưa** khớp một mẫu khai chính thức nào của cơ quan thuế. |

### 2.2 Cột trong file CSV (phiên bản hiện tại)

Thứ tự cột được ghi cứng trong `backend/app/api/routes.py` (`tax_export_csv`):

| Cột | Nguồn / ghi chú |
|-----|------------------|
| `order_id` | `sales_orders.id` |
| `order_code` | `sales_orders.order_code` |
| `order_date` | `sales_orders.created_at` (ISO string) |
| `customer_name` | Tên khách trên đơn (text tự nhập, không validate MST/CCCD) |
| `phone` | SĐT khách |
| `line_id` | `sales_order_items.id` |
| `product_sku` | SKU sản phẩm (từ `products` nếu còn liên kết) |
| `product_name` | Tên hàng **snapshot** trên dòng (`sales_order_items.product_name`) |
| `qty` | Số lượng dòng |
| `unit_price` | Giá đơn vị **đã snapshot** trên dòng đơn |
| `line_subtotal` | `sales_order_items.line_subtotal` |
| `order_subtotal` | `sales_orders.subtotal` (lặp lại trên mỗi dòng của cùng đơn) |
| `vat_rate_pct` | `sales_orders.vat_rate` (phần trăm, ví dụ `10`) |
| `vat_amount` | `sales_orders.vat_amount` (lặp lại trên mỗi dòng của cùng đơn) |
| `order_total` | `sales_orders.total` (lặp lại trên mỗi dòng của cùng đơn) |
| `note_tax_placeholder` | Cột **giữ chỗ** cho mã thuế / mã hàng / diễn giải sau này — hiện **để trống** |

### 2.3 Logic lọc thời gian

- Nếu có `from`: bỏ qua đơn có `created_at < from`.
- Nếu có `to`: bỏ qua đơn có `created_at > to`.
- **Lưu ý**: so sánh giữa datetime có/không timezone và giá trị query string — trong môi trường thật cần thống nhất **UTC vs giờ VN** và kiểu tham số query (ISO).

### 2.4 Giao diện (UI)

- Trên header toàn app (`frontend/src/layout/AppLayout.tsx`): link **“Xuất CSV (thuế)”** trỏ tới **`/api/tax-export.csv`** (cùng origin với frontend khi chạy Vite proxy hoặc nginx Docker).
- Người dùng bấm → trình duyệt tải file `tax_export.csv`.

### 2.5 Kiểm thử tự động

- Script **`scripts/e2e-api.sh`** gọi `GET /api/tax-export.csv` và kiểm tra status + header CSV.
- **Không** kiểm tra đúng/sai về thuế — chỉ smoke test kỹ thuật.

---

## 3. Dữ liệu trong database liên quan đến “thuế” hiện tại

Trên **`sales_orders`** đã có **VAT cấp đơn**: `vat_rate`, `vat_amount`, `subtotal`, `total` (thuế suất một giá trị cho cả đơn; không tách VAT theo từng dòng trong DB).

Schema MVP **vẫn không** có các trường chuyên biệt như:

- MST người mua / người bán trên từng đơn  
- Thuế suất GTGT **theo dòng** (khác nhau giữa các dòng trên cùng đơn)  
- Mã hàng theo danh mục TCT / hóa đơn điện tử  
- Loại hóa đơn, ký hiệu, số hóa đơn  

Thông tin hiện có chủ yếu phục vụ:

- Doanh thu / giá trị dòng (`qty`, `unit_price`, `line_subtotal`).  
- Báo cáo thuế theo đơn (`vat_rate`, `vat_amount`, `total`).  

Nếu sau này cần **VAT theo dòng**, **MST khách**, **hóa đơn điện tử**, cần **mở rộng schema + form nhập liệu + quy tắc nghiệp vụ** (không chỉ đổi file export).

---

## 4. Ngữ cảnh Việt Nam (ôn tập ngắn — không thay thế văn bản pháp luật)

Phần này chỉ để **định hướng** khi bạn chốt “muốn export đúng thứ gì”:

- **Hóa đơn điện tử / hóa đơn GTGT**: thường có cấu trúc XML/JSON theo schema TCT; doanh nghiệp phải dùng **hệ thống hóa đơn được cấp phép** để phát hành hóa đơn hợp lệ — **file CSV gộp bán lẻ trong app này không tương đương** phát hành hóa đơn.
- **Kê khai thuế GTGT / tờ khai định kỳ**: thường nhập liệu theo **sổ kế toán**, **hóa đơn**, **báo cáo bán hàng** — định dạng do phần mềm kê khai quy định (ví dụ các bảng trong Excel template theo hướng dẫn từng kỳ).
- **Bán gas lẻ / nhỏ**: có thể thuộc các tình huống miễn giảm, hộ kinh doanh, hóa đơn từng lần — **phụ thuộc đăng ký kinh doanh và quy định tại thời điểm áp dụng**; app **không** tự suy ra điều đó.

Khi có **mẫu file cụ thể** (Excel/CSV/XML) hoặc tên **phần mềm kê khai** đích đến, có thể thiết kế lại bước export (map cột + quy tắc làm tròn số tiền).

---

## 5. Hạn chế / rủi ro của bản MVP

- **Không** tính thuế GTGT trên đơn; `line_total` là **thành tiền hàng** (trừ khi nghiệp vụ của bạn định nghĩa `unit_price` đã gồm thuế — hiện code **không** phân biệt).
- **Khách hàng** chỉ lưu tên + SĐT; không đủ cho hóa đơn có MST nếu chưa bổ sung form.
- Lọc `from`/`to` cần rà lại **múi giờ** và **chuỗi datetime** khi dùng từ báo cáo thực tế.

---

## 6. Việc cần làm khi “chốt format thuế Việt Nam”

1. Thu thập **file mẫu chính thức** hoặc spec (cột bắt buộc, kiểu dữ liệu, encoding).
2. Quyết định **đơn vị tiền**, **số chữ số thập phân**, **làm tròn** theo dòng hay theo hóa đơn.
3. Bổ sung **dữ liệu đầu vào** (nếu cần): MST, thuế suất, loại đối tượng mua hàng, v.v.
4. Implement **mapper** từ `orders` / `order_lines` / `items` → định dạng đích (CSV/XML/Excel).
5. Kiểm tra với **kế toán / đại lý thuế** trước khi dùng trong kỳ khai thực.

---

## 7. Gọi API nhanh (tham khảo)

```bash
# Toàn bộ đơn (không lọc)
curl -sOJ http://127.0.0.1:8000/api/tax-export.csv

# Có lọc (ví dụ — cần đúng định dạng datetime mà FastAPI parse được)
curl -sG "http://127.0.0.1:8000/api/tax-export.csv" \
  --data-urlencode "from=2026-01-01T00:00:00" \
  --data-urlencode "to=2026-12-31T23:59:59"
```

*(Đổi host/port theo môi trường: Docker, uvicorn local, …)*

---

## 8. File code chính liên quan

| File | Vai trò |
|------|---------|
| `backend/app/api/routes.py` | Hàm `tax_export_csv` — sinh CSV |
| `frontend/src/layout/AppLayout.tsx` | Link “Xuất CSV (thuế)” |
| `frontend/e2e/full-ui.spec.ts` | Smoke test endpoint CSV |

---

*Nếu sau này tách nhánh nghiệp vụ “hóa đơn điện tử” hoặc “kê khai GTGT”, nên tạo module riêng (service + schema + doc) thay vì chỉ mở rộng một endpoint CSV.*
