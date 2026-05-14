#!/usr/bin/env bash
# Smoke test stack over HTTP only (no browser). Requires web + api up (e.g. docker compose).
# Usage: SMOKETEST_URL=http://127.0.0.1:8686 ./scripts/smoke-http.sh
# Default SMOKETEST_URL matches docker-compose WEB_PORT (8686).

set -euo pipefail

BASE="${SMOKETEST_URL:-http://127.0.0.1:8686}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

echo "==> GET $BASE/login (expect SPA shell)"
curl -sfL "$BASE/login" | grep -q "Gas Huy Hoàng" || {
  echo "FAIL: /login HTML missing app title. Wrong port? Try SMOKETEST_URL=http://127.0.0.1:8686"
  exit 1
}

echo "==> POST $BASE/api/auth/login"
curl -sf -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' >/dev/null

echo "==> GET $BASE/api/dashboard"
curl -sf -b "$JAR" "$BASE/api/dashboard" | grep -q '"orders"' || {
  echo "FAIL: /api/dashboard JSON missing orders"
  exit 1
}

echo "==> GET $BASE/api/debt-aging"
curl -sf -b "$JAR" "$BASE/api/debt-aging" | grep -q '\[' || {
  echo "FAIL: /api/debt-aging not a JSON array"
  exit 1
}

echo "OK smoke-http (no browser): $BASE"
