#!/usr/bin/env bats
# deploy/kiosk/tests/provision_preflight.bats
# T006 (RED-before-GREEN): provision.sh preflight must fail fast on missing
# required inputs and must NEVER print the WiFi PSK. Root/OS checks are mocked
# via PATH stubs (id, uname) and a fake os-release file.

setup() {
  KIOSK_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  STUB="$(mktemp -d)"

  # Mock the privilege + arch probes so preflight reaches the env check.
  printf '#!/usr/bin/env bash\necho 0\n'      > "$STUB/id";    chmod +x "$STUB/id"
  printf '#!/usr/bin/env bash\necho x86_64\n' > "$STUB/uname"; chmod +x "$STUB/uname"

  # Fake Ubuntu 24.04 os-release; point provision.sh at it.
  printf 'VERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n' > "$STUB/os-release"
  export KIOSK_OS_RELEASE="$STUB/os-release"

  # Never source a developer's local .env during the test.
  export KIOSK_ENV_FILE=/dev/null
  export PATH="$STUB:$PATH"
}

teardown() { rm -rf "$STUB"; }

@test "preflight exits 1 when KIOSK_WIFI_SSID and KIOSK_WIFI_PSK are missing" {
  run env -u KIOSK_WIFI_SSID -u KIOSK_WIFI_PSK bash "$KIOSK_DIR/provision.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing required input"* ]]
}

@test "preflight names the missing SSID variable" {
  run env -u KIOSK_WIFI_SSID KIOSK_WIFI_PSK="x" bash "$KIOSK_DIR/provision.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"KIOSK_WIFI_SSID"* ]]
}

@test "preflight never prints the PSK value" {
  run env -u KIOSK_WIFI_SSID KIOSK_WIFI_PSK="SUPERSECRET12345" bash "$KIOSK_DIR/provision.sh"
  [ "$status" -eq 1 ]
  [[ "$output" != *"SUPERSECRET12345"* ]]
}
