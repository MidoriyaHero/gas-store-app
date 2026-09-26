# Windows — Docker + Cloudflare Tunnel

Chạy stack Gas Store trên máy Windows: Docker Compose (web `:8686`, api `:8000`) và `cloudflared` **trên host** (không trong container). Origins tunnel: `http://127.0.0.1:8686` và `http://127.0.0.1:8000`.

Cần `CLOUDFLARE_TUNNEL_TOKEN` trong `.env` ở thư mục gốc repo (Zero Trust → Tunnels → Install connector). DNS/CORS: [cloudflare-tunnel.md](./cloudflare-tunnel.md).

`cloudflared` đã là `.exe` (`winget install Cloudflare.cloudflared`). Không cần tự build exe.

## Chọn cách auto-start

| Cách | Khi nào dùng |
|------|----------------|
| **Startup folder** (mặc định) | Dễ debug: cửa sổ PowerShell hiện khi đăng nhập; sửa delay Docker trong `.bat` |
| **Task Scheduler** (tuỳ chọn) | Chạy ẩn, log file, không phụ thuộc thư mục Startup của Explorer |
| Windows Service `cloudflared` | Chỉ tunnel; dễ 502 nếu Docker chưa sẵn — không khuyên dùng |

Cả hai cách auto-start đều cần Docker Desktop **Start when you sign in**.

---

## Mặc định: Startup folder

1. Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**.
2. `Win + R` → `shell:startup` → New → Shortcut.
3. Target (sửa đường dẫn repo):

   ```text
   C:\path\to\gas-store-app\scripts\start-gas-store.bat
   ```

4. Tên: `Gas Store`.

Mỗi lần đăng nhập: đợi 45 giây → [scripts/start-manual.ps1](../../scripts/start-manual.ps1) (`docker compose up -d` + tunnel).

Máy chậm: trong `start-gas-store.bat` đổi `timeout /t 45` thành `90` hoặc `120`.

Chạy tay (không auto):

```powershell
cd C:\path\to\gas-store-app
.\scripts\start-manual.ps1
```

---

## Tuỳ chọn: Task Scheduler

Script: [scripts/install-windows-startup.ps1](../../scripts/install-windows-startup.ps1) đăng ký task `GasStore-Production` lúc logon → [scripts/start-production-windows.ps1](../../scripts/start-production-windows.ps1) (cửa sổ ẩn, log `logs/startup-windows.log`).

```powershell
cd C:\path\to\gas-store-app
.\scripts\install-windows-startup.ps1
```

Chạy tay cùng logic (hữu ích khi test):

```powershell
.\scripts\start-production-windows.ps1
```

Gỡ task:

```powershell
.\scripts\uninstall-windows-startup.ps1
```

Không dùng đồng thời shortcut Startup **và** scheduled task — sẽ start Docker/tunnel hai lần.

---

## Không khuyên: cloudflared Windows Service

Chỉ chạy tunnel, cần Admin:

```powershell
cloudflared service install <CLOUDFLARE_TUNNEL_TOKEN>
cloudflared service uninstall
```

Service có thể chạy **trước** Docker → 502. Ưu tiên Startup folder hoặc Task Scheduler (cả hai chờ Docker sẵn sàng).

---

## Kiểm tra

- Local: `http://127.0.0.1:8686`
- Log: `logs\startup-windows.log` (scheduled task / `start-production-windows.ps1`)
- Tunnel CLI trực tiếp: `cloudflared tunnel --no-autoupdate run --token <CLOUDFLARE_TUNNEL_TOKEN>`
