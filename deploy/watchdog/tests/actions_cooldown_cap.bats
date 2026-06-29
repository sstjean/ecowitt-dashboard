#!/usr/bin/env bats
# deploy/watchdog/tests/actions_cooldown_cap.bats
# T022 (RED-before-GREEN): the restart gate in lib/actions.sh consults
# `state.py can-restart` before restarting (state-store contract):
#   ok        → docker restart + record-restart
#   cooldown  → NO restart, logged cooldown reason (FR-007)
#   cap       → NO restart, LOUD (ALERT) cap log (FR-008 / SC-005)
# and a recovered (healthy) service resets its counters via the orchestrator,
# including the poller (FR-009).
# docker, state.py and freshness.py are stubbed.

setup() {
  WD_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  STUB="$(mktemp -d)"
  DOCKER_CALLS="$(mktemp)"
  STATE_LOG="$(mktemp)"
  export DOCKER_CALLS STATE_LOG

  mkdir -p "$STUB/path"
  cat > "$STUB/path/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_CALLS"
EOF
  chmod +x "$STUB/path/docker"
  export PATH="$STUB/path:$PATH"

  # state.py stub: can-restart emits JSON driven by $STUB_GATE; the mutating
  # subcommands record their call. incr-streak echoes 1 for completeness.
  cat > "$STUB/state.py" <<'EOF'
#!/usr/bin/env bash
sub=""; svc=""
while [ $# -gt 0 ]; do
  case "$1" in
    --file|--now) shift 2 ;;
    can-restart|record-restart|incr-streak|reset|get) sub="$1"; svc="$2"; shift 2; break ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$sub" "$svc" >> "$STATE_LOG"
case "$sub" in
  can-restart)
    case "${STUB_GATE:-ok}" in
      cooldown) printf '%s' '{"allow": false, "reason": "cooldown", "retry_after_s": 312}' ;;
      cap)      printf '%s' '{"allow": false, "reason": "cap", "window_count": 3}' ;;
      *)        printf '%s' '{"allow": true, "reason": "ok"}' ;;
    esac
    ;;
  incr-streak) printf '1' ;;
esac
EOF
  chmod +x "$STUB/state.py"

  # freshness.py stub for the recovery test: always fresh (healthy poller).
  cat > "$STUB/freshness.py" <<'EOF'
#!/usr/bin/env bash
printf '%s' '{"ok": true, "age_seconds": 5}'
EOF
  chmod +x "$STUB/freshness.py"
  export WATCHDOG_BIN_DIR="$STUB"

  act() {
    bash -c '
      set -euo pipefail
      source "'"$WD_DIR"'/lib/common.sh"
      source "'"$WD_DIR"'/lib/config.sh"
      source "'"$WD_DIR"'/lib/state.sh"
      source "'"$WD_DIR"'/lib/health.sh"
      source "'"$WD_DIR"'/lib/actions.sh"
      watchdog_load_config
      watchdog_act poller "stale age=7320s>300s"
    '
  }

  run_orch() {
    WATCHDOG_SERVICES=poller bash "$WD_DIR/bin/ecowitt-watchdog-run"
  }
}

teardown() { rm -rf "$STUB" "$DOCKER_CALLS" "$STATE_LOG"; }

@test "gate=ok restarts the container and records the restart" {
  STUB_GATE=ok run act
  [ "$status" -eq 0 ]
  grep -q "restart ecowitt-dashboard-poller-1" "$DOCKER_CALLS"
  grep -q "record-restart poller" "$STATE_LOG"
}

@test "gate=cooldown suppresses the restart and logs the reason" {
  STUB_GATE=cooldown run act
  [ "$status" -eq 0 ]
  [ ! -s "$DOCKER_CALLS" ]
  [[ "$output" == *"cooldown"* ]]
}

@test "gate=cap suppresses the restart and logs LOUDLY (ALERT)" {
  STUB_GATE=cap run act
  [ "$status" -eq 0 ]
  [ ! -s "$DOCKER_CALLS" ]
  [[ "$output" == *"ALERT"* ]]
  [[ "$output" == *"cap"* || "$output" == *"CAP"* ]]
}

@test "a recovered poller resets its counters via the orchestrator (FR-009)" {
  run run_orch
  [ "$status" -eq 0 ]
  [ ! -s "$DOCKER_CALLS" ]
  grep -q "reset poller" "$STATE_LOG"
}
