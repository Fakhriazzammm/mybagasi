#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/mybagasi"
SCRAPER_DIR="$APP_DIR/scraper"
VENV_PY="$SCRAPER_DIR/.venv/bin/python"

cd "$APP_DIR"

echo "[deploy] Syncing repository to origin/main"
git fetch origin
git checkout main
git reset --hard origin/main

echo "[deploy] Installing backend dependencies"
"$VENV_PY" -m pip install -r "$SCRAPER_DIR/requirements.txt"

echo "[deploy] Restarting backend service"
sudo systemctl daemon-reload
sudo systemctl restart mybagasi-scraper

echo "[deploy] Health check"
curl -fsS http://127.0.0.1:8000/health > /dev/null

echo "[deploy] Done"
