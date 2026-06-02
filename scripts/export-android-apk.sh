#!/usr/bin/env bash
# Build Android release APK and copy to mobile/dist with a dated filename.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/mobile"
ANDROID="$MOBILE/android"
DIST="$MOBILE/dist"
API_URL="${EXPO_PUBLIC_API_URL:-https://api.gashuyhoang.io.vn}"
DATE="$(date +%Y-%m-%d)"
HOST="$(printf '%s' "$API_URL" | sed -E 's#^https?://##' | sed 's#/.*##' | tr '.' '-')"

echo "API URL: $API_URL"
echo "Build date: $DATE"

export EXPO_PUBLIC_API_URL="$API_URL"
(cd "$ANDROID" && chmod +x gradlew && ./gradlew assembleRelease --no-daemon)

SRC="$ANDROID/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$SRC" ]]; then
  echo "APK not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DIST"
OUT="$DIST/gas-store-mobile-${HOST}-${DATE}.apk"
cp "$SRC" "$OUT"
touch "$OUT"
echo "APK: $OUT"
ls -lh "$OUT"
