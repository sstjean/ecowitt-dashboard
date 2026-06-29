#!/usr/bin/env bats
# deploy/watchdog/tests/config_validation.bats
# T005 (RED-before-GREEN): lib/config.sh must supply pinned defaults for every
# knob and must fall back to the default (with a logged WARN, never crashing)
# when a numeric knob is malformed.

setup() {
  WD_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  # Probe helper: source common + config, then echo a requested var. WARN goes
  # to stderr and is silenced here so $output is exactly the resolved value.
  probe() {
    local var="$1"
    bash -c '
      set -euo pipefail
      source "'"$WD_DIR"'/lib/common.sh"
      source "'"$WD_DIR"'/lib/config.sh"
      watchdog_load_config 2>/dev/null
      printf "%s" "${'"$var"'}"
    '
  }
}

@test "unset WATCHDOG_PROJECT resolves to ecowitt-dashboard" {
  run env -u WATCHDOG_PROJECT bash -c "$(declare -f probe); $(typeset -p WD_DIR 2>/dev/null); probe WATCHDOG_PROJECT"
  [ "$status" -eq 0 ]
  [ "$output" = "ecowitt-dashboard" ]
}

@test "unset WATCHDOG_POLLER_MAX_AGE_SECONDS resolves to 300" {
  run env -u WATCHDOG_POLLER_MAX_AGE_SECONDS bash -c "$(declare -f probe); WD_DIR='$WD_DIR'; probe WATCHDOG_POLLER_MAX_AGE_SECONDS"
  [ "$status" -eq 0 ]
  [ "$output" = "300" ]
}

@test "unset WATCHDOG_HTTP_FAIL_THRESHOLD resolves to 3" {
  run env -u WATCHDOG_HTTP_FAIL_THRESHOLD bash -c "$(declare -f probe); WD_DIR='$WD_DIR'; probe WATCHDOG_HTTP_FAIL_THRESHOLD"
  [ "$status" -eq 0 ]
  [ "$output" = "3" ]
}

@test "unset WATCHDOG_INTERVAL_SECONDS resolves to 60" {
  run env -u WATCHDOG_INTERVAL_SECONDS bash -c "$(declare -f probe); WD_DIR='$WD_DIR'; probe WATCHDOG_INTERVAL_SECONDS"
  [ "$status" -eq 0 ]
  [ "$output" = "60" ]
}

@test "an operator override of a numeric knob is honoured" {
  run env WATCHDOG_POLLER_MAX_AGE_SECONDS=120 bash -c "$(declare -f probe); WD_DIR='$WD_DIR'; probe WATCHDOG_POLLER_MAX_AGE_SECONDS"
  [ "$status" -eq 0 ]
  [ "$output" = "120" ]
}

@test "a malformed numeric knob falls back to its default (does not crash)" {
  run env WATCHDOG_POLLER_MAX_AGE_SECONDS=foo bash -c "$(declare -f probe); WD_DIR='$WD_DIR'; probe WATCHDOG_POLLER_MAX_AGE_SECONDS"
  [ "$status" -eq 0 ]
  [ "$output" = "300" ]
}

@test "a malformed numeric knob logs a WARN" {
  run bash -c '
    set -euo pipefail
    source "'"$WD_DIR"'/lib/common.sh"
    source "'"$WD_DIR"'/lib/config.sh"
    WATCHDOG_HTTP_FAIL_THRESHOLD=notanumber watchdog_load_config 2>&1 1>/dev/null
  '
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARN"* ]]
  [[ "$output" == *"WATCHDOG_HTTP_FAIL_THRESHOLD"* ]]
}

@test "a negative numeric knob falls back to its default" {
  run env WATCHDOG_RESTART_WINDOW_CAP=-2 bash -c "$(declare -f probe); WD_DIR='$WD_DIR'; probe WATCHDOG_RESTART_WINDOW_CAP"
  [ "$status" -eq 0 ]
  [ "$output" = "3" ]
}
