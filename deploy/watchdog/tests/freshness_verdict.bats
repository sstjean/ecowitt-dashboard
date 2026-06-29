#!/usr/bin/env bats
# deploy/watchdog/tests/freshness_verdict.bats
# T011 (RED-before-GREEN): lib/health.sh maps freshness.py output to the poller
# verdict per the freshness-reader contract, and an unhealthy poller drives a
# `docker restart` of ONLY the poller container — while `unknown` (ok:false)
# never restarts (FR-014).

setup() {
  WD_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  STUB="$(mktemp -d)"
  DOCKER_CALLS="$(mktemp)"
  export DOCKER_CALLS

  # Stub freshness.py: emits whatever JSON the test puts in $FRESHNESS_JSON, and
  # exits 0 when ok:true-ish, 1 otherwise (parsed loosely). It's a bash script
  # so bats needs no python for the stub itself.
  cat > "$STUB/freshness.py" <<'EOF'
#!/usr/bin/env bash
printf '%s' "${FRESHNESS_JSON-}"
case "${FRESHNESS_JSON-}" in
  *'"ok": true'*|*'"ok":true'*) exit 0 ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$STUB/freshness.py"
  export WATCHDOG_BIN_DIR="$STUB"

  # Stub docker on PATH, recording every invocation.
  mkdir -p "$STUB/path"
  cat > "$STUB/path/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$DOCKER_CALLS"
EOF
  chmod +x "$STUB/path/docker"
  export PATH="$STUB/path:$PATH"

  verdict() {
    FRESHNESS_JSON="$1" bash -c '
      set -euo pipefail
      source "'"$WD_DIR"'/lib/common.sh"
      source "'"$WD_DIR"'/lib/config.sh"
      source "'"$WD_DIR"'/lib/state.sh"
      source "'"$WD_DIR"'/lib/health.sh"
      watchdog_load_config
      watchdog_health_verdict poller
    '
  }

  run_orch() {
    FRESHNESS_JSON="$1" WATCHDOG_SERVICES=poller bash "$WD_DIR/bin/ecowitt-watchdog-run"
  }
}

teardown() { rm -rf "$STUB" "$DOCKER_CALLS"; }

@test "fresh reading (age <= max) maps to healthy" {
  run verdict '{"ok": true, "max_observed_at": "x", "age_seconds": 42}'
  [ "$status" -eq 0 ]
  [[ "$output" == healthy* ]]
  [[ "$output" == *"age=42s"* ]]
}

@test "stale reading (age > max) maps to unhealthy with threshold in reason" {
  run verdict '{"ok": true, "max_observed_at": "x", "age_seconds": 7320}'
  [ "$status" -eq 0 ]
  [[ "$output" == unhealthy* ]]
  [[ "$output" == *"7320s>300s"* ]]
}

@test "ok:false (db_missing) maps to unknown carrying the reason" {
  run verdict '{"ok": false, "reason": "db_missing"}'
  [ "$status" -eq 0 ]
  [[ "$output" == unknown* ]]
  [[ "$output" == *"db_missing"* ]]
}

@test "an unhealthy poller triggers docker restart of the poller container" {
  run run_orch '{"ok": true, "max_observed_at": "x", "age_seconds": 7320}'
  [ "$status" -eq 0 ]
  grep -q "restart ecowitt-dashboard-poller-1" "$DOCKER_CALLS"
}

@test "a fresh poller triggers NO docker restart" {
  run run_orch '{"ok": true, "max_observed_at": "x", "age_seconds": 42}'
  [ "$status" -eq 0 ]
  [ ! -s "$DOCKER_CALLS" ]
}

@test "an unknown poller (ok:false) triggers NO docker restart (FR-014)" {
  run run_orch '{"ok": false, "reason": "db_missing"}'
  [ "$status" -eq 0 ]
  [ ! -s "$DOCKER_CALLS" ]
}
