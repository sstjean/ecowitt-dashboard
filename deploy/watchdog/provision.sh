#!/usr/bin/env bash
# deploy/watchdog/provision.sh
# Single documented entry point to install the Ecowitt container watchdog on the
# host (FR-001/011/013). Idempotent host-OS provisioning — run as root.
#
#   sudo deploy/watchdog/provision.sh
#   # optional overrides via env or deploy/watchdog/.env (gitignored):
#   sudo WATCHDOG_INTERVAL_SECONDS=90 deploy/watchdog/provision.sh
#
# Exit codes: 0 success | 1 usage/invalid input (malformed knob)
#             | 2 preflight (not root, missing docker/python3)
#             | 3 a provisioning step failed.   See contracts/provision-cli.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# --- Canonical install paths (overridable for tests; data-model.md §6) -------
: "${WATCHDOG_PREFIX_BIN:=/usr/local/bin}"
: "${WATCHDOG_PREFIX_LIB:=/usr/local/lib/ecowitt-watchdog}"
: "${WATCHDOG_SYSTEMD_DIR:=/etc/systemd/system}"
: "${WATCHDOG_CONFIG_DIR:=/etc/ecowitt-watchdog}"
: "${WATCHDOG_STATE_DIR:=/var/lib/ecowitt-watchdog}"
: "${WATCHDOG_INSTALL_OWNER:=root:root}"

# --- Preflight --------------------------------------------------------------
_assert_numeric() {
  local var="$1" val="${!1:-}"
  [[ -z "$val" || "$val" =~ ^[0-9]+$ ]] \
    || die "invalid $var='$val' (need a non-negative integer)" 1
}

preflight() {
  [[ "$(id -u)" -eq 0 ]] || die "must run as root (use sudo)" 2
  command -v docker  >/dev/null 2>&1 || die "docker not found in PATH" 2
  command -v python3 >/dev/null 2>&1 || die "python3 not found in PATH" 2
  _assert_numeric WATCHDOG_POLLER_MAX_AGE_SECONDS
  _assert_numeric WATCHDOG_HTTP_FAIL_THRESHOLD
  _assert_numeric WATCHDOG_RESTART_COOLDOWN_SECONDS
  _assert_numeric WATCHDOG_RESTART_WINDOW_SECONDS
  _assert_numeric WATCHDOG_RESTART_WINDOW_CAP
  _assert_numeric WATCHDOG_INTERVAL_SECONDS
  log "preflight ok: root, docker + python3 present, knob values valid"
}

# --- Install steps ----------------------------------------------------------
install_artifacts() {
  local o="$WATCHDOG_INSTALL_OWNER" lib
  install_file "$SCRIPT_DIR/bin/ecowitt-watchdog-run" \
    "$WATCHDOG_PREFIX_BIN/ecowitt-watchdog-run" 0755 "$o"
  install_file "$SCRIPT_DIR/bin/freshness.py" \
    "$WATCHDOG_PREFIX_LIB/freshness.py" 0755 "$o"
  install_file "$SCRIPT_DIR/bin/state.py" \
    "$WATCHDOG_PREFIX_LIB/state.py" 0755 "$o"
  for lib in "$SCRIPT_DIR"/lib/*.sh; do
    install_file "$lib" "$WATCHDOG_PREFIX_LIB/lib/$(basename "$lib")" 0644 "$o"
  done
}

install_units() {
  local o="$WATCHDOG_INSTALL_OWNER" timer interval
  install_file "$SCRIPT_DIR/systemd/ecowitt-watchdog.service" \
    "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.service" 0644 "$o"
  timer="$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer"
  install_file "$SCRIPT_DIR/systemd/ecowitt-watchdog.timer" "$timer" 0644 "$o"
  # A .timer cannot read EnvironmentFile, so apply the configured interval by
  # substituting the placeholder in the installed unit (content-stable on re-run
  # because the template is re-copied first). -i.bak works on both BSD + GNU sed.
  interval="${WATCHDOG_INTERVAL_SECONDS:-60}"
  sed -i.bak "s/__WATCHDOG_INTERVAL_SECONDS__/${interval}/g" "$timer"
  rm -f "$timer.bak"
  log "timer interval set to ${interval}s"
}

install_config() {
  local env_dst="$WATCHDOG_CONFIG_DIR/watchdog.env"
  if [[ -f "$env_dst" ]]; then
    log "config already present, leaving untouched: $env_dst"
  else
    install_file "$SCRIPT_DIR/.env.example" "$env_dst" 0644 \
      "$WATCHDOG_INSTALL_OWNER"
    log "wrote default config: $env_dst"
  fi
  install -d -m 0755 "$WATCHDOG_STATE_DIR" \
    || die "failed to create state dir $WATCHDOG_STATE_DIR" 3
}

enable_timer() {
  systemctl daemon-reload || die "systemctl daemon-reload failed" 3
  systemctl enable --now ecowitt-watchdog.timer \
    || die "failed to enable ecowitt-watchdog.timer" 3
  log "ecowitt-watchdog.timer enabled and started"
}

postflight() {
  log "watchdog provisioned. Verify with:"
  log "  systemctl status ecowitt-watchdog.timer"
  log "  journalctl -u ecowitt-watchdog.service -f"
}

# --- Orchestration ----------------------------------------------------------
main() {
  local env_file="${WATCHDOG_ENV_FILE:-$SCRIPT_DIR/.env}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  preflight
  install_artifacts
  install_units
  install_config
  enable_timer
  postflight
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
