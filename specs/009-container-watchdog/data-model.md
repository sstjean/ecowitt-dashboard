# Data Model: Container Watchdog / Self-Healing

**Feature**: `009-container-watchdog` | **Date**: 2026-06-29
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

This feature has **no application database changes**. It introduces three host
artifacts: a **configuration** (env knobs), a **runtime state file**, and the
**freshness signal** read from the existing app DB. The "entities" below are the
in-memory/on-disk records the watchdog manipulates each run.

---

## 1. Managed service (config entity)

The set of docker-compose containers the watchdog supervises. The `backup`
sidecar is **excluded** (periodic by design).

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `service` | enum `poller` \| `api` \| `web` | hard-coded list | one verdict path each |
| `container` | string | `${WATCHDOG_PROJECT}-${service}-1` | e.g. `ecowitt-dashboard-poller-1` |
| `health_kind` | enum `freshness` \| `http` | per service | `poller`→freshness; `api`/`web`→http |
| `probe_target` | string | per service | poller→DB path; api→`/api/v1/health`; web→`/` |

Each service is evaluated and acted on **independently** (FR-005). A fault or
cooldown on one service never blocks another.

---

## 2. Configuration knobs (env entity)

Supplied via `EnvironmentFile=-/etc/ecowitt-watchdog/watchdog.env` on the
service unit (tunable at runtime; takes effect next firing). `default_env` in
`lib/config.sh` supplies the pinned defaults when a var is unset.

| Env var | Default | Meaning |
|---------|---------|---------|
| `WATCHDOG_PROJECT` | `ecowitt-dashboard` | compose project prefix for container names |
| `WATCHDOG_DB_PATH` | `/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite` | host path to the SQLite DB (read-only) |
| `WATCHDOG_STATE_PATH` | `/var/lib/ecowitt-watchdog/state.json` | persisted state file |
| `WATCHDOG_BASE_URL` | `http://localhost:8090` | host base URL for api/web probes |
| `WATCHDOG_POLLER_MAX_AGE_SECONDS` | `300` | max stored-reading age before poller is stalled |
| `WATCHDOG_HTTP_FAIL_THRESHOLD` | `3` | K consecutive api/web failures before restart |
| `WATCHDOG_RESTART_COOLDOWN_SECONDS` | `600` | min gap between restarts of the same service |
| `WATCHDOG_RESTART_WINDOW_SECONDS` | `3600` | rolling-window length for the cap |
| `WATCHDOG_RESTART_WINDOW_CAP` | `3` | max restarts per service per window |
| `WATCHDOG_INTERVAL_SECONDS` | `60` | timer cadence — substituted into the `.timer` unit at provision time (a `.timer` can't read `EnvironmentFile`); changing it requires re-provision, not a runtime env edit |

All knobs are validated as non-negative integers (where numeric) at load; a
malformed value falls back to its default with a logged `warn` (never crashes).

---

## 3. Runtime state file (`state.json`)

JSON object written atomically (`temp` + `os.replace`) by `state.py`. Survives
across runs and reboots. One sub-object per service.

```jsonc
{
  "version": 1,
  "services": {
    "poller": {
      "last_restart": 1751220000,        // epoch seconds, 0 if never
      "restarts_window": [1751219400, 1751219700], // epochs within window
      "fail_streak": 0                    // consecutive failed probes (api/web only; 0 for poller)
    },
    "api":  { "last_restart": 0, "restarts_window": [], "fail_streak": 0 },
    "web":  { "last_restart": 0, "restarts_window": [], "fail_streak": 0 }
  }
}
```

**Invariants & transitions**:

| Event | Mutation |
|-------|----------|
| Healthy verdict observed | `fail_streak = 0`; `restarts_window = []` (FR-009 reset) |
| Failed http probe (api/web) | `fail_streak += 1` (verdict unhealthy once `fail_streak ≥ K`) |
| Restart issued | `last_restart = now`; append `now` to `restarts_window` |
| Every load | prune `restarts_window` to entries `> now − WINDOW_SECONDS` |
| Cooldown active | `now − last_restart < COOLDOWN` ⇒ skip restart |
| Cap reached | `len(restarts_window) ≥ CAP` ⇒ skip restart + loud log |
| Missing/corrupt file | treated as empty default (all zeros) + logged |

---

## 4. Health verdict (per-run, in-memory)

Produced for each service every run; logged to the journal (FR-010); never
persisted (it is recomputed each run).

| Field | Type | Values |
|-------|------|--------|
| `service` | enum | `poller` \| `api` \| `web` |
| `verdict` | enum | `healthy` \| `unhealthy` \| `unknown` |
| `reason` | string | e.g. `age=7320s>300s`, `http 503 status=degraded (streak 3/3)`, `db_missing`, `fresh age=42s` |

`unknown` ⇒ **no restart** (FR-014: missing/empty/unreadable DB, or a probe
infra error). Only `unhealthy` (and not blocked by cooldown/cap) triggers a
restart.

---

## 5. Freshness signal (read-only, from app DB)

Computed by `freshness.py` from the existing `readings` table — **not** modified
by this feature.

| Field | Type | Derivation |
|-------|------|------------|
| `max_observed_at` | ISO-8601 UTC string \| null | `SELECT MAX(observed_at) FROM readings` |
| `age_seconds` | int \| null | `now_utc − parse(max_observed_at)` |
| `ok` | bool | false on missing/locked DB or NULL max |
| `reason` | string | `db_missing` \| `empty` \| `read_error` when `ok=false` |

Comparison is UTC-vs-UTC (storage is UTC; `now` taken as UTC epoch) — no naive
local-time math (spec Assumptions / clock-skew edge case).

---

## 6. Installed host artifacts (deploy entity)

Canonical paths the provisioner installs (idempotent via `install_file`), and
what rollback removes.

| Artifact | Installed path | Mode | Owner |
|----------|----------------|------|-------|
| orchestrator | `/usr/local/bin/ecowitt-watchdog-run` | 0755 | root:root |
| freshness reader | `/usr/local/lib/ecowitt-watchdog/freshness.py` | 0755 | root:root |
| state helper | `/usr/local/lib/ecowitt-watchdog/state.py` | 0755 | root:root |
| libs | `/usr/local/lib/ecowitt-watchdog/lib/*.sh` | 0644 | root:root |
| service unit | `/etc/systemd/system/ecowitt-watchdog.service` | 0644 | root:root |
| timer unit | `/etc/systemd/system/ecowitt-watchdog.timer` | 0644 | root:root |
| config (if absent) | `/etc/ecowitt-watchdog/watchdog.env` | 0644 | root:root |
| state dir | `/var/lib/ecowitt-watchdog/` | 0755 | root:root |

Rollback (FR-012) stops + disables the timer, removes both units +
`daemon-reload`, and removes the installed scripts/libs. The state file and
config are left unless `--purge` is passed (operator data hygiene), mirroring
kiosk's clean-removal convention.
