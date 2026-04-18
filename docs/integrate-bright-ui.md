# Tích hợp UI `bright-order-boss`

UI gốc: [`bright-order-boss`](https://github.com/MidoriyaHero/bright-order-boss) (MidoriyaHero).

## Vì sao clone tự động có thể thất bại

- Repo **private** hoặc **đổi tên/xóa** → HTTP trả `404 Repository not found`.
- Môi trường agent **không có token** GitHub của bạn.

## Bạn làm trên máy (một lần)

### Cách A — Repo public hoặc đã `gh auth login`

```bash
cd /Users/admin/code/personal-project/gas-store-app
git clone https://github.com/MidoriyaHero/bright-order-boss.git bright-order-boss
```

### Cách B — Repo private

```bash
cd /Users/admin/code/personal-project/gas-store-app
git clone git@github.com:MidoriyaHero/bright-order-boss.git bright-order-boss
# hoặc HTTPS + Personal Access Token khi được hỏi
```

Hoặc **kéo ZIP** từ GitHub → giải nén vào `gas-store-app/bright-order-boss/`.

## Sau khi có thư mục `bright-order-boss/`

Báo lại trong chat (hoặc commit push lên workspace). Agent sẽ:

1. Đọc stack (React/Vite/Next, router, axios base URL, kiểu DTO).
2. Thay hoặc gộp vào `frontend/` (giữ Docker/nginx build nếu cần).
3. **Chỉnh FastAPI** (`/api/...`) cho khớp endpoint + JSON mà UI gọi.
4. Cập nhật `docker-compose` / `vite.config` proxy / Playwright e2e nếu đường dẫn đổi.

## Việc agent cần từ UI (để map BE)

- File gọi API (vd: `src/api/*`, `services/*`, `.env.example`).
- Bất kỳ OpenAPI/mock JSON nào trong repo.

---

_Khi `bright-order-boss` đã nằm trong `gas-store-app/`, xóa file placeholder nếu có và tiếp tục tích hợp._
