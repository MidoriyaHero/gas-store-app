# Page Override: Staff / Directions (Google Maps external)

> **Không nhúng map trong app.** Chỉ list điểm giao + deep link.

## Tab

- Label: **Điểm giao** (thay tab Bản đồ cũ)
- Icon: `navigate` / `map-pin` outline

## Frame: `Staff / Directions — List`

- Header: số đơn hôm nay
- SyncBanner instance
- Mỗi card:
  - STT giao (1, 2, 3…)
  - Mã đơn, khách, địa chỉ
  - Dòng phụ: GPS `lat,lng` hoặc "Chưa có GPS — dùng địa chỉ"
  - CTA: **Mở Google Maps** (full width, secondary/primary soft)

## Frame: `Staff / Order Detail — Chỉ đường`

- Block địa chỉ + GPS
- Row actions: **Gọi** | **Chỉ đường** (cùng deep link)

## Deep link

```
https://www.google.com/maps/dir/?api=1&destination={lat},{lng}
https://www.google.com/maps/dir/?api=1&destination={encodeURIComponent(address)}
```

Implement RN: `Linking.openURL` / `Linking.canOpenURL`.

## Không làm

- react-native-maps, WebView OSM, pin trên canvas
- Frame map nhúng v3 (deprecated)
