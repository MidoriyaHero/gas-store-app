# ADR: Mobile offline sync (Gas Store)

## ADR-001 Mobile Bearer auth

Mobile clients use `POST /api/auth/mobile/login|refresh` returning tokens in JSON. Web keeps httpOnly cookies. `get_current_user` accepts Bearer or cookie.

## ADR-005 Serial sync + ACID

Each `POST /api/sync/push` mutation runs in one DB transaction with `SELECT FOR UPDATE` on the target row. A process-wide lock serializes push handling (low traffic).

## ADR-006 order_change_log

Append-only log written in the same transaction as order updates (web, mobile, sync).

## ADR-007 Timezone UTC+7

Business dates (`delivery_date`, `business_date`, debt payment day) use `app/timezone.py` (`Asia/Ho_Chi_Minh` offset +7).

## ADR-008 Voice MP3 32kbps

Mobile encodes voice notes as `.mp3` ~32 kbps before upload.

## ADR-009 Monorepo mobile/, single-device v1

No multi-device conflict resolution in v1.
