#!/usr/bin/env bash
# Build a signed Android release APK locally (mirrors CI mobile-release workflow).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/mobile"
ANDROID="$MOBILE/android"
KEYSTORE="$ANDROID/app/release.keystore"
PROPS="$ANDROID/keystore.properties"

if [[ -z "${EXPO_PUBLIC_API_URL:-}" ]]; then
  echo "Set EXPO_PUBLIC_API_URL (HTTPS production API, no trailing slash)." >&2
  echo "Example: EXPO_PUBLIC_API_URL=https://api.example.com $0" >&2
  exit 1
fi

if [[ ! -f "$PROPS" ]]; then
  echo "Missing $PROPS — copy keystore.properties.example and fill values." >&2
  exit 1
fi

if [[ ! -f "$KEYSTORE" ]]; then
  echo "Missing $KEYSTORE — place release keystore at mobile/android/app/release.keystore" >&2
  exit 1
fi

echo "API URL: $EXPO_PUBLIC_API_URL"
echo "Building release APK..."

(cd "$MOBILE" && npm ci)
(cd "$ANDROID" && chmod +x gradlew && ./gradlew assembleRelease --no-daemon)

APK="$ANDROID/app/build/outputs/apk/release/app-release.apk"
if [[ -f "$APK" ]]; then
  echo "APK: $APK"
  ls -lh "$APK"
else
  echo "Build finished but APK not found at $APK" >&2
  exit 1
fi
