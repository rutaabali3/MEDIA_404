@echo off
echo MediaGrab 404 — starting...
if not exist node_modules (
  echo First run: installing dependencies...
  call npm install --no-audit --no-fund
)
node server.js
pause
