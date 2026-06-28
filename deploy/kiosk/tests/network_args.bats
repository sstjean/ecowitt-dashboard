#!/usr/bin/env bats
# deploy/kiosk/tests/network_args.bats
# T019 (US3): configure_network must build the nmcli invocation with the
# durable system-WLAN properties and disable IoT auto-join — without ever
# logging the PSK. A mocked nmcli records its args; a dummy PSK is used.

setup() {
  KIOSK_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  STUB="$(mktemp -d)"
  export NMCLI_LOG="$STUB/nmcli.args"

  # Mock nmcli: profile listing returns both known profiles (so modify paths
  # are exercised); every other invocation appends its args to NMCLI_LOG.
  cat > "$STUB/nmcli" <<'STUBEOF'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *"con show"*) printf 'marbles\nMarbles-iot\n'; exit 0 ;;
esac
echo "$args" >> "$NMCLI_LOG"
exit 0
STUBEOF
  chmod +x "$STUB/nmcli"
  export PATH="$STUB:$PATH"

  # shellcheck disable=SC1090
  source "$KIOSK_DIR/lib/common.sh"
  # shellcheck disable=SC1090
  source "$KIOSK_DIR/lib/network.sh"

  export KIOSK_WIFI_SSID="marbles"
  export KIOSK_IOT_SSID="Marbles-iot"
  export KIOSK_WIFI_PSK="DUMMYPSK123456"
}

teardown() { rm -rf "$STUB"; }

@test "main WLAN gets system-stored secret (psk-flags 0)" {
  run configure_network
  [ "$status" -eq 0 ]
  grep -q 'psk-flags 0' "$NMCLI_LOG"
}

@test "main WLAN gets autoconnect priority 10 and powersave disabled (2)" {
  run configure_network
  grep -q 'autoconnect-priority 10' "$NMCLI_LOG"
  grep -q '802-11-wireless.powersave 2' "$NMCLI_LOG"
}

@test "IoT WLAN is set to never auto-join" {
  run configure_network
  grep -q 'Marbles-iot connection.autoconnect no' "$NMCLI_LOG"
}

@test "the PSK value is never logged to stdout/stderr" {
  run configure_network
  [[ "$output" != *"DUMMYPSK123456"* ]]
}
