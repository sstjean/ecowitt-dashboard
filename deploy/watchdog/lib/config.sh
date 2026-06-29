#!/usr/bin/env bash
# deploy/watchdog/lib/config.sh
# Pinned default knobs for the watchdog (data-model.md §2). Sourced by the
# orchestrator and provision.sh. `watchdog_load_config` applies defaults for any
# unset knob and validates numeric knobs, falling back to the default (with a
# WARN) on a malformed value so a bad env edit can never crash the watchdog.
#
# Requires common.sh (default_env, warn) to be sourced first. Written for
# bash 3.2+ portability (no associative arrays): the macOS test runner uses
# bash 3.2; the Ubuntu host uses bash 5.x.

# _watchdog_validate_numeric VAR DEFAULT
#   If VAR is unset → set to DEFAULT. If set but not a non-negative integer →
#   WARN and reset to DEFAULT. Otherwise keep the operator's value.
_watchdog_validate_numeric() {
  local var="$1" def="$2" val="${!1:-}"
  if [[ -z "$val" ]]; then
    printf -v "$var" '%s' "$def"
  elif [[ ! "$val" =~ ^[0-9]+$ ]]; then
    warn "$var='$val' is not a non-negative integer; using default $def"
    printf -v "$var" '%s' "$def"
  fi
  export "${var?}"
}

# watchdog_load_config — resolve every knob to a usable value.
watchdog_load_config() {
  # String knobs: plain defaults.
  default_env WATCHDOG_PROJECT      "ecowitt-dashboard"
  default_env WATCHDOG_DB_PATH      "/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite"
  default_env WATCHDOG_STATE_PATH   "/var/lib/ecowitt-watchdog/state.json"
  default_env WATCHDOG_BASE_URL     "http://localhost:8090"

  # Numeric knobs: default + validate (warn-and-default on malformed).
  _watchdog_validate_numeric WATCHDOG_POLLER_MAX_AGE_SECONDS   300
  _watchdog_validate_numeric WATCHDOG_HTTP_FAIL_THRESHOLD      3
  _watchdog_validate_numeric WATCHDOG_RESTART_COOLDOWN_SECONDS 600
  _watchdog_validate_numeric WATCHDOG_RESTART_WINDOW_SECONDS   3600
  _watchdog_validate_numeric WATCHDOG_RESTART_WINDOW_CAP       3
  _watchdog_validate_numeric WATCHDOG_INTERVAL_SECONDS         60
}
