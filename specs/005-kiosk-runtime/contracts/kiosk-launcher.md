# Contract: `kiosk-weather` (launcher)

Canonical target: `/usr/local/bin/kiosk-weather` (0755 root). Captured
verbatim at `/tmp/kiosk-capture/kiosk-weather`; vendored at
`deploy/kiosk/bin/kiosk-weather`.

## Exact launcher (as shipped)

```bash
#!/usr/bin/env bash
set -u
URL="${KIOSK_URL:-http://192.168.10.5:8090/}"
FLAGS=(
  --password-store=basic
  --kiosk
  --ozone-platform=wayland
  --force-device-scale-factor=1
  --noerrdialogs --disable-infobars
  --disable-session-crashed-bubble
  --disable-features=TranslateUI
  --no-first-run --fast --fast-start
  --check-for-update-interval=31536000
  --overscroll-history-navigation=0
  --user-data-dir=/home/kiosk/.config/kiosk-chrome
)
if [ "${KIOSK_DEBUG:-0}" = "1" ]; then
  FLAGS+=(--remote-debugging-port=9222 --remote-allow-origins=*)
fi
while true; do
  /usr/bin/google-chrome-stable "${FLAGS[@]}" "$URL"
  echo "kiosk-weather: chrome exited ($?), relaunching in 2s" >&2
  sleep 2
done
```

## Guarantees

- **Self-heal (browser)**: the `while true` loop relaunches Chrome 2 s after
  any exit, without tearing down cage (FR-012, SC-003).
- **No keyring block**: `--password-store=basic` removes the GNOME-keyring
  dialog on cold boot (FR-010) — the critical flag.
- **Native render**: `--ozone-platform=wayland` + `--force-device-scale-factor=1`
  → full 2160×1440 at dpr=1 (FR-009).
- **No chrome/UI**: `--kiosk`, `--noerrdialogs`, `--disable-infobars`,
  `--disable-session-crashed-bubble`, `--disable-features=TranslateUI`,
  `--no-first-run` (FR-008).
- **Unreachable dashboard**: if `KIOSK_URL` is down at boot, Chrome shows its
  error page and the kiosk keeps running; once the dashboard returns it loads
  on the next navigation/refresh (FR-014). (Chrome auto-retries connection
  errors; no human needed.)

## Inputs

| Env | Default | Effect |
|-----|---------|--------|
| `KIOSK_URL` | `http://192.168.10.5:8090/` | page opened |
| `KIOSK_DEBUG` | `0` | `1` → enable CDP on :9222 for measurement |

## Invariants

- Profile dir is fixed: `/home/kiosk/.config/kiosk-chrome` (owned by kiosk).
- Flag set is fixed except for the two documented env overrides.
