#!/usr/bin/env bash
#
# First-time host setup: pass admin credentials so defaults are never committed.
# Re-runs without args reuse SEED_ADMIN_* from .env when present.
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ADMIN_USER=""
ADMIN_PASS=""

usage() {
  cat <<'EOF'
Usage: ./setup.sh --admin-user USER --admin-pass PASS [options]

Required on first install (no SEED_ADMIN_PASSWORD in .env):
  --admin-user USER   Initial admin username (stored in .env, not in git)
  --admin-pass PASS   Initial admin password

Optional environment:
  WEB_PORT            Published web port (default: 8686)
  CORS_ORIGINS        Comma-separated browser origins for API CORS

Example (new host):
  ./setup.sh --admin-user shopadmin --admin-pass 'YourStrongPass!'

Production example:
  ./setup.sh --admin-user shopadmin --admin-pass 'YourStrongPass!' \
    --cors 'https://app.gashuyhoang.io.vn,https://gashuyhoang.io.vn'

Re-run after .env exists (keeps existing admin seed vars):
  ./setup.sh
EOF
}

upsert_env_file() {
  python3 - "$ROOT/.env" "$@" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
updates = dict(pair.split("=", 1) for pair in sys.argv[2:] if "=" in pair)
lines: list[str] = []
seen: set[str] = set()
if path.exists():
    lines = path.read_text(encoding="utf-8").splitlines()
out: list[str] = []
for line in lines:
    stripped = line.strip()
    if stripped and not stripped.startswith("#") and "=" in line:
        key = line.split("=", 1)[0].strip()
        if key in updates:
            out.append(f"{key}={updates.pop(key)}")
            seen.add(key)
            continue
    out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
PY
}

env_has_seed_password() {
  python3 - "$ROOT/.env" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
if not path.exists():
    raise SystemExit(1)
for line in path.read_text(encoding="utf-8").splitlines():
    if line.startswith("SEED_ADMIN_PASSWORD="):
        raise SystemExit(0 if line.split("=", 1)[1].strip() else 1)
raise SystemExit(1)
PY
}

read_env_value() {
  python3 - "$ROOT/.env" "$2" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
if not path.exists():
    raise SystemExit(0)
for line in path.read_text(encoding="utf-8").splitlines():
    if line.startswith(f"{key}="):
        print(line.split("=", 1)[1])
        break
PY
}

CORS_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-user)
      ADMIN_USER="${2:-}"
      shift 2
      ;;
    --admin-pass)
      ADMIN_PASS="${2:-}"
      shift 2
      ;;
    --cors)
      CORS_ARG="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
fi

if [[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]]; then
  upsert_env_file \
    "SEED_ADMIN_USERNAME=$ADMIN_USER" \
    "SEED_ADMIN_PASSWORD=$ADMIN_PASS"
elif ! env_has_seed_password; then
  echo "error: first-time setup requires --admin-user and --admin-pass" >&2
  usage >&2
  exit 1
fi

if [[ -n "$CORS_ARG" ]]; then
  upsert_env_file "CORS_ORIGINS=$CORS_ARG"
fi

export WEB_PORT="${WEB_PORT:-8686}"
if [[ -z "${CORS_ORIGINS:-}" ]]; then
  CORS_FROM_FILE="$(read_env_value "$ROOT/.env" CORS_ORIGINS || true)"
  export CORS_ORIGINS="${CORS_FROM_FILE:-http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT},http://localhost:5173,http://127.0.0.1:5173}"
fi

docker compose down
docker compose up --build -d

SEED_USER="$(read_env_value "$ROOT/.env" SEED_ADMIN_USERNAME || true)"
SEED_USER="${SEED_USER:-$ADMIN_USER}"

printf '\nStack is up. Web UI: http://localhost:%s\n' "${WEB_PORT}"
printf 'Admin login: user=%s (password set at setup — not printed)\n' "${SEED_USER}"
