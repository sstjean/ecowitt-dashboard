#!/usr/bin/env bash
# deploy/watchdog/lib/actions.sh
# Recovery actions + restart gating. The minimal restart lands in US1; the
# cooldown/cap gate lands in US3. Sourced by the orchestrator after state.sh.
#
# Contract: `watchdog_act <service> <reason>` decides whether to restart the
# service (respecting cooldown + per-window cap once US3 lands) and performs the
# `docker restart`, logging every decision. A failed restart is logged and never
# aborts the run (FR-015).

# shellcheck source=lib/common.sh
# shellcheck source=lib/config.sh
# shellcheck source=lib/state.sh

# watchdog_container <service> — compose-default container name for a service.
watchdog_container() {
  printf '%s-%s-1' "${WATCHDOG_PROJECT:-ecowitt-dashboard}" "$1"
}

# _docker_restart <service> <reason> — restart the service's container, logging
# the reason + outcome. A failed restart is logged and NEVER aborts the run
# (FR-015); recovery is left to a later firing.
_docker_restart() {
  local svc="$1" reason="${2:-}" container
  container="$(watchdog_container "$svc")"
  log "$svc: restarting $container (reason=$reason)"
  if docker restart "$container" >/dev/null 2>&1; then
    log "$svc: restart of $container succeeded"
    watchdog_state_record_restart "$svc" || warn "$svc: record-restart failed"
  else
    warn "$svc: docker restart $container FAILED — will retry next run (FR-015)"
  fi
}

# watchdog_act <service> <reason> — recover an unhealthy service, subject to the
# cooldown + per-window cap gate (FR-006/007/008). A cap-hit is logged LOUDLY so
# a persistently broken service surfaces to an operator instead of being
# hammered (SC-005).
watchdog_act() {
  local svc="$1" reason="${2:-}" gate verdict detail
  gate="$(watchdog_state_can_restart "$svc")"
  verdict="${gate%% *}"
  detail="${gate#"$verdict"}"
  detail="${detail# }"
  case "$verdict" in
    ok)
      _docker_restart "$svc" "$reason"
      ;;
    cooldown)
      log "$svc: restart suppressed — in cooldown (${detail}s remaining), reason=$reason"
      ;;
    cap)
      loud "$svc: restart CAP reached (${detail} restarts in window) — NOT restarting, reason=$reason"
      ;;
    *)
      _docker_restart "$svc" "$reason"
      ;;
  esac
}
