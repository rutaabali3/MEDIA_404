#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "MediaGrab 404 — starting..."
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies..."
  npm install --no-audit --no-fund
fi
exec node server.js
