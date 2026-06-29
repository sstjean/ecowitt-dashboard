#!/usr/bin/env bash
# deploy/watchdog/rollback.sh
# Cleanly removes the Ecowitt container watchdog from the host (FR-012). Run as
# root. Idempotent — re-running with everything already removed is a clean
# no-op.  See contracts/rollback-cli.md.
#
#   sudo deploy/watchdog/rollback.sh           # remove units + scripts, keep state/config
#   sudo deploy/watchdog/rollback.sh --purge   # also remove /etc + /var/lib state
#
# Exit codes: 0 success (removed or already-absent) | 2 not root
#             | 3 a removal step failed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

: "${WATCHDOG_PREFIX_BIN:=/usr/local/bin}"
: "${WATCHDOG_PREFIX_LIB:=/usr/local/lib/ecowitt-watchdog}"
: "${WATCHDOG_SYSTEMD_DIR:=/etc/systemd/system}"
: "${WATCHDOG_CONFIG_DIR:=/etc/ecowitt-watchdog}"
: "${WATCHDOG_STATE_DIR:=/var/lib/ecowitt-watchdog}"

PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1

main() {
  [[ "$(id -u)" -eq 0 ]] || die "must run as root (use sudo)" 2

  # Stop + disable the timer/service; tolerate already-absent units.
  systemctl disable --now ecowitt-watchdog.timer >/dev/null 2>&1 || true
  systemctl stop ecowitt-watchdog.service >/dev/null 2>&1 || true

  rm -f "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.service" \
        "$WATCHDOG_SYSTEMD_DIR/ecowitt-watchdog.timer" \
    || die "failed to remove systemd units" 3
  systemctl daemon-reload >/dev/null 2>&1 || true

  rm -f "$WATCHDOG_PREFIX_BIN/ecowitt-watchdog-run" \
    || die "failed to remove orchestrator" 3
  rm -rf "$WATCHDOG_PREFIX_LIB" \
    || die "failed to remove $WATCHDOG_PREFIX_LIB" 3
  log "removed watchdog units, orchestrator, and libs"

  if (( PURGE )); then
    rm -rf "$WATCHDOG_CONFIG_DIR" "$WATCHDOG_STATE_DIR" \
      || die "failed to purge config/state" 3
    log "purged config + state directories"
  else
    log "kept config ($WATCHDOG_CONFIG_DIR) and state ($WATCHDOG_STATE_DIR); use --purge to remove"
  fi

  log "rollback complete"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
