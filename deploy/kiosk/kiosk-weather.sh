#!/usr/bin/env bash
# Self-healing full-screen kiosk launcher for the Ecowitt weather dashboard.
# Runs as the `kiosk` user from a GNOME autostart entry. Waits for the
# dashboard to answer, then keeps Chromium alive in a restart loop so a crash,
# snap update, or transient network blip can never leave the wall display blank.
set -u

URL="${KIOSK_URL:-http://192.168.10.5:8090/}"
PROFILE="$HOME/.config/kiosk-chromium"

# Pick whatever Chromium binary exists on this box.
CHROME=""
for c in chromium-browser chromium google-chrome; do
  if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "kiosk-weather: no chromium binary found" >&2
  exit 1
fi

# Don't show a blank/error page on boot before the stack is up: wait for it.
until curl -fsS --max-time 5 -o /dev/null "$URL"; do
  echo "kiosk-weather: waiting for $URL ..."
  sleep 3
done

# Clear any "exited cleanly = false" flag so no crash-restore bubble appears.
clear_crash_flag() {
  local prefs="$PROFILE/Default/Preferences"
  if [ -f "$prefs" ]; then
    sed -i \
      -e 's/"exited_cleanly":false/"exited_cleanly":true/' \
      -e 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' \
      "$prefs" 2>/dev/null || true
  fi
}

while true; do
  clear_crash_flag
  "$CHROME" \
    --user-data-dir="$PROFILE" \
    --kiosk --start-fullscreen \
    --noerrdialogs --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --no-first-run --fast --fast-start \
    --check-for-update-interval=31536000 \
    --overscroll-history-navigation=0 \
    "$URL"
  echo "kiosk-weather: chromium exited ($?); relaunching in 3s ..."
  sleep 3
done
