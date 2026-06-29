# Feature Specification: Container Watchdog / Self-Healing

**Feature Branch**: `009-container-watchdog`

**Created**: 2026-06-29

**Status**: Resolved (FR-003 + all Open Questions resolved in research.md; ready for tasks)

**Input**: User description: "Host-side watchdog on `homeautomation` (192.168.10.5) that detects when a docker-compose container has STOPPED WORKING (logically stalled, not just process-exited) and `docker restart`s the specific stalled service."

> **Source of truth**: GitHub Issues, not this markdown. This spec is a derived
> implementation tool; **if it and the Issues disagree, the Issues win.**
> Parent Feature: [#31](https://github.com/sstjean/ecowitt-dashboard/issues/31).
> User Stories: [#32](https://github.com/sstjean/ecowitt-dashboard/issues/32) (US1),
> [#33](https://github.com/sstjean/ecowitt-dashboard/issues/33) (US2),
> [#34](https://github.com/sstjean/ecowitt-dashboard/issues/34) (US3),
> [#35](https://github.com/sstjean/ecowitt-dashboard/issues/35) (US4).

## Background — the 2026-06-29 poller wedge

During an afternoon storm the poller container stayed `Up` for 23 h yet failed
every poll cycle for ~2 hours: the newest stored reading froze at 16:42Z while
wall-clock was 18:31Z. Root cause was a transient truncated gateway payload
(`piezoRain` / `wh25` "expected array, received undefined") followed by sustained
`This operation was aborted` gateway HTTP timeouts during storm-time IoT-Wi-Fi
flakiness. A plain `docker restart ecowitt-dashboard-poller-1` immediately
recovered it (readings resumed, row count 8057 → 8284). We lost ~2 h of history
during exactly the kind of event the dashboard cares about (Feature 008
rain-fault detection consumes stored history).

**Key lesson**: *"stopped working" ≠ "container exited."* Docker's `restart:`
policy acts only on process **exit**; it does nothing for a process that is `Up`
but logically stalled. The watchdog must judge **logical health**, not process
liveness.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restart a container that is `Up` but logically stalled (poller freshness) (Priority: P1)

As the operator, I want the watchdog to restart a container that is `Up` but
logically stalled, so a wedged poller self-heals instead of silently freezing
history.

**Why this priority**: This is the exact failure that motivated the feature
(06-29 wedge). Docker's own restart policy cannot detect it, so without this the
stack silently loses data during the storms we most want recorded. It is the
primary value of the feature and an independently shippable MVP.

**Independent Test**: Freeze the newest stored reading (or point the watchdog at
a fixture whose `MAX(observed_at)` is older than the freshness threshold) while
the poller container reports `Up`. Confirm the watchdog classifies it unhealthy,
issues `docker restart` for the poller service only, and logs the reason +
timestamp. Then make readings fresh and confirm it takes no action.

**Acceptance Scenarios**:

1. **Given** the poller container is `Up` but the newest stored reading age
   exceeds the configured freshness threshold (default e.g. 5 min, configurable
   — see Open Questions), **When** the watchdog runs, **Then** it restarts the
   poller container and logs the reason + timestamp.
2. **Given** the poller is `Up` and the newest reading is fresh (within
   threshold), **When** the watchdog runs, **Then** it takes no action.
3. **Given** the 2026-06-29 wedge signature (container `Up`, readings frozen
   ~2 h), **When** the watchdog evaluates it, **Then** the health check
   classifies it unhealthy and triggers a restart.
4. **Given** any poller health evaluation, **Then** freshness is judged from the
   actual stored data (`MAX(observed_at)` in `/data/ecowitt.sqlite`, or a health
   signal exposing the last successful cycle), **not** from `docker ps` "Up".

---

### User Story 2 - Restart an unreachable/unhealthy api or web container (Priority: P1)

As the operator, I want the watchdog to restart an unreachable or unhealthy
api/web container, so the dashboard recovers without manual intervention.

**Why this priority**: api and web are the user-facing surface. If `/api/v1/health`
stops returning `ok` or the web root stops serving, the wall goes dark; recovering
these automatically is as critical as the poller. Independently shippable.

**Independent Test**: Make the api container's `/api/v1/health` unreachable / not
`ok` for the configured number of consecutive checks and confirm only the api
container is restarted; separately make the web HTTP root fail and confirm only
the web container is restarted; confirm a stalled poller never triggers an
api/web restart and vice-versa.

**Acceptance Scenarios**:

1. **Given** the api container's `/api/v1/health` does not return `ok` (or is
   unreachable) for the configured number of consecutive checks (K), **When** the
   watchdog runs, **Then** it restarts the api container and logs the reason +
   timestamp.
2. **Given** the web container's HTTP root does not serve a successful response
   for K consecutive checks, **When** the watchdog runs, **Then** it restarts the
   web container.
3. **Given** api and web are both responding normally, **When** the watchdog
   runs, **Then** it takes no action on them.
4. **Given** any run, **Then** each service is evaluated and restarted
   independently — a stalled poller never causes an api/web restart and
   vice-versa.

---

### User Story 3 - Restart cooldown/backoff + per-window cap prevents loops (Priority: P2)

As the operator, I want restart cooldown/backoff with a per-window cap, so a
genuinely broken service is not hammered in a tight restart loop and a real
outage still surfaces rather than being masked.

**Why this priority**: The safety net must not become a failure amplifier. A
service that cannot recover should be left in a visible failed state, loudly
logged, rather than restarted endlessly. Builds on US1/US2 but they are usable
without it, so P2.

**Independent Test**: Drive a service to stay unhealthy across multiple runs and
confirm (a) it is not restarted again until the cooldown elapses, (b) after the
per-window cap is reached the watchdog stops restarting it and logs loudly, and
(c) once a healthy check is observed the restart counter resets.

**Acceptance Scenarios**:

1. **Given** a service was just restarted by the watchdog, **When** the next run
   still reads it unhealthy before the cooldown has elapsed (default e.g. 10 min,
   configurable), **Then** the watchdog does **not** restart it again.
2. **Given** a service has been restarted N times within a rolling window (cap,
   e.g. 3 per hour), **When** it is still unhealthy, **Then** the watchdog stops
   restarting it, logs **loudly** that the cap was hit (so the persistent failure
   is visible rather than masked), and resumes only after the window passes.
3. **Given** a service recovers after a restart, **When** the next healthy check
   is observed, **Then** its restart counter resets.

---

### User Story 4 - Idempotent host install/uninstall via systemd timer (Priority: P2)

As the operator, I want an idempotent host install/uninstall for the watchdog,
so it can be provisioned and rolled back cleanly on `homeautomation`, matching
the existing `deploy/kiosk` pattern.

**Why this priority**: Required to actually run the watchdog on the host with no
cloud dependency, and to remove it cleanly. Operationally essential but depends
on the detection logic existing first, so P2.

**Independent Test**: Run the provisioning script on a host (or a host-like test
harness); confirm it installs a systemd timer + service (and the health-check
script) that runs the watchdog on a fixed interval, and that re-running it is a
no-op. Run the rollback script; confirm the timer is stopped/disabled and the
installed units are removed cleanly. Confirm every verdict + restart is in the
journal with a reason + timestamp.

**Acceptance Scenarios**:

1. **Given** the provisioning script is run on the host, **When** it completes,
   **Then** a systemd timer + service (and the health-check script) are installed
   and the watchdog runs on a fixed interval (default e.g. every 1–2 min,
   configurable), and **re-running provisioning is idempotent** (no-op on an
   already-provisioned host).
2. **Given** the rollback script is run, **When** it completes, **Then** the
   timer is stopped/disabled and the installed units are removed cleanly.
3. **Given** the watchdog is installed, **When** it runs, **Then** every health
   verdict and every restart action is written to the systemd journal with a
   reason + timestamp.
4. **Given** the deliverable, **Then** its layout and conventions follow
   `deploy/kiosk` (`provision.sh` / `rollback.sh` / `systemd/` / `lib/` /
   `bin/` / `tests/` / `run-checks.sh`), living at `deploy/watchdog/`.

### Edge Cases

- **Stored DB unreadable / missing** (the host named-volume DB at
  `WATCHDOG_DB_PATH` absent or locked — see research.md Decision 1):
  the watchdog must not mistake an unreadable DB for "fresh" or crash; it must
  log the read failure and treat the poller's freshness as unknown without
  blindly restarting on every run.
- **First boot / empty DB**: when there are zero stored readings yet, the poller
  should not be classified as stalled purely because `MAX(observed_at)` is null.
- **A restart does not fix the problem** (the underlying gateway/network is the
  fault): cooldown + per-window cap (US3) must prevent a hammering loop and
  surface the outage loudly.
- **`docker restart` itself fails** (daemon busy, container missing): the
  watchdog must log the failure and not wedge; it should be retried on a later
  run subject to cooldown/cap.
- **Multiple services unhealthy in the same run**: each is handled
  independently; one service's cooldown/cap does not block another's restart.
- **Clock skew between host and stored timestamps**: freshness math compares
  host wall-clock to stored UTC `observed_at`; storage is UTC, so the comparison
  must be timezone-correct (UTC vs UTC), not naive local time.
- **Backup container**: it runs periodically by design and is not continuously
  "working"; it is treated separately or excluded from watchdog restarts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The watchdog MUST run on the host `homeautomation` (192.168.10.5)
  as a periodic job with no cloud dependency, driven by a systemd timer + service
  on a fixed, configurable interval.
- **FR-002**: The watchdog MUST judge each managed service's **logical health**,
  not merely process liveness; a container reporting `Up` MUST be able to be
  classified unhealthy.
- **FR-003**: The watchdog MUST classify the **poller** as unhealthy when the
  newest stored reading age exceeds a configurable freshness threshold, judged
  from real data (the stored `MAX(observed_at)`) and NOT from `docker ps`
  status. **Resolved (research.md Decision 1)**: freshness is read **read-only
  from the SQLite DB on the host named volume** (`WATCHDOG_DB_PATH`, default
  `/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite`)
  via a `python3` stdlib helper computing `now_utc − MAX(observed_at)`. The
  rejected alternatives (`docker exec … sqlite3` — no `sqlite3` in the image and
  needs the wedged container up; adding a field to `/api/v1/health` — an
  app-code change coupling poller detection to the `api` container) are NOT
  used; `/api/v1/health` returned `ok` during the 06-29 wedge so it cannot
  detect staleness.
- **FR-004**: The watchdog MUST classify the **api** as unhealthy when
  `/api/v1/health` does not return `ok` (or is unreachable) for K consecutive
  checks, and the **web** as unhealthy when its HTTP root does not serve a
  successful response for K consecutive checks.
- **FR-005**: The watchdog MUST evaluate and restart each managed service
  **independently** — a stalled poller never causes an api/web restart and
  vice-versa.
- **FR-006**: On classifying a service unhealthy (and not blocked by cooldown or
  cap), the watchdog MUST recover it via `docker restart <service-container>`
  targeting only that specific service.
- **FR-007**: The watchdog MUST enforce a per-service **restart cooldown**: after
  restarting a service it MUST NOT restart that same service again until the
  cooldown elapses, even if it still reads unhealthy.
- **FR-008**: The watchdog MUST enforce a per-service **per-rolling-window cap**:
  once a service has been restarted N times within the window it MUST stop
  restarting it, log **loudly** that the cap was hit, and resume only after the
  window passes.
- **FR-009**: When a service recovers (a healthy check is observed), the watchdog
  MUST reset that service's restart counter.
- **FR-010**: The watchdog MUST log every health verdict and every restart action
  (with reason + timestamp) to the systemd journal for observability.
- **FR-011**: The install MUST be **idempotent** — re-running provisioning on an
  already-provisioned host is a no-op converging to the same state.
- **FR-012**: A rollback MUST stop/disable the timer and remove the installed
  units (and the health-check script) cleanly.
- **FR-013**: The deliverable MUST live at `deploy/watchdog/` and mirror the
  `deploy/kiosk` layout and conventions (`provision.sh`, `rollback.sh`,
  `systemd/`, `lib/`, `bin/`, `tests/`, `run-checks.sh`), including idempotent
  `install_file`-style helpers, `set -euo pipefail`, sourced libs, and a
  bats/shellcheck `run-checks.sh` gate.
- **FR-014**: The watchdog MUST tolerate a missing/unreadable/empty stored DB and
  the first-boot empty-DB case without misclassifying the poller as stalled or
  crashing; such read failures MUST be logged.
- **FR-015**: When a `docker restart` action itself fails, the watchdog MUST log
  the failure and continue, leaving recovery to a later run under cooldown/cap.

### Configurable Parameters *(values are knobs — defaults are not final; see Open Questions)*

| Parameter | Purpose | Default (provisional) |
|-----------|---------|-----------------------|
| Poller freshness threshold | Max stored-reading age before poller is "stalled" | ~5 min |
| Consecutive-failure count (K) | api/web checks failing in a row before restart | ~2–3 |
| Restart cooldown | Minimum gap between restarts of the same service | ~10 min |
| Per-window cap | Max restarts of a service per rolling window | ~3 / hour |
| Watchdog run interval | systemd timer cadence | ~1–2 min |

### Key Entities *(include if feature involves data)*

- **Managed service**: a docker-compose container the watchdog supervises
  (`poller`, `api`, `web`; backup excluded/treated separately). Has a health
  verdict, a last-restart timestamp, and a rolling restart count.
- **Health verdict**: the per-run, per-service classification (`healthy` /
  `unhealthy` / `unknown`) plus the reason that produced it.
- **Freshness signal**: the newest stored reading timestamp
  (`MAX(observed_at)`, UTC) used to judge poller logical health, or an
  equivalent last-successful-cycle signal.
- **Restart record / counters**: per-service last-restart time and rolling-window
  restart count that drive cooldown and cap decisions (persisted across runs
  since each run is a fresh process).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A poller wedge matching the 06-29 signature (container `Up`,
  readings frozen) is automatically recovered within roughly one watchdog
  interval after the freshness threshold is exceeded — no human intervention.
- **SC-002**: Lost-history during such a wedge is bounded to approximately the
  freshness threshold + one watchdog interval, instead of hours.
- **SC-003**: An unreachable/unhealthy api or web container is automatically
  recovered within K checks of the watchdog detecting the failure.
- **SC-004**: When a service is healthy, the watchdog performs **zero** restarts
  (no false-positive restarts of working services across normal operation).
- **SC-005**: A service that cannot recover is restarted no more than the
  per-window cap, and the cap-hit event is visible in the journal (the outage is
  surfaced, not masked).
- **SC-006**: Provisioning is idempotent — a second run reports/produces no
  changes — and rollback leaves the host with no watchdog units remaining.
- **SC-007**: Every restart and every verdict is reconstructable from the journal
  (reason + timestamp present for each).

## Assumptions

- Storage is UTC and display/comparison logic treats stored `observed_at` as UTC;
  freshness math compares host UTC now to stored UTC (timezone-correct).
- The stack runs via docker-compose on the host with the standard
  `ecowitt-dashboard-<service>-1` container naming; `docker restart` of an
  individual service is the proven recovery action (validated in the 06-29
  incident).
- The host has docker CLI access for the user/unit the timer runs as, and the
  stored DB is read read-only from the host named-volume path
  (`/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite`,
  root-owned) — no `docker exec` and no `sqlite3` CLI (research.md Decision 1).
- Default parameter values in the table above are starting points to be
  confirmed during planning; they are not contractual.
- Restart counters/cooldown state must survive between watchdog runs (each run is
  a short-lived process), e.g. via a small host-side state file.

## Out of Scope

- **Fixing the poller's underlying fragility** (transient-payload tolerance,
  gateway timeout + retry/backoff in the poller itself). That is a separate
  poller-hardening issue; this watchdog is the **safety net**, not the
  root-cause fix.
- **External alerting / paging** to any off-host system. Observability is via the
  local systemd journal only.
- Supervising the periodic **backup** container as a continuously-working service.

## Open Questions

> **All resolved during planning** — see research.md (Decision 1 for OQ-1/FR-003,
> Decision 5 for OQ-2..6, Decision 4 for OQ-7). Retained below for traceability.

These knobs and mechanisms were deliberately left open at spec time for planning
rather than invented here; each now has a pinned decision:

1. **Freshness read mechanism (FR-003)** — read `MAX(observed_at)` directly from
   `/data/ecowitt.sqlite` (e.g. `docker exec … sqlite3`) on the host, **or** add
   a freshness field to `/api/v1/health` (e.g. `lastReadingAt` /
   `readingAgeSeconds`) and read it over HTTP. Note the current health endpoint
   reports only store *reachability* and would have returned `ok` during the
   06-29 wedge, so it is insufficient unchanged.
2. **Exact poller freshness threshold** (provisional ~5 min).
3. **Exact consecutive-failure count K** for api/web (provisional ~2–3).
4. **Exact restart cooldown** (provisional ~10 min).
5. **Exact per-window cap and window length** (provisional ~3 / hour).
6. **Exact watchdog run interval** (provisional ~1–2 min).
7. **Where/how restart-counter + cooldown state is persisted** between runs
   (host-side state file location/format).
