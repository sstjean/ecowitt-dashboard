#!/usr/bin/env bash
# deploy/watchdog/lib/common.sh
# Shared helpers for the container watchdog. Sourced (never executed) by the
# orchestrator (bin/ecowitt-watchdog-run), provision.sh, rollback.sh, and the
# lib/*.sh step modules. No side effects on source. Mirrors deploy/kiosk idioms.

# --- Logging (journal-friendly) ---------------------------------------------
# Everything goes to stdout/stderr so systemd captures it in the journal with a
# timestamp (FR-010). We prefix a tag + an ISO-8601 UTC timestamp so each line
# is self-describing even outside journald.
_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log()  { printf '[watchdog] %s %s\n'        "$(_ts)" "$*"; }
warn() { printf '[watchdog] %s WARN: %s\n'  "$(_ts)" "$*" >&2; }

# Loud, cap-hit / operator-attention log line (US3 / SC-005). Distinct marker so
# `journalctl -p warning` and grep can surface persistent outages.
loud() { printf '[watchdog] %s ALERT: %s\n' "$(_ts)" "$*" >&2; }

# die <message> [exit-code]   (default exit code 3 = step failure)
die() {
  local msg="$1" code="${2:-3}"
  printf '[watchdog] %s ERROR: %s\n' "$(_ts)" "$msg" >&2
  exit "$code"
}

# --- Input validation -------------------------------------------------------
# require_env VAR...  — exit 1 (usage) if any named var is empty/unset.
require_env() {
  local var missing=()
  for var in "$@"; do
    [[ -n "${!var:-}" ]] || missing+=("$var")
  done
  (( ${#missing[@]} == 0 )) || die "missing required input(s): ${missing[*]}" 1
}

# default_env VAR VALUE  — set VAR to VALUE only if currently empty/unset.
default_env() {
  local var="$1" val="$2"
  [[ -n "${!var:-}" ]] || printf -v "$var" '%s' "$val"
  export "${var?}"
}

# --- Lib / bin path resolution ----------------------------------------------
# The watchdog runs in two contexts with different on-disk layouts:
#   * repo-dev:   deploy/watchdog/lib/*.sh + deploy/watchdog/bin/*.py
#   * installed:  /usr/local/lib/ecowitt-watchdog/lib/*.sh
#                 + /usr/local/lib/ecowitt-watchdog/*.py
# The orchestrator bootstraps WATCHDOG_LIB_DIR (the dir holding lib/*.sh) before
# sourcing common.sh. `watchdog_bin_dir` then locates the python helpers
# (freshness.py / state.py) relative to it, for both layouts. WATCHDOG_BIN_DIR
# overrides everything (used by tests).
watchdog_bin_dir() {
  if [[ -n "${WATCHDOG_BIN_DIR:-}" ]]; then
    printf '%s' "$WATCHDOG_BIN_DIR"
    return 0
  fi
  local lib="${WATCHDOG_LIB_DIR:-}"
  if [[ -n "$lib" && -f "$lib/../bin/freshness.py" ]]; then
    ( cd "$lib/../bin" && pwd )            # repo-dev: lib/ and bin/ are siblings
  elif [[ -n "$lib" && -f "$lib/../freshness.py" ]]; then
    ( cd "$lib/.." && pwd )                # installed: py lives beside lib/'s parent
  else
    printf '%s' "${lib:-.}"
  fi
}

# --- File installation ------------------------------------------------------
# install_file <src> <dst> <mode> [owner:group]
# Idempotent copy: creates parent dirs, copies content, sets mode + ownership.
# An owner of "-" skips chown (used by tests that cannot become root). Avoids
# GNU-only `install -D` so it works on both GNU (Ubuntu host) and BSD (macOS CI).
install_file() {
  local src="$1" dst="$2" mode="$3" owner="${4:-root:root}"
  [[ -f "$src" ]] || die "install_file: source missing: $src" 3
  mkdir -p "$(dirname "$dst")" || die "install_file: mkdir failed for $dst" 3
  if [[ "$owner" == "-" ]]; then
    install -m "$mode" "$src" "$dst" \
      || die "install_file: failed to install $dst" 3
  else
    install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dst" \
      || die "install_file: failed to install $dst" 3
  fi
  log "installed $dst (mode $mode, owner $owner)"
}
