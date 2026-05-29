#!/usr/bin/env bash
# Export OpenAPI from running API and generate TypeScript types for mobile/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/mobile/src/api/generated"
SPEC="$ROOT/openapi/openapi.json"
BASE_URL="${OPENAPI_URL:-http://localhost:8000/openapi.json}"

mkdir -p "$ROOT/openapi" "$OUT_DIR"
echo "Fetching OpenAPI from $BASE_URL"
curl -fsSL "$BASE_URL" -o "$SPEC"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found; wrote spec to $SPEC only"
  exit 0
fi

(cd "$ROOT/mobile" && npx --yes openapi-typescript "$SPEC" -o "$OUT_DIR/schema.d.ts")
echo "Generated $OUT_DIR/schema.d.ts"
