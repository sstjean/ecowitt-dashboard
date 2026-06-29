# Research: Container Watchdog / Self-Healing

**Feature**: `009-container-watchdog` | **Date**: 2026-06-29
**Spec**: [spec.md](./spec.md) | **Source of truth**: Issues
[#31](https://github.com/sstjean/ecowitt-dashboard/issues/31) (parent),
[#32](https://github.com/sstjean/ecowitt-dashboard/issues/32)/[#33](https://github.com/sstjean/ecowitt-dashboard/issues/33)/[#34](https://github.com/sstjean/ecowitt-dashboard/issues/34)/[#35](https://github.com/sstjean/ecowitt-dashboard/issues/35).

This document resolves every Open Question in the spec and the FR-003
`[NEEDS CLARIFICATION]` marker with a concrete, justified decision. All
decisions are deploy-side only (`deploy/watchdog/`); **no application code
changes** are introduced by this feature.

---

## Host facts (verified on `homeautomation`, 192.168.10.5)

Confirmed by direct inspection during planning:

- `python3` present at `/usr/bin/python3` (stdlib `sqlite3` available).
- **No `sqlite3` CLI** on the host. **No `jq`** on the host. → All SQLite reads
  and all JSON parse/serialize MUST go through `python3` stdlib.
- `bash`, `coreutils`, `curl`, `docker` CLI present; the timer/unit runs as
  **root** via systemd.
- The SQLite DB lives on a docker **named volume**, host path:
  `/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite`
  (root-owned; root access is therefore fine and needs no container to be up).
- Container naming is compose-default: `ecowitt-dashboard-{poller,api,web,backup}-1`.
- Dashboard published on host port **8090** (`WEB_PORT=8090` in the host `.env`;
  the `web`/nginx container proxies `/api/*` to the `api` container).
- DB schema (from `apps/api/src/store.ts`): table `readings`, column
  `observed_at TEXT NOT NULL UNIQUE` storing **ISO-8601 UTC** strings (e.g.
  `2026-06-29T18:42:00Z`).
- `/api/v1/health` returns `{ "status": "ok" | "degraded" }` and HTTP 200; it
  reports `degraded` **only** when the store is unreachable. During the 06-29
  wedge the store was reachable, so it returned `ok` — confirming this endpoint
  **cannot** be used to detect poller staleness.

---

## Decision 1 — Poller freshness read mechanism (resolves FR-003 + OQ-1)

**Decision**: Read poller freshness **directly from the SQLite DB on the host
named volume, read-only, via a `python3` stdlib helper** (`freshness.py`). It
computes `now_utc − MAX(observed_at)` in seconds. It does **not** depend on any
container being up, and it does **not** add a field to `/api/v1/health`.

**Rationale**:

- The current `/api/v1/health` only checks store *reachability*; it returned
  `ok` throughout the 06-29 wedge. Using it would re-introduce the exact blind
  spot the feature exists to close.
- Adding `lastReadingAt`/`readingAgeSeconds` to `/api/v1/health` would be an
  **app-code change** served by the `api` container — making poller-health
  detection depend on the `api` container being up, and coupling a deploy-side
  safety net to a versioned API contract. The spec/issues scope this feature as
  100% deploy-side. Rejected.
- The DB file is plainly readable by root on the host (named-volume path is
  fixed and stable). A read-only open over a `file:…?mode=ro` URI cannot mutate
  or lock the writer's WAL.
- The host already has `python3` (and lacks `sqlite3`/`jq`), so a stdlib
  `sqlite3` reader is the lowest-dependency option and is unit-testable against
  a fixture DB.

**Read safety**: open with
`sqlite3.connect("file:<path>?mode=ro", uri=True)` and a short `busy_timeout`;
run `SELECT MAX(observed_at) FROM readings`. Read-only mode guarantees the
watchdog can never write or corrupt the poller's database.

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| `docker exec poller sqlite3 …` | No `sqlite3` in the image; and it needs the (possibly wedged) container to be up — the exact thing we are judging. |
| Add freshness to `/api/v1/health` | App-code change; couples poller detection to the `api` container; widens the API contract for a deploy concern. |
| `docker logs` heuristics | Brittle string-matching; not a ground-truth signal. `MAX(observed_at)` is the actual stored data. |

---

## Decision 2 — api / web health probes (resolves FR-004)

**Decision**: Probe from the host with plain `curl`:

- **api** healthy ⇔ `GET http://localhost:8090/api/v1/health` returns HTTP 2xx
  **and** the JSON body's `status == "ok"` (parsed with `python3`, since no
  `jq`). `degraded` or any non-2xx / connection failure counts as a failed
  probe.
- **web** healthy ⇔ `GET http://localhost:8090/` returns HTTP 2xx.

A single failed probe is **not** sufficient to restart; restart fires only after
**K consecutive** failed probes (Decision 5), preventing single-blip restarts.

**Rationale**: `curl` is present and dependency-light. Checking `status == "ok"`
(not just HTTP 200) is necessary because the api returns 200 even when
`degraded`. Probing `:8090/` exercises the real user-facing nginx surface.

---

## Decision 3 — Recovery action (resolves FR-006)

**Decision**: `docker restart <container>` targeting only the affected service
(`ecowitt-dashboard-poller-1`, `…-api-1`, `…-web-1`). The container name is
derived from a configurable compose-project prefix (default `ecowitt-dashboard`)
+ service + `-1`.

**Rationale**: A manual `docker restart ecowitt-dashboard-poller-1` is exactly
what recovered the real 06-29 wedge (rows 8057→8284). It is the proven,
minimal, per-service recovery. Each service is restarted **independently**
(FR-005) — a stalled poller never restarts api/web and vice-versa.

---

## Decision 4 — State persistence (resolves FR-007/008/009 + OQ-7)

**Decision**: Persist watchdog state to a single host JSON file at
`/var/lib/ecowitt-watchdog/state.json`, read/written by a `python3` stdlib
helper (`state.py`). Per service it tracks: `last_restart` (epoch), a
rolling-window list of restart timestamps, and an api/web consecutive
`fail_streak`.

**Rationale**:

- Each timer firing is a fresh, short-lived process; cooldown timers and
  rolling-window counters MUST survive between runs → a small host state file.
- `/var/lib` persists across reboots (desirable: a flapping service that has
  burned its hourly cap should stay capped across a host reboot). `/run` (tmpfs)
  was considered but loses the cap on reboot — rejected.
- The host has no `jq`; `python3` reads/writes JSON atomically (write temp +
  `os.replace`) so a crashed write can never corrupt the file. `state.py`
  exposes small verb subcommands so `state.sh` stays a thin bash wrapper and the
  persistence logic is python-unit-testable.

**Schema**: see [data-model.md](./data-model.md) §3.

---

## Decision 5 — Pinned thresholds, intervals, and caps (resolves OQ-2..6)

All values are tunable at **runtime** via `/etc/ecowitt-watchdog/watchdog.env`
(an `EnvironmentFile` on the service unit) — editing it takes effect on the next
timer firing with no re-provision. **Exception**: `WATCHDOG_INTERVAL_SECONDS`
sets the systemd **timer** cadence; a `.timer` unit does not read an
`EnvironmentFile`, so the provisioner substitutes the value into the installed
timer (`OnUnitActiveSec`) — changing the interval requires a re-provision
(`daemon-reload`), not just an env edit. Defaults are pinned as:

| Knob (env var) | Pinned default | Justification |
|----------------|----------------|---------------|
| `WATCHDOG_POLLER_MAX_AGE_SECONDS` | **300** (5 min) | Poll cadence is ~30 s, so 5 min ≈ **10 missed cycles** — unambiguously stalled, not jitter or a single skipped poll. |
| `WATCHDOG_HTTP_FAIL_THRESHOLD` (K) | **3** | At a 60 s interval, 3 consecutive failures ≈ **3 min** of sustained outage before acting — long enough to ignore a restart-in-progress blip, short enough to recover quickly. Backs SC-004 (zero false-positive restarts). |
| `WATCHDOG_RESTART_COOLDOWN_SECONDS` | **600** (10 min) | After a restart, the poller needs time to fire a new poll (~30 s) and for `MAX(observed_at)` age to fall back under 5 min. 10 min comfortably covers recovery so the watchdog won't double-restart a service that is mid-recovery. |
| `WATCHDOG_RESTART_WINDOW_SECONDS` | **3600** (1 h) | Rolling window for the restart cap. |
| `WATCHDOG_RESTART_WINDOW_CAP` | **3** | ≤3 restarts/hour per service. On the 3rd-within-window, **stop** restarting and log **loudly** (journal `warning`/`error`) so a genuine outage (e.g. dead gateway) surfaces instead of an endless restart loop (US3 / SC-005). |
| `WATCHDOG_INTERVAL_SECONDS` | **60** | systemd timer cadence. Bounds lost-history to ≈ threshold + one interval (SC-002): ~6 min worst case vs. the ~2 h we lost on 06-29. |

**Reset semantics (FR-009)**: when a service reads healthy, its `fail_streak`
resets to 0 **and** its rolling-window restart list is cleared, so a recovered
service re-earns its full restart budget.

---

## Decision 6 — Scheduling: systemd timer + oneshot service (resolves FR-001)

**Decision**: A `oneshot` service (`ecowitt-watchdog.service`) runs the
orchestrator once per firing; a paired `ecowitt-watchdog.timer`
(`OnBootSec` + `OnUnitActiveSec=60s`, with `Persistent=true`) drives it every
~60 s. Mirrors the established `deploy/kiosk` systemd convention.

**Rationale**: A oneshot+timer is the idiomatic "run a short job periodically"
systemd pattern — no long-running daemon to itself wedge, no in-process loop, no
`sleep` busy-waiting. Each run is independent and fully reconstructable from the
journal (FR-010). `OnUnitActiveSec` (vs `OnCalendar`) keeps the interval a
single tunable knob.

---

## Decision 7 — Layout & test harness mirror `deploy/kiosk` (resolves FR-013)

**Decision**: `deploy/watchdog/` mirrors `deploy/kiosk/`'s structure and idioms,
extended with a `python3 unittest` + `coverage.py` gate for the logic-bearing
helpers (kiosk has no python):
`provision.sh` / `rollback.sh` / `run-checks.sh` entry points; sourced
`lib/*.sh`; vendored runtime artifacts in `bin/`; unit files in `systemd/`;
`tests/` with a `bats` + `shellcheck` gate driven by `run-checks.sh`. It reuses
kiosk's idioms: `set -euo pipefail`, `install_file` idempotent installer,
`log/warn/die`, `require_env`/`default_env`, `.env.example` → gitignored `.env`.

**Testing approach** (Constitution Principle IV; mirrors 005-kiosk-runtime's
precedent for the deploy tree):

- `shellcheck -x` on every shell script (entry scripts + libs + bin) — same gate
  kiosk uses.
- `bats` suites for: `provision.sh` preflight/idempotency, `health.sh` probe
  verdicts (with stubbed `curl`/`freshness.py`), and `actions.sh`
  cooldown/cap/reset gating (with stubbed `docker` + `state.py`).
- **`python3 unittest`** suites for `freshness.py` (against a temp fixture
  SQLite DB: fresh, stale, empty/NULL, missing-file, locked) and `state.py`
  (cooldown, window count/prune, streak incr/reset, atomic write) — targeting
  100% of their branches, measurable with `coverage.py`.

**Rationale**: The deploy tree has no Vitest/Node runtime on the host; bats +
shellcheck is the precedent the constitution's CI gate already accepts for
`deploy/kiosk`. Python helpers carry the testable logic (freshness math, state
math) and get true unit tests with coverage, satisfying the 100%-coverage intent
for the code that contains real branching.

---

## Decision 8 — Robustness / graceful degradation (resolves FR-014/015)

**Decision**: Treat the poller verdict as **`unknown`** (never restart) when the
DB is missing, unreadable/locked, or empty (NULL `MAX`). `freshness.py` returns
`{"ok": false, "reason": "db_missing"|"empty"|"read_error"}` and the bash health
layer maps `ok:false` → `unknown` + a logged reason. A failed `docker restart`
is logged (`warn`) and the run continues; recovery is left to a later run under
cooldown/cap. The orchestrator never aborts a run because one service errored —
each service is wrapped so a fault in one cannot wedge the watchdog itself.

**Rationale**: The watchdog must never become a new failure mode. Misreading an
unreadable DB as "stale" would cause spurious restarts; misreading first-boot
empty as "stale" would restart a healthy fresh stack. `unknown` is the safe
verdict (FR-002/014). Timezone correctness is guaranteed by comparing host UTC
`now` to stored UTC `observed_at` (both UTC; no naive-local math).

---

## Out of scope (explicit)

- **Poller fragility fix** — transient-payload tolerance + gateway timeout/retry
  in the poller itself. Separate poller-hardening issue. This watchdog is the
  **safety net**, not the root-cause fix.
- **External alerting / paging** — observability is the local systemd journal
  only.
- **Supervising the `backup` sidecar** — it runs periodically by design and is
  not continuously "working"; excluded from watchdog restarts.
