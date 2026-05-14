#!/usr/bin/env bash
#
# Stops the stack, rebuilds images, and starts services in detached mode.
# Default published web port is 8686; override with WEB_PORT if needed.
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

export WEB_PORT="${WEB_PORT:-8686}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT},http://localhost:5173,http://127.0.0.1:5173}"

docker compose down
docker compose up --build -d

printf '\nStack is up. Web UI: http://localhost:%s\n' "${WEB_PORT}"
