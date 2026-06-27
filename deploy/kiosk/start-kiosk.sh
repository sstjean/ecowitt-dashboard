#!/usr/bin/env bash
# Launch Chromium full-screen on the Ecowitt dashboard for the wall display.
# Invoked at login by ~/.config/autostart/ecowitt-kiosk.desktop.
set -euo pipefail

DASHBOARD_URL="http://192.168.10.5:8090/"

# Keep the screen awake (no blanking / DPMS) for a permanent kiosk.
xset s off || true
xset -dpms || true
xset s noblank || true

# Hide the mouse cursor when idle.
command -v unclutter >/dev/null 2>&1 && unclutter -idle 1 &

# Chromium flavour differs by install (snap vs apt). Pick whichever exists.
CHROME_BIN="$(command -v chromium-browser || command -v chromium || command -v google-chrome || true)"
if [[ -z "${CHROME_BIN}" ]]; then
  echo "No Chromium/Chrome binary found. Install with: sudo apt install -y chromium-browser" >&2
  exit 1
fi

# Wait for the dashboard to be reachable before launching (handles a cold boot
# where the network/server isn't up yet).
until curl -sSf -m 3 -o /dev/null "${DASHBOARD_URL}"; do
  sleep 3
done

exec "${CHROME_BIN}" \
  --kiosk \
  --app="${DASHBOARD_URL}" \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0
