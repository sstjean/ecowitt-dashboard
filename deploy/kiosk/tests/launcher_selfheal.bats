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
