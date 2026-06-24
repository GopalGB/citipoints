#!/usr/bin/env bash
#
# Dev launcher for CITI Points v2. Boots the FastAPI backend and the Next.js
# frontend in parallel, streaming their output. Ctrl-C gracefully stops both.
#
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

API_DIR="$here/apps/api"
WEB_DIR="$here/apps/web"

seed_if_missing() {
  if [[ ! -f "$API_DIR/data/transactions.csv" ]]; then
    echo "→ seeding synthetic data (first run only)…"
    (cd "$API_DIR" && uv run python -m citipoints_api.data.seed)
  fi
}

start_api() {
  (cd "$API_DIR" && uv run uvicorn citipoints_api.main:app --host 0.0.0.0 --port 8000 --reload) &
  API_PID=$!
  echo "• API booting at http://localhost:8000  (pid $API_PID)"
}

start_web() {
  (cd "$WEB_DIR" && pnpm dev) &
  WEB_PID=$!
  echo "• Web booting at http://localhost:3000  (pid $WEB_PID)"
}

cleanup() {
  echo
  echo "→ shutting down…"
  if [[ -n "${API_PID:-}" ]]; then kill -TERM "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill -TERM "$WEB_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

seed_if_missing
start_api
start_web
wait
