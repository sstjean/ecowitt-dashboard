#!/usr/bin/env bats
# deploy/watchdog/tests/orchestrator_isolation.bats
# T007 (RED-before-GREEN): bin/ecowitt-watchdog-run must evaluate poller/api/web
# independently and fault-isolated — one service's verdict erroring never aborts
# the run or affects another (FR-005/FR-014/FR-015); a healthy verdict resets
# that service's counters (FR-009, including the poller); unhealthy calls the
# action gate; unknown calls no action (FR-014).

setup() {
  WD_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  RUN="$WD_DIR/bin/ecowitt-watchdog-run"

  STUBLIB="$(mktemp -d)"
  CALLS="$(mktemp)"
  export WATCHDOG_LIB_DIR="$STUBLIB"
  export WATCHDOG_CALLS="$CALLS"

  # Real shared libs the orchestrator depends on.
  cp "$WD_DIR/lib/common.sh" "$STUBLIB/common.sh"
  cp "$WD_DIR/lib/config.sh" "$STUBLIB/config.sh"

  # Stub health: poller healthy, api unhealthy, web ERRORS (returns non-zero).
  cat > "$STUBLIB/health.sh" <<'EOF'
watchdog_health_verdict() {
  case "$1" in
    poller) printf 'healthy\tfresh age=42s' ;;
    api)    printf 'unhealthy\thttp 503 streak=3/3' ;;
    web)    return 7 ;;   # simulate an evaluation fault
  esac
}
EOF

  # Stub state: record every reset.
  cat > "$STUBLIB/state.sh" <<'EOF'
watchdog_state_reset()          { printf 'RESET %s\n' "$1" >> "$WATCHDOG_CALLS"; }
watchdog_state_can_restart()    { printf 'ok'; }
watchdog_state_record_restart() { :; }
watchdog_state_incr_streak()    { printf '1'; }
EOF

  # Stub actions: record every act.
  cat > "$STUBLIB/actions.sh" <<'EOF'
watchdog_container() { printf '%s-%s-1' "${WATCHDOG_PROJECT:-ecowitt-dashboard}" "$1"; }
watchdog_act()       { printf 'ACT %s %s\n' "$1" "${2:-}" >> "$WATCHDOG_CALLS"; }
EOF
}

teardown() { rm -rf "$STUBLIB" "$CALLS"; }

@test "run completes with exit 0 even when one service evaluation errors" {
  run bash "$RUN"
  [ "$status" -eq 0 ]
}

@test "every service emits a verdict line to the journal (stdout)" {
  run bash "$RUN"
  [[ "$output" == *"poller"* ]]
  [[ "$output" == *"api"* ]]
  [[ "$output" == *"web"* ]]
}

@test "a healthy poller resets its counters (FR-009)" {
  run bash "$RUN"
  grep -q "^RESET poller$" "$CALLS"
}

@test "an unhealthy api calls the action gate" {
  run bash "$RUN"
  grep -q "^ACT api " "$CALLS"
}

@test "a healthy poller is NOT sent to the action gate" {
  run bash "$RUN"
  ! grep -q "^ACT poller " "$CALLS"
}

@test "an erroring (unknown) web service is NOT restarted (FR-014)" {
  run bash "$RUN"
  ! grep -q "^ACT web " "$CALLS"
}

@test "the erroring web service does not prevent api from being acted on (isolation)" {
  run bash "$RUN"
  # api comes before web in the loop, but the key guarantee is the run finishes
  # and the prior services' actions still happened.
  grep -q "^ACT api " "$CALLS"
}
