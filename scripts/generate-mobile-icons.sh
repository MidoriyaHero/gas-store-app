#!/usr/bin/env bash
# Generate Expo mobile icon, adaptive icon, and splash from repo-root logo.png.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${LOGO_SRC:-$ROOT/logo.png}"
ASSETS="$ROOT/mobile/assets"
SIZE=1024

if [[ ! -f "$SRC" ]]; then
  echo "Logo not found: $SRC (set LOGO_SRC to override)" >&2
  exit 1
fi

mkdir -p "$ASSETS"

resize_square() {
  local input="$1"
  local output="$2"
  local size="$3"
  if command -v magick >/dev/null 2>&1; then
    magick "$input" -resize "${size}x${size}" "$output"
  elif command -v convert >/dev/null 2>&1; then
    convert "$input" -resize "${size}x${size}" "$output"
  elif [[ -x /usr/bin/sips ]]; then
    cp "$input" "$output"
    /usr/bin/sips -z "$size" "$size" "$output" >/dev/null
  elif command -v sips >/dev/null 2>&1; then
    cp "$input" "$output"
    sips -z "$size" "$size" "$output" >/dev/null
  else
    python3 - <<PY
from PIL import Image
img = Image.open("$input").convert("RGBA")
img = img.resize(($size, $size), Image.LANCZOS)
img.save("$output")
PY
  fi
}

echo "Source: $SRC"
echo "Output: $ASSETS"

resize_square "$SRC" "$ASSETS/icon.png" "$SIZE"
resize_square "$SRC" "$ASSETS/adaptive-icon.png" "$SIZE"
resize_square "$SRC" "$ASSETS/splash-icon.png" "$SIZE"

echo "Done. Run: cd mobile && npx expo prebuild --platform android --no-install"
