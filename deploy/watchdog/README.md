# Ecowitt Container Watchdog

A host-side systemd watchdog that detects **logically-stalled** containers in the
`ecowitt-dashboard` Docker Compose stack and restarts the specific stuck service.

It exists because a container can report `Up` (Docker health green) while being
functionally wedged — e.g. the poller process alive but no new readings landing.
Docker's own restart policy never fires in that case. This watchdog closes that
gap by checking *outcomes*, not just process liveness:

| Service | Health signal                                              | "Unhealthy" when …                                  |
| ------- | ---------------------------------------------------------- | --------------------------------------------------- |
| poller  | newest `readings.observed_at` in the app SQLite DB         | newest reading older than `POLLER_MAX_AGE_SECONDS`  |
| api     | `GET /api/v1/health` returns `{"status":"ok"}`             | `HTTP_FAIL_THRESHOLD` consecutive probe failures    |
| web     | `GET /` returns 2xx                                         | `HTTP_FAIL_THRESHOLD` consecutive probe failures    |

When a service is judged unhealthy the watchdog runs `docker restart
<project>-<svc>-1`, governed by a per-service **cooldown** and a rolling
**restart cap** so a hard-down dependency can't cause a restart storm. Transient
or unreadable states map to `unknown` and never trigger a restart (fail-safe).

## Layout

```
deploy/watchdog/
├── provision.sh              # install onto the host (idempotent, root)
├── rollback.sh               # uninstall (optionally --purge state/config)
├── run-checks.sh             # CI gate: shellcheck + bats + python coverage
├── .env.example              # tracked config template (all tunable knobs)
├── bin/
│   ├── ecowitt-watchdog-run  # orchestrator (one evaluation pass)
│   ├── freshness.py          # read-only poller freshness reader (stdlib only)
│   └── state.py              # atomic JSON restart-state store (stdlib only)
├── lib/                      # sourced bash: common/config/health/state/actions
├── systemd/                  # ecowitt-watchdog.{service,timer} templates
└── tests/                    # bats + python unittest (100% python coverage)
```

## Install

Run as root on the Docker host (`homeautomation`):

```bash
sudo deploy/watchdog/provision.sh
```

This installs the orchestrator to `/usr/local/bin/ecowitt-watchdog-run`, the
helpers + libs under `/usr/local/lib/ecowitt-watchdog/`, the systemd units to
`/etc/systemd/system/`, a default config at `/etc/ecowitt-watchdog/watchdog.env`
(only if absent — your edits are never clobbered), and enables + starts
`ecowitt-watchdog.timer`. Re-running is safe and content-stable.

Provision exit codes: `0` success · `1` invalid knob · `2` preflight failure
(not root / missing `docker` / missing `python3`) · `3` a step failed.

## Tune

Edit `/etc/ecowitt-watchdog/watchdog.env` (see [.env.example](.env.example) for
every knob and its default), then:

```bash
sudo systemctl restart ecowitt-watchdog.timer   # most knobs: next pass picks them up
```

**Exception:** `WATCHDOG_INTERVAL_SECONDS` is baked into the `.timer` at install
time (a systemd timer can't read `EnvironmentFile`). To change the cadence,
update the knob and re-run `sudo deploy/watchdog/provision.sh`.

Key knobs (defaults): `POLLER_MAX_AGE_SECONDS=300`, `HTTP_FAIL_THRESHOLD=3`,
`RESTART_COOLDOWN_SECONDS=600`, `RESTART_WINDOW_SECONDS=3600`,
`RESTART_WINDOW_CAP=3`, `INTERVAL_SECONDS=60` (all prefixed `WATCHDOG_`).

## Verify / observe

```bash
systemctl status ecowitt-watchdog.timer            # is it scheduled?
systemctl list-timers ecowitt-watchdog.timer       # next/last fire
journalctl -u ecowitt-watchdog.service -f          # every verdict + action, timestamped
sudo /usr/local/bin/ecowitt-watchdog-run           # run one pass by hand
```

Each pass logs one line per service with a verdict (`healthy` / `unhealthy` /
`unknown`) and reason. Restarts, cooldown suppressions, and cap back-offs
(`ALERT:`) are all logged to the journal.

## Uninstall

```bash
sudo deploy/watchdog/rollback.sh           # remove units + scripts, keep config + state
sudo deploy/watchdog/rollback.sh --purge   # also remove /etc + /var/lib state
```

Idempotent: running it when nothing is installed is a clean no-op.

## Develop / test

```bash
npm run test:watchdog        # shellcheck + bats + python unittest @ 100% coverage
```

Requires `shellcheck`, `bats`, `python3`, and `coverage` (`brew install
shellcheck bats-core` · `python3 -m pip install coverage`). The Python helpers
are pure stdlib and held to 100% branch coverage; the bash layer is covered by
bats and `shellcheck -x`.
