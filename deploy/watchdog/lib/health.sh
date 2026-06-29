#!/usr/bin/env bash
# deploy/watchdog/lib/health.sh
# Per-service health verdicts. Sourced by the orchestrator after common.sh +
# config.sh + state.sh.
#
# Contract: `watchdog_health_verdict <service>` prints a single line
# "<verdict>\t<reason>" where verdict ∈ {healthy,unhealthy,unknown}, and returns
# 0. A non-zero return or no output is treated by the orchestrator as
# "unknown / eval_error" (fault isolation, FR-005/FR-014).
#
#   poller → freshness of MAX(observed_at) via bin/freshness.py (US1).
#   api/web → curl probes with K-consecutive-failure gating (US2).

# shellcheck source=lib/common.sh
# shellcheck source=lib/config.sh
# shellcheck source=lib/state.sh

# _freshness_json — run the read-only freshness reader, echo its JSON (never
# fails the caller; we parse JSON regardless of exit code).
_freshness_json() {
  local bin
  bin="$(watchdog_bin_dir)"
  "$bin/freshness.py" --db "$WATCHDOG_DB_PATH" 2>/dev/null || true
}

# _parse_freshness <json> — emit "<ok>\t<age>\t<reason>" using python3 (no jq on
# host). <ok> is "true"/"false"; malformed JSON yields "false\t\tparse_error".
_parse_freshness() {
  printf '%s' "$1" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stdout.write("false\t\tparse_error")
    sys.exit(0)
ok = "true" if d.get("ok") else "false"
age = d.get("age_seconds", "")
reason = d.get("reason", "")
sys.stdout.write("%s\t%s\t%s" % (ok, age, reason))
'
}

# _poller_verdict — freshness → verdict mapping (freshness-reader contract).
_poller_verdict() {
  local json parsed ok age reason rest
  local maxage="${WATCHDOG_POLLER_MAX_AGE_SECONDS:-300}"
  json="$(_freshness_json)"
  parsed="$(_parse_freshness "$json")"
  ok="${parsed%%$'\t'*}"
  rest="${parsed#*$'\t'}"
  age="${rest%%$'\t'*}"
  reason="${rest#*$'\t'}"

  if [[ "$ok" == "true" ]]; then
    if (( age > maxage )); then
      printf 'unhealthy\tstale age=%ss>%ss' "$age" "$maxage"
    else
      printf 'healthy\tfresh age=%ss' "$age"
    fi
  else
    printf 'unknown\t%s' "${reason:-read_error}"
  fi
}

# _http_probe_api — pass iff /api/v1/health returns HTTP 2xx AND body status=ok.
# `curl -f` makes any non-2xx a non-zero exit (connection failures too).
_http_probe_api() {
  local body
  body="$(curl -fsS -m 5 "${WATCHDOG_BASE_URL}/api/v1/health" 2>/dev/null)" || return 1
  printf '%s' "$body" | python3 -c '
import sys, json
try:
    sys.exit(0 if json.load(sys.stdin).get("status") == "ok" else 1)
except Exception:
    sys.exit(1)
'
}

# _http_probe_web — pass iff / returns HTTP 2xx.
_http_probe_web() {
  curl -fsS -m 5 -o /dev/null "${WATCHDOG_BASE_URL}/" 2>/dev/null
}

# _http_verdict <api|web> — probe + K-consecutive-failure mapping. A pass resets
# the streak and is healthy; a fail increments the streak and is `unhealthy` once
# it reaches the threshold, else `unknown` (watching) so single blips never
# restart a working service (FR-004/FR-014).
_http_verdict() {
  local svc="$1" k="${WATCHDOG_HTTP_FAIL_THRESHOLD:-3}" n
  if "_http_probe_${svc}"; then
    watchdog_state_reset "$svc"
    printf 'healthy\tprobe ok'
    return 0
  fi
  n="$(watchdog_state_incr_streak "$svc")"
  if (( n >= k )); then
    printf 'unhealthy\tprobe failed streak=%s/%s' "$n" "$k"
  else
    printf 'unknown\twatching streak=%s/%s' "$n" "$k"
  fi
}

watchdog_health_verdict() {
  case "$1" in
    poller)  _poller_verdict ;;
    api|web) _http_verdict "$1" ;;
    *)       printf 'unknown\tunknown_service' ;;
  esac
}
