#!/usr/bin/env bash
# deploy/kiosk/lib/common.sh
# Shared helpers for kiosk provisioning. Sourced (never executed) by
# provision.sh and the lib/*.sh step modules. No side effects on source.

# --- Secret redaction -------------------------------------------------------
# Replace any occurrence of the WiFi PSK in a message with a redaction marker
# so it can never leak into stdout/stderr/journald (provision-cli.md Security).
_redact() {
  local msg="$*"
  if [[ -n "${KIOSK_WIFI_PSK:-}" ]]; then
    msg="${msg//${KIOSK_WIFI_PSK}/***REDACTED***}"
  fi
  printf '%s' "$msg"
}

# --- Logging ----------------------------------------------------------------
log()  { printf '[provision] %s\n' "$(_redact "$*")"; }
warn() { printf '[provision] WARN: %s\n' "$(_redact "$*")" >&2; }

# die <message> [exit-code]   (default exit code 3 = step failure)
die() {
  local msg="$1" code="${2:-3}"
  printf '[provision] ERROR: %s\n' "$(_redact "$msg")" >&2
  exit "$code"
}

# --- Input validation -------------------------------------------------------
# require_env VAR...  — exit 1 (usage) if any named var is empty/unset.
# Never prints the value of any variable.
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

# --- File installation ------------------------------------------------------
# install_file <src> <dst> <mode> [owner:group]
# Idempotent copy: creates parent dirs, copies content, sets mode + ownership.
# Re-running re-applies the same content/mode/owner (content-stable).
install_file() {
  local src="$1" dst="$2" mode="$3" owner="${4:-root:root}"
  [[ -f "$src" ]] || die "install_file: source missing: $src" 3
  install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dst" \
    || die "install_file: failed to install $dst" 3
  log "installed $dst (mode $mode, owner $owner)"
}
