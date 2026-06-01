# Gas Store Mobile (Expo)

Offline-first Android client for Gas Store. Uses SQLite + outbox FIFO, single-flight sync engine, and Bearer auth.

## Setup

**Node.js:** dùng **20 LTS** (Expo 52 không tương thích Node 25). Trong thư mục `mobile`:

```bash
nvm use    # đọc .nvmrc → 20.19.5
```

```bash
cd mobile
npm install
cp .env.example .env
```

## App icon & splash

Logo nguồn: [`../logo.png`](../logo.png). Regenerate assets:

```bash
npm run icons
npx expo prebuild --platform android --no-install
```

Commit `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` và native `mipmap-*` sau khi đổi logo.

## Android emulator + Docker API

1. Start stack from repo root: `docker compose up -d` (API `:8000`, web `:8686`).
2. Point mobile at host loopback and reverse port:

```bash
# .env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000

adb reverse tcp:8000 tcp:8000
```

3. Build/run (required after manifest changes, e.g. `tel:` queries):

```bash
npx expo run:android
```

**Cleartext HTTP:** debug builds allow HTTP via `android/app/src/debug/AndroidManifest.xml`. Release APK requires HTTPS (`usesCleartextTraffic: false`).

**Alternative host URL:** `http://10.0.2.2:8000` works without `adb reverse` on some AVDs; prefer `127.0.0.1` + reverse when login fails with network errors.

If Gradle reports **SDK location not found**, create `android/local.properties`:

```properties
sdk.dir=/Users/admin/Library/Android/sdk
```

Ensure the emulator is online:

```bash
adb devices
adb kill-server && adb start-server   # if offline
```

## Release APK (local)

1. Create keystore (once):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore mobile/android/app/release.keystore \
  -alias gasstore -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy `mobile/android/keystore.properties.example` → `keystore.properties` and fill passwords.

3. Build with production API URL:

```bash
EXPO_PUBLIC_API_URL=https://api.your-domain.com ../scripts/build-android-release.sh
```

Or: `EXPO_PUBLIC_API_URL=https://api.your-domain.com npm run build:android:release`

Output: `android/app/build/outputs/apk/release/app-release.apk`

## CI / GitHub Actions

- **CI** (`.github/workflows/ci.yml`): backend pytest, frontend build, mobile `tsc`.
- **Mobile Release** (`.github/workflows/mobile-release.yml`): `workflow_dispatch` or tag `mobile/v1.0.0` → signed APK artifact.

**GitHub Secrets:**

| Secret | Value |
|--------|-------|
| `EXPO_PUBLIC_API_URL` | `https://api.<domain>` |
| `ANDROID_KEYSTORE_BASE64` | `base64 -i release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | |
| `ANDROID_KEY_ALIAS` | e.g. `gasstore` |
| `ANDROID_KEY_PASSWORD` | |

Production API via Cloudflare Tunnel: [`../docs/deploy/cloudflare-tunnel.md`](../docs/deploy/cloudflare-tunnel.md).

## Emulator vs physical device (P1)

| Feature | Emulator (AVD) | Physical device |
|---------|----------------|-----------------|
| Login / sync | OK with `adb reverse` + Docker | OK on same LAN or reverse USB |
| Google Maps deep link | OK if Chrome/Maps installed; order needs GPS or address | OK |
| Phone call (`tel:`) | **Usually no dialer** — expect error toast | OK |
| Mic / voice notes | Permission prompt; upload needs network | OK |

Staff **Maps** needs `delivery_latitude/longitude` or `delivery_address` on the order (pull sync from web).

## OpenAPI codegen

With API running:

```bash
OPENAPI_URL=http://localhost:8000/openapi.json npm run codegen
```

## Architecture

- `src/db/` — Drizzle SQLite mirror + outbox
- `src/sync/` — single-flight push then pull
- `src/auth/` — SecureStore tokens + `bootstrap.ts` restore session khi mở app
- `src/lib/ids.ts` — `newClientId()` via `expo-crypto` (tránh lỗi `crypto.getRandomValues` của `uuid` trên RN)
- `app/` — Expo Router (admin + staff layouts)
- `src/components/navigation/AdminTabBar.tsx` — admin tabs + center FAB → `/(admin)/order/create`
- `src/features/admin/AdminCreateOrderPanel.tsx` — 2-step create order form

Voice notes: encode MP3 ~32 kbps before multipart upload (ADR-008); wire `expo-av` + ffmpeg-kit in a dev build when ready.

## P1 smoke test checklist

1. `docker compose up -d` — API responds on `:8000`
2. `adb reverse tcp:8000 tcp:8000`
3. `npx expo run:android`
4. **Admin:** dashboard KPI hôm nay → **FAB +** tạo đơn (online/offline) → sửa/hoàn thành đơn → kiểm kê load/save → thu nợ
5. **Staff:** ghi chú text → toast; Maps với đơn có GPS; gọi trên máy thật
