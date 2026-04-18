#!/usr/bin/env bash
#
# Full stack E2E: Docker (Postgres + API + nginx UI), then API bash checks + smoke fetch UI.
#
# Usage:
#   ./scripts/e2e-full.sh
#   WEB_PORT=8090 API_PORT=8091 ./scripts/e2e-full.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

WEB_PORT="${WEB_PORT:-8090}"
API_PORT="${API_PORT:-8091}"
POSTGRES_PORT="${POSTGRES_PORT:-55432}"
export WEB_PORT API_PORT POSTGRES_PORT

echo "e2e-full: WEB_PORT=${WEB_PORT} API_PORT=${API_PORT} POSTGRES_PORT=${POSTGRES_PORT}"

wait_http() {
  local url=$1
  local name=$2
  local max=${3:-120}
  local i=0
  while [[ "${i}" -lt "${max}" ]]; do
    if curl -sf "${url}" >/dev/null 2>&1; then
      echo "e2e-full: ${name} ready (${url})"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "e2e-full: timeout waiting for ${name}: ${url}" >&2
  return 1
}

docker compose up -d db api web

wait_http "http://127.0.0.1:${WEB_PORT}/" "nginx + SPA"
wait_http "http://127.0.0.1:${API_PORT}/api/products" "FastAPI"

BASE_URL="http://127.0.0.1:${API_PORT}" "${ROOT}/scripts/e2e-api.sh"

html=$(curl -sf "http://127.0.0.1:${WEB_PORT}/" || true)
echo "${html}" | grep -qi "<!DOCTYPE html\\|<html" || {
  echo "e2e-full: UI HTML response unexpected" >&2
  exit 1
}

echo "e2e-full: ok (API script + nginx HTML)"
