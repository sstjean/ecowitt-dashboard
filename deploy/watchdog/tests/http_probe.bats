#!/usr/bin/env bats
# deploy/watchdog/tests/http_probe.bats
# T015 (RED-before-GREEN): lib/health.sh api/web probes (health-probes contract).
#   api  — curl /api/v1/health, pass iff HTTP 2xx AND body status=="ok"
#   web  — curl /, pass iff HTTP 2xx
#   K-consecutive: pass→reset→healthy; fail→incr-streak→ n<K unknown(watching),
#                  n>=K unhealthy. unknown never restarts (FR-014).
# curl + state.py are stubbed; the probe must call through to them.

setup() {
  WD_DIR="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  STUB="$(mktemp -d)"
  CURL_LOG="$(mktemp)"
  STATE_LOG="$(mktemp)"
  export CURL_LOG STATE_LOG

  mkdir -p "$STUB/path"

  # curl stub: behaviour driven by env.
  #   CURL_EXIT   — exit code (non-zero ⇒ -f saw non-2xx / connection failure)
  #   CURL_BODY   — stdout body (the api /health JSON)
  cat > "$STUB/path/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
printf '%s' "${CURL_BODY-}"
exit "${CURL_EXIT:-0}"
EOF
  chmod +x "$STUB/path/curl"

  # docker stub: record restarts (must NOT be called for unknown/healthy).
  cat > "$STUB/path/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
EOF
  chmod +x "$STUB/path/docker"
  export PATH="$STUB/path:$PATH"

  # state.py stub: incr-streak echoes $STUB_STREAK; reset records the call.
  cat > "$STUB/state.py" <<'EOF'
#!/usr/bin/env bash
# args: --file <p> [--now <e>] <subcommand> <service> ...
sub=""; svc=""
while [ $# -gt 0 ]; do
  case "$1" in
    --file|--now) shift 2 ;;
    incr-streak|reset|record-restart|can-restart|get) sub="$1"; svc="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$sub" "$svc" >> "$STATE_LOG"
case "$sub" in
  incr-streak) printf '%s' "${STUB_STREAK:-1}" ;;
esac
EOF
  chmod +x "$STUB/state.py"
  export WATCHDOG_BIN_DIR="$STUB"

  verdict() {
    local svc="$1"
    bash -c '
      set -euo pipefail
      source "'"$WD_DIR"'/lib/common.sh"
      source "'"$WD_DIR"'/lib/config.sh"
      source "'"$WD_DIR"'/lib/state.sh"
      source "'"$WD_DIR"'/lib/health.sh"
      watchdog_load_config
      watchdog_health_verdict "'"$svc"'"
    '
  }
}

teardown() { rm -rf "$STUB" "$CURL_LOG" "$STATE_LOG"; }

# ---- api ------------------------------------------------------------------

@test "api 2xx + status:ok is healthy and resets the streak" {
  CURL_EXIT=0 CURL_BODY='{"status": "ok"}' run verdict api
  [ "$status" -eq 0 ]
  [[ "$output" == healthy* ]]
  grep -q "reset api" "$STATE_LOG"
}

@test "api 2xx but status:degraded is a probe failure" {
  CURL_EXIT=0 CURL_BODY='{"status": "degraded"}' STUB_STREAK=1 run verdict api
  [ "$status" -eq 0 ]
  [[ "$output" != healthy* ]]
  grep -q "incr-streak api" "$STATE_LOG"
}

@test "api non-2xx (curl -f fails) is a probe failure" {
  CURL_EXIT=22 CURL_BODY='' STUB_STREAK=1 run verdict api
  [ "$status" -eq 0 ]
  [[ "$output" != healthy* ]]
  grep -q "incr-streak api" "$STATE_LOG"
}

@test "api connection failure (curl exit 7) is a probe failure" {
  CURL_EXIT=7 CURL_BODY='' STUB_STREAK=2 run verdict api
  [ "$status" -eq 0 ]
  [[ "$output" != healthy* ]]
}

# ---- web ------------------------------------------------------------------

@test "web 2xx is healthy and resets the streak" {
  CURL_EXIT=0 CURL_BODY='' run verdict web
  [ "$status" -eq 0 ]
  [[ "$output" == healthy* ]]
  grep -q "reset web" "$STATE_LOG"
}

@test "web non-2xx / unreachable is a probe failure" {
  CURL_EXIT=22 STUB_STREAK=1 run verdict web
  [ "$status" -eq 0 ]
  [[ "$output" != healthy* ]]
  grep -q "incr-streak web" "$STATE_LOG"
}

# ---- K-consecutive streak mapping ----------------------------------------

@test "a failure below threshold maps to unknown (watching), no restart" {
  CURL_EXIT=22 STUB_STREAK=2 run verdict api
  [ "$status" -eq 0 ]
  [[ "$output" == unknown* ]]
  [[ "$output" == *"watching streak=2/3"* ]]
}

@test "a failure at threshold maps to unhealthy" {
  CURL_EXIT=22 STUB_STREAK=3 run verdict api
  [ "$status" -eq 0 ]
  [[ "$output" == unhealthy* ]]
  [[ "$output" == *"3/3"* ]]
}
