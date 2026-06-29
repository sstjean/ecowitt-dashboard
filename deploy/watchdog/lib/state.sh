#!/usr/bin/env bash
# deploy/watchdog/lib/state.sh
# Thin bash wrapper over bin/state.py (atomic JSON state store). Real bodies land
# in US3. Sourced by the orchestrator + actions.sh.
#
# Contract:
#   watchdog_state_reset <service>          — clear fail_streak + restarts_window
#   watchdog_state_can_restart <service>    — echo "ok" | "cooldown ..." | "cap ..."
#   watchdog_state_record_restart <service> — record a restart (last_restart+window)
#   watchdog_state_incr_streak <service>    — echo the new consecutive-fail count

# shellcheck source=lib/common.sh

# _state_py — locate bin/state.py (same resolver as freshness.py).
_state_py() {
  printf '%s/state.py' "$(watchdog_bin_dir)"
}

# watchdog_state_reset <service> — clear fail_streak + restarts_window (FR-009).
# A missing/failed state store never aborts the run.
watchdog_state_reset() {
  "$(_state_py)" --file "$WATCHDOG_STATE_PATH" reset "$1" >/dev/null 2>&1 \
    || warn "$1: state reset failed"
}

# watchdog_state_incr_streak <service> — bump the consecutive-failure count and
# echo the new value. On failure, warn and assume a single failure (1).
watchdog_state_incr_streak() {
  local n
  if n="$("$(_state_py)" --file "$WATCHDOG_STATE_PATH" incr-streak "$1" 2>/dev/null)"; then
    printf '%s' "$n"
  else
    warn "$1: incr-streak failed"
    printf '1'
  fi
}

# watchdog_state_can_restart <service> — consult the cooldown + per-window cap
# gate. Echoes a single token the action layer branches on:
#   "ok" | "cooldown <retry_after_s>" | "cap <window_count>"
# A missing/failed state store fails OPEN (echo "ok") so a real outage is never
# masked by a state glitch.
watchdog_state_can_restart() {
  local out
  out="$("$(_state_py)" --file "$WATCHDOG_STATE_PATH" can-restart "$1" \
    "$WATCHDOG_RESTART_COOLDOWN_SECONDS" "$WATCHDOG_RESTART_WINDOW_SECONDS" \
    "$WATCHDOG_RESTART_WINDOW_CAP" 2>/dev/null)" || {
    warn "$1: can-restart failed — allowing restart"
    printf 'ok'
    return 0
  }
  printf '%s' "$out" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stdout.write("ok"); sys.exit(0)
if d.get("allow"):
    sys.stdout.write("ok")
elif d.get("reason") == "cooldown":
    sys.stdout.write("cooldown %s" % d.get("retry_after_s", 0))
elif d.get("reason") == "cap":
    sys.stdout.write("cap %s" % d.get("window_count", 0))
else:
    sys.stdout.write("ok")
'
}

# watchdog_state_record_restart <service> — record a restart (last_restart + window).
watchdog_state_record_restart() {
  "$(_state_py)" --file "$WATCHDOG_STATE_PATH" record-restart "$1" \
    "$WATCHDOG_RESTART_WINDOW_SECONDS" >/dev/null 2>&1 \
    || warn "$1: record-restart failed"
}
