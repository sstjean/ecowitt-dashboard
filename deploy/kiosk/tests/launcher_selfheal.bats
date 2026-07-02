#!/usr/bin/env bats
# deploy/kiosk/tests/launcher_selfheal.bats
# T017 (US2): guard the vendored launcher against regressions in its
# self-heal loop and keyring-suppression flag.

setup() {
  LAUNCHER="$(cd "$BATS_TEST_DIRNAME/.." && pwd)/bin/kiosk-weather"
}

@test "launcher exists and is executable" {
  [ -x "$LAUNCHER" ]
}

@test "launcher relaunches Chrome via a while-true loop with sleep 2 (FR-012)" {
  grep -q 'while true' "$LAUNCHER"
  grep -Eq 'sleep[[:space:]]+2' "$LAUNCHER"
}

@test "launcher suppresses the GNOME keyring via --password-store=basic (FR-010)" {
  grep -q -- '--password-store=basic' "$LAUNCHER"
}

@test "launcher renders native Wayland at device-scale 1" {
  grep -q -- '--ozone-platform=wayland' "$LAUNCHER"
  grep -q -- '--force-device-scale-factor=1' "$LAUNCHER"
}

@test "launcher curl-waits for KIOSK_URL reachability before launching Chrome (US3 FR-015/016)" {
  # A reachability probe must exist...
  grep -Eq 'curl -fsS' "$LAUNCHER"
  # ...and it must run BEFORE the first Chrome invocation so a server-down-at-boot
  # shows a wait rather than a dead error page.
  curl_line=$(grep -n 'curl -fsS' "$LAUNCHER" | head -1 | cut -d: -f1)
  chrome_line=$(grep -n 'google-chrome-stable' "$LAUNCHER" | head -1 | cut -d: -f1)
  [ "$curl_line" -lt "$chrome_line" ]
}

@test "launcher reachability wait is a bounded until-loop with a sleep (US3 FR-016/017)" {
  grep -Eq 'until[[:space:]]+curl -fsS' "$LAUNCHER"
  grep -Eq 'curl -fsS[^|]*--max-time' "$LAUNCHER"
}
