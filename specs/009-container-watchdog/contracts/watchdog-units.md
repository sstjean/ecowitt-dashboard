# Contract: systemd units (`ecowitt-watchdog.service` + `.timer`)

**Feature**: `009-container-watchdog` | Mirrors `deploy/kiosk/systemd/`.

## `ecowitt-watchdog.service` (oneshot)

```ini
[Unit]
Description=Ecowitt dashboard container watchdog (self-healing)
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
EnvironmentFile=-/etc/ecowitt-watchdog/watchdog.env
ExecStart=/usr/local/bin/ecowitt-watchdog-run
# logs to journal by default (FR-010)
```

- `Type=oneshot`: runs the orchestrator once and exits. No long-running daemon
  that could itself wedge.
- `EnvironmentFile=-…`: leading `-` makes the config file optional; defaults
  apply when absent.
- All stdout/stderr (every verdict + action, with reason + timestamp) lands in
  the journal: `journalctl -u ecowitt-watchdog.service` (FR-010, SC-007).

## `ecowitt-watchdog.timer`

```ini
[Unit]
Description=Run the Ecowitt watchdog periodically

[Timer]
OnBootSec=60s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true
Unit=ecowitt-watchdog.service

[Install]
WantedBy=timers.target
```

- `OnUnitActiveSec=60s` ⇒ fires ~every interval after the previous run
  (`WATCHDOG_INTERVAL_SECONDS` default 60; provisioner substitutes the value).
- `Persistent=true` ⇒ catches up a missed run after downtime.
- The cap state in `state.json` persists across reboots, so a capped service
  stays capped (SC-005).

## Behavioural contract (each firing)

For each service `poller`, `api`, `web` **independently** (FR-005):

1. Compute verdict (`healthy`/`unhealthy`/`unknown`) + reason; log it.
2. `healthy` ⇒ reset `fail_streak` + `restarts_window` (FR-009); no action.
3. `unknown` ⇒ log reason; **no restart** (FR-014).
4. `unhealthy` ⇒ attempt restart **iff** not within cooldown (FR-007) and under
   the window cap (FR-008); on cap-hit, log **loudly** at `warning`/`error` and
   skip (US3/SC-005). A failed `docker restart` is logged and the run continues
   (FR-015).

A fault evaluating one service never aborts the run or affects another service.
