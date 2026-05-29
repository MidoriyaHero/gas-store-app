# Page Override: Staff / Notes

## Frame: `Staff / Notes — List`

- AppBar: "Ghi chú giao"
- SyncBanner
- List grouped by **mã đơn** hoặc theo thời gian
- Row: avatar/icon note type, preview text, thời gian, badge `Chờ tải` nếu voice chưa upload

## Frame: `Staff / Notes — Add`

- TextField multiline + label "Nội dung"
- Optional: chọn đơn (picker / search)
- Bottom: **Lưu ghi chú** (primary)

## Frame: `Staff / Notes — Recording`

- Timer MM:SS
- Waveform placeholder
- **Dừng** / **Hủy**
- Copy: "Ghi âm sẽ tải lên khi có mạng"

## Frame: `Staff / Notes — Queue`

- Section "Đang chờ tải (3)"
- VoiceNoteRow: tên file, size, retry icon
- Banner warning nếu offline

## UX rules

- Mic button ≥ 48dp; không icon-only — label "Ghi âm"
- Recording: haptic/visual feedback trong 100ms
- Success: toast ngắn, không block list scroll
