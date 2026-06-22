---
description: "Dependency-ordered, story-grouped task list for the Live Weather Dashboard MVP"
---

# Tasks: Live Weather Dashboard

**Input**: Design documents from `/specs/001-live-dashboard/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories),
[research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/) (`api-v1.openapi.yaml`, `gateway-livedata.md`),
[quickstart.md](quickstart.md).

**Tests**: REQUIRED. FR-057 and the project constitution mandate **test-first
development to 100% coverage** with mock/synthetic data only. Every implementation
task is preceded by a failing test task (Red → Green → Refactor). No production code
is written before a failing test exists for it.

**Source of truth**: GitHub Issues. This Feature is #1; user stories map to issues
**US1=#2, US2=#5, US3=#6, US4=#8, US5=#9, US6=#10, US7=#3, US8=#4, US9=#7**. If this
file and an Issue disagree, the **Issue wins**; `/speckit.taskstoissues` syncs these
tasks into the matching US issue bodies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: User-story label (US1–US9). Setup / Foundational / Polish carry no label.
- Every task names exact file path(s).

## Path Conventions

npm-workspaces monorepo (plan.md "Project Structure"): shared package at
`packages/shared/`, runtime apps at `apps/poller/`, `apps/api/`, `apps/web/`, each
with `src/` and `tests/`. Repo-root infra: `package.json`, `tsconfig.base.json`,
`docker-compose.yml`, `.env.example`, `scripts/`, `.github/workflows/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo scaffolding, toolchain, and the 100%-coverage CI gate.

- [X] T001 Create the npm-workspaces root: `package.json` (workspaces = `packages/*`, `apps/*`; scripts `typecheck`, `test`, `test:coverage`), `tsconfig.base.json` (ES modules, strict), and `.gitignore` (node_modules, `.env.local`, SQLite files) per plan.md.
- [X] T002 [P] Scaffold the `packages/shared` workspace: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts` (v8 coverage, 100% thresholds), empty `packages/shared/src/index.ts`.
- [X] T003 [P] Scaffold the `apps/poller` workspace: `apps/poller/package.json` (deps: better-sqlite3, zod, shared), `apps/poller/tsconfig.json`, `apps/poller/vitest.config.ts` (100% thresholds).
- [X] T004 [P] Scaffold the `apps/api` workspace: `apps/api/package.json` (deps: fastify, better-sqlite3, suncalc, zod, shared), `apps/api/tsconfig.json`, `apps/api/vitest.config.ts` (100% thresholds).
- [X] T005 [P] Scaffold the `apps/web` workspace: `apps/web/package.json` (deps: vite, shared), `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts` (jsdom, 100% thresholds), `apps/web/index.html` stub.
- [X] T006 [P] Add `.env.example` documenting every IngestionConfiguration key (data-model.md §10): `GATEWAY_BASE_URL`, `POLL_CADENCE_SECONDS`, `UI_REFRESH_SECONDS`, `HOUSEHOLD_LAT`, `HOUSEHOLD_LON`, `RAIN_FULL_SCALE_IN`, `BARO_TREND_WINDOW_HOURS`, `BARO_STEADY_EPSILON_HPA`, `NWS_USER_AGENT`, `NWS_CACHE_TTL_SECONDS`, `NWS_STALE_AFTER_SECONDS`, `NWS_TIMEOUT_MS`, `SQLITE_PATH` — no values committed (FR-055).
- [X] T007 [P] Add `.github/workflows/ci.yml`: install, `npm run typecheck` (all workspaces), `npm run test:coverage` with the 100% gate and zero-warning policy (FR-057, constitution DevOps).

**Checkpoint**: `npm install`, `npm run typecheck`, and `npm run test:coverage` all run green on the empty scaffold.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared reading model, the SQLite store (read + write), env/config
parsing, the API server skeleton with `/api/v1/health`, and the web shell (poll loop
+ typed API client + Eastern formatters + panel-grid layout). Every user story builds
on these.

**⚠️ CRITICAL**: No user-story phase may begin until this phase is complete.

### Shared model (`packages/shared`)

- [X] T008 [P] Test: zod schemas in `packages/shared/tests/schema.test.ts` — `FullMetricMap`, `LiveReadingSnapshot` (all 27 fields + bounds: humidity 0–100, windDirDeg/windAvg10mDirDeg 0–360, non-negative rain/rate/solar/uv, `isRaining` boolean), `GatewayResponse`, `LatestSnapshot`/`Health` (assert against `contracts/api-v1.openapi.yaml` shapes), incl. rejection of out-of-bounds values (data-model.md §2/§3).
- [X] T009 [P] Test: `packages/shared/tests/mapping.test.ts` — gateway payload → `FullMetricMap` (full-fidelity: extras preserved, unknown-unit fields kept as-is), unit normalisation (°C→°F, m/s→mph, mm→in, inHg→hPa), and the curated `LiveReadingSnapshot` projection using the **device-verified** field map: rain totals + rate (`0x0E`) + raining-now flag (`srain_piezo`) from `piezoRain` (NOT `rain`), `pressureHpa` from `wh25.abs` (inHg→hPa), wind/gust/dir + max-daily-gust speed + 10-min avg wind dir (`0x6D`) from `common_list`; required-field-missing ⇒ reject (gateway-livedata.md).
- [X] T010 [P] Test: `packages/shared/tests/freshness.test.ts` — Fresh / Stale (observedAt older than 3× poll cadence) / Missing derivation (data-model.md §8, FR-035).
- [X] T011 Implement `packages/shared/src/schema.ts` (zod `FullMetricMap`, `LiveReadingSnapshot`, `GatewayResponse`, `LatestSnapshot`, `Health` + inferred types) to pass T008.
- [X] T012 Implement `packages/shared/src/mapping.ts` (payload→FullMetricMap normalise/convert + curated projection of **instantaneous** fields per the device-verified map — rain totals + rate + raining-now flag from `piezoRain`, pressure from `wh25`, wind + 10-min avg wind dir from `common_list`; the derived daily aggregates `dayHighF`/`dayLowF`/`windAvg10mMph`/`maxDailyGustDir` are NOT set here — they are added API-side from history, T049a; pure unit-conversion helpers) to pass T009 (depends on T011).
- [X] T013 Implement `packages/shared/src/freshness.ts` (Fresh/Stale/Missing) to pass T010.
- [X] T014 Export the shared surface from `packages/shared/src/index.ts` (schema, mapping, freshness).

### Store (SQLite, single writer)

- [X] T015 [P] Test: `apps/poller/tests/store.test.ts` against a temp SQLite file — schema bootstrap (`readings` table: `id`, `observed_at TEXT NOT NULL UNIQUE`, `metrics_json TEXT NOT NULL`, generated column `pressure_hpa`, `idx_readings_observed_at`), insert a validated `FullMetricMap`, reject duplicate `observed_at` (data-model.md §4).
- [X] T016 Implement `apps/poller/src/store.ts` (better-sqlite3 WAL; schema init + insert) to pass T015 (depends on T011).
- [X] T017 [P] Test: `apps/api/tests/store.test.ts` against a temp SQLite file — read latest reading; read 3-hour window (for the baro trend); empty store ⇒ no row.
- [X] T018 Implement `apps/api/src/store.ts` (read-only: latest + time-window queries, WAL) to pass T017 (depends on T011).

### Config / env

- [ ] T019 [P] Test: `apps/poller/tests/config.test.ts` — parse/validate env (GATEWAY_BASE_URL required; POLL_CADENCE_SECONDS default 30, clamp/reject outside 30–60; SQLITE_PATH required; lat/lon required) per data-model.md §10.
- [ ] T020 Implement `apps/poller/src/config.ts` (zod-validated env parsing) to pass T019.
- [ ] T021 [P] Test: `apps/api/tests/config.test.ts` — API env parsing (SQLITE_PATH, HOUSEHOLD_LAT/LON, BARO_TREND_WINDOW_HOURS default 3, BARO_STEADY_EPSILON_HPA default 0.3, RAIN_FULL_SCALE_IN default 4.0, NWS_USER_AGENT required, NWS_CACHE_TTL_SECONDS default 600, NWS_STALE_AFTER_SECONDS default 3600, NWS_TIMEOUT_MS default 5000).
- [ ] T022 Implement `apps/api/src/config.ts` (zod-validated env parsing) to pass T021.

### API skeleton + web shell

- [ ] T023 [P] Test: `apps/api/tests/health.test.ts` — `fastify.inject` GET `/api/v1/health` returns `{status, storeReachable, serverTime}` per OpenAPI `Health`.
- [ ] T024 Implement `apps/api/src/server.ts` (Fastify 5, `/api/v1` prefix, route registration) and `apps/api/src/routes/v1/health.ts` to pass T023 (depends on T018, T022).
- [ ] T025 [P] Test: `apps/web/tests/eastern.test.ts` — `format/eastern.ts` renders date ("Tuesday, June 19th, 2026" with ordinal) and 12-hour time in `America/New_York`, including a DST-vs-standard date (FR-006/FR-007, timezone rule).
- [ ] T026 Implement `apps/web/src/format/eastern.ts` (Intl `America/New_York` date/time + ordinal-suffix formatters) to pass T025.
- [ ] T027 [P] Test: `apps/web/tests/api.test.ts` — typed `api.ts` fetch of `/api/v1/latest` parses `LatestSnapshot` (ok + no-data) via the shared schema, with mocked `fetch`.
- [ ] T028 Implement `apps/web/src/api.ts` (typed `/api/v1/latest` client) to pass T027 (depends on T014).
- [ ] T029 [P] Test: `apps/web/tests/main.test.ts` — poll loop ticks on the UI-refresh cadence (default 10 s, fake timers), fetches the snapshot, and dispatches to render; no thrash on refresh (FR-034a).
- [ ] T030 Implement `apps/web/src/main.ts` (UI-refresh poll loop) + `apps/web/index.html` two-column panel grid skeleton + `apps/web/src/render/index.ts` render dispatch stub to pass T029 (depends on T028).

**Checkpoint**: API serves `/api/v1/health`; web shell polls `/api/v1/latest` and lays out the empty panel grid. Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - Glanceable outdoor "now" at a glance (Priority: P1) 🎯 MVP — Issue #2

**Goal**: Headline outdoor temperature ring (current + day high ↑ / low ↓), a smaller
Feels Like ring, the Feels Like / Dewpoint / Outdoor-Humidity readouts, and a live
Eastern-zoned header clock that updates as readings arrive.

**Independent Test**: Drive the web app with a mocked `/api/v1/latest` payload
(outdoor 72°F, high 81°F, low 58°F, feels-like/dewpoint/humidity present); confirm the
outdoor ring centerpiece + ↑/↓ marks, the Feels Like companion ring between the
temperature ring and wind compass, the supporting readouts, and a header showing the
Eastern date (ordinal) + 12-hour time; push a newer payload and confirm live update
with no manual refresh.

### Tests (write first, must fail)

- [ ] T031 [P] [US1] Test: `apps/web/tests/render/tempScale.test.ts` — `tempF→color` visible-spectrum interpolation (violet→red, ~10–120°F); ≥100°F maps to a legible hot red, smooth/no banding (FR-012/FR-013, data-model.md §9).
- [ ] T032 [P] [US1] Test: `apps/web/tests/render/outdoorRing.test.ts` — renders current °F centerpiece + day high (↑) / low (↓), and Feels Like / Dewpoint / Outdoor-Humidity readouts with units (FR-009/FR-010/FR-011).
- [ ] T033 [P] [US1] Test: `apps/web/tests/render/feelsLikeRing.test.ts` — Feels Like companion ring uses the shared temp scale and colours correctly at 105°F (FR-011a/FR-011b).
- [ ] T034 [P] [US1] Test: `apps/web/tests/render/header.test.ts` — three-zone header; date centered with ordinal, time right-aligned 12-hour, ticking every second in Eastern (FR-004/FR-005/FR-006/FR-007).
- [ ] T035 [P] [US1] Test: `apps/web/tests/render/liveUpdate.test.ts` — a newer snapshot re-renders the outdoor ring, Feels Like ring, and header without user interaction (FR-008, US1 scenario 4).

### Implementation

- [ ] T036 [P] [US1] Implement `apps/web/src/render/tempScale.ts` (pure visible-spectrum colour scale) to pass T031.
- [ ] T037 [US1] Implement `apps/web/src/render/outdoorRing.ts` (ring + ↑/↓ + supporting readouts) to pass T032 (depends on T036).
- [ ] T038 [US1] Implement `apps/web/src/render/feelsLikeRing.ts` (companion ring) to pass T033 (depends on T036).
- [ ] T039 [US1] Implement `apps/web/src/render/header.ts` (three-zone header + 1 s clock tick via Eastern formatters) to pass T034 (depends on T026).
- [ ] T040 [US1] Wire outdoor ring, Feels Like ring, and header into `apps/web/src/render/index.ts` + `index.html` left column so a new snapshot updates all three to pass T035 (depends on T037, T038, T039).

**Checkpoint**: US1 fully renders from a mocked snapshot — the MVP headline view.

---

## Phase 4: User Story 7 - Live readings flow from the gateway to the screen (Priority: P1) — Issue #3

**Goal**: The real ingestion pipeline — poller pulls the GW2000B `get_livedata_info`,
validates + normalises to the full metric map, persists it (UTC), and the API serves
the latest stored reading projected to the curated snapshot — so US1–US6 show actual
household data end-to-end.

**Independent Test**: Point the poller at an in-process stub gateway serving a known
payload; run one poll cycle; GET `/api/v1/latest` and confirm `status:"ok"` with the
matching values; change the stub payload and confirm the next cycle updates the API
snapshot (and the dashboard) with no manual intervention.

### Tests (write first, must fail)

- [ ] T041 [P] [US7] Test: `apps/poller/tests/gatewayClient.test.ts` — `fetch` with `AbortController` timeout against a stub server: success returns raw JSON; timeout/connection-error returns a typed failure without throwing (FR-043/FR-046).
- [ ] T042 [P] [US7] Test: `apps/poller/tests/ingest.test.ts` — valid payload → validate → map (FullMetricMap) → persist exactly one row; returns the curated snapshot (FR-047/FR-050).
- [ ] T043 [P] [US7] Test: `apps/poller/tests/scheduler.test.ts` — fires on the poll cadence (default 30 s, fake timers) and invokes one ingest per tick (FR-045).
- [ ] T044 [P] [US7] Test: `apps/api/tests/latest.test.ts` — `fastify.inject` GET `/api/v1/latest` over a seeded temp store returns `status:"ok"` + the projected `LiveReadingSnapshot` (incl. the API-derived `dayHighF`/`dayLowF`/`windAvg10mMph`/`maxDailyGustDir`, T049a) + `serverTime` (FR-051/FR-052).
- [ ] T044a [P] [US7] Test: `apps/api/tests/enrich.daily.test.ts` — `DailyDerived` from seeded history: `dayHighF`/`dayLowF` = max/min outdoor temp since local (`America/New_York`) midnight; `windAvg10mMph` = rolling 10-min mean of `windMph`; `maxDailyGustDir` = wind dir at the largest gust since local midnight; cold-start (too little history) falls back to the current reading's instantaneous equivalent, never a fabricated zero (FR-018b, data-model.md §7b).
- [ ] T045 [P] [US7] Test: `apps/poller/tests/pipeline.integration.test.ts` — stub gateway → ingest → store → api read: API reflects the stub values, and a changed stub payload updates the latest snapshot on the next cycle (US7 scenarios 1–3).

### Implementation

- [ ] T046 [P] [US7] Implement `apps/poller/src/gatewayClient.ts` (timeout-bounded pull) to pass T041 (depends on T020).
- [ ] T047 [US7] Implement `apps/poller/src/ingest.ts` (validate → map → persist via store) to pass T042 (depends on T012, T016, T046).
- [ ] T048 [US7] Implement `apps/poller/src/scheduler.ts` + `apps/poller/src/index.ts` (cadence timer driving ingest) to pass T043 (depends on T047).
- [ ] T049 [US7] Implement `apps/api/src/routes/v1/latest.ts` (read latest → curated projection → `LatestSnapshot` with `serverTime`, merging the daily-derived aggregates from T049a) to pass T044 (depends on T018, T024); make the integration test T045 pass.
- [ ] T049a [US7] Implement `apps/api/src/enrich.ts` daily-derived section (`dayHighF`/`dayLowF`/`windAvg10mMph`/`maxDailyGustDir` computed from stored history with the cold-start fallback) and merge it into the latest projection to pass T044a (depends on T018, T049).

**Checkpoint**: Real gateway data flows stub → store → API → US1 panels.

---

## Phase 5: User Story 8 - The dashboard survives a fresh install with no data yet (Priority: P1) — Issue #4

**Goal**: With an empty store the API returns an explicit `no-data` result (HTTP 200,
never fabricated zeros) and every panel renders its Missing state (em-dash `—` on a
neutral gauge), flipping to Fresh after the first successful poll.

**Independent Test**: Start with an empty store; GET `/api/v1/latest` ⇒ `status:"no-data"`
(no error); load the dashboard ⇒ every panel shows `—` on a neutral gauge, no `0`; then
ingest one reading and confirm panels transition Missing → Fresh.

### Tests (write first, must fail)

- [ ] T050 [P] [US8] Test: extend `apps/api/tests/latest.test.ts` — empty store ⇒ `status:"no-data"`, `reading:null`, `observedAt:null`, HTTP 200, no fabricated values; assert the no-data envelope carries `conditionIcon:null` + `conditionStale:true` (the NWS icon is never fabricated from an empty store) (FR-053/FR-033, OpenAPI `noData` example).
- [ ] T051 [P] [US8] Test: `apps/web/tests/render/missingState.test.ts` — given `no-data` (and per-panel missing values), every panel renders the Missing state (`—`, neutral gauge); never a `0` (FR-035).
- [ ] T052 [P] [US8] Test: `apps/web/tests/render/freshTransition.test.ts` — Missing → Fresh transition when the first real snapshot arrives (US8 scenario 3).

### Implementation

- [ ] T053 [US8] Implement the `no-data` branch in `apps/api/src/routes/v1/latest.ts` (empty store ⇒ explicit no-data envelope; `conditionIcon` reflects the NWS cache — `null`/`conditionStale:true` until a fetch succeeds, never fabricated per FR-033) to pass T050 (depends on T049).
- [ ] T054 [US8] Implement `apps/web/src/render/freshness.ts` (per-panel Fresh/Stale/Missing presentation using shared `freshness.ts`) + wire into the render dispatch to pass T051/T052 (depends on T013, T030).

**Checkpoint**: Fresh install renders cleanly; no-data path verified end-to-end.

---

## Phase 6: User Story 2 - Read the wind at a glance (Priority: P2) — Issue #5

**Goal**: Compass panel showing current speed (mph), cardinal + bearing, current gust,
10-minute average (speed + direction), and max daily gust (direction + speed), using a rim marker.

**Independent Test**: Render with wind 8 mph from 45°, gust 14, 10-min avg 6, max daily
gust 22 from W; confirm 8 mph, "NE / 45°", gust 14, avg 6, and max-daily-gust 22 "W";
due-north renders the marker at N (0°/360°).

### Tests (write first, must fail)

- [ ] T055 [P] [US2] Test: `apps/web/tests/render/windCompass.test.ts` — speed/gust/avg (speed + cardinal direction)/max-daily-gust readouts + cardinal-from-degrees mapping + rim marker rotation; 0 mph renders calm with no misleading direction (FR-014–FR-018b incl. FR-017a, edge case).

### Implementation

- [ ] T056 [US2] Implement `apps/web/src/render/windCompass.ts` (compass gauge, rim marker, cardinal/bearing, gust/avg (speed + cardinal direction)/max-gust readouts) and wire into the left column to pass T055.

**Checkpoint**: Wind panel renders independently from a snapshot.

---

## Phase 7: User Story 3 - See today's rainfall and accumulation (Priority: P2) — Issue #6

**Goal**: A droplet that fills proportionally to the daily total (full-scale 4.0 in,
clamped, colour-escalating over cap) plus Event / Hourly / Daily / Weekly / Monthly /
Yearly totals in inches (Daily most prominent), a rain rate (in/hr), and a "raining now" indicator.

**Independent Test**: 0.00 in ⇒ empty droplet; = cap ⇒ full; between ⇒ proportional;
over cap ⇒ full + colour escalation while the true total still shows; all six totals in
inches.

### Tests (write first, must fail)

- [ ] T057 [P] [US3] Test: `apps/web/tests/render/rainfall.test.ts` — droplet fill fraction vs `RAIN_FULL_SCALE_IN` (empty / partial / full / clamped-over-cap with blue→amber→red escalation), all six totals rendered in inches, the rain **rate** in in/hr, and the **raining-now** indicator shown only when the piezo flag is set (FR-027–FR-030, FR-028a, FR-029a, FR-029b).

### Implementation

- [ ] T058 [US3] Implement `apps/web/src/render/rainfall.ts` (droplet fill + clamp + colour escalation + six totals + rain rate (in/hr) + a "raining now" indicator — all sourced from the `piezoRain` gauge upstream, T012; the panel is still **labelled "Rain"**) and wire into the right column to pass T057.

**Checkpoint**: Rainfall panel renders independently from a snapshot.

---

## Phase 8: User Story 9 - Ingestion keeps running through gateway hiccups (Priority: P2) — Issue #7

**Goal**: Timeouts and malformed/partial payloads never crash the poller and are never
persisted; the last good reading remains latest and ages to Stale; recovery resumes
Fresh automatically.

**Independent Test**: Drive the poller against a stub that intermittently times out and
returns malformed/partial payloads; confirm no crash, nothing bad persisted, retry next
cadence, last good reading still served (flipping to Stale by age), then Fresh on
recovery.

### Tests (write first, must fail)

- [ ] T059 [P] [US9] Test: extend `apps/poller/tests/ingest.test.ts` — malformed and partial payloads are rejected, nothing written, store + latest snapshot untouched (FR-047/FR-050, US9 scenario 2).
- [ ] T060 [P] [US9] Test: extend `apps/poller/tests/scheduler.test.ts` — a failed/timed-out poll does not crash or exit and the next cadence retries (FR-046, US9 scenario 1).
- [ ] T061 [P] [US9] Test: `apps/web/tests/render/staleState.test.ts` — when `observedAt` is older than 3× the poll cadence, panels show the Stale state (dimmed + `STALE`) over the last value (FR-035, US9 scenario 3).
- [ ] T062 [P] [US9] Test: `apps/poller/tests/resilience.integration.test.ts` — intermittent timeout/malformed cycles keep the last good reading latest, then a valid poll restores Fresh (US9 scenarios 1–4).

### Implementation

- [ ] T063 [US9] Harden `apps/poller/src/ingest.ts` rejection paths (no persistence on malformed/partial) to pass T059 (depends on T047).
- [ ] T064 [US9] Harden `apps/poller/src/scheduler.ts` retry/no-crash handling to pass T060/T062 (depends on T048).
- [ ] T065 [US9] Extend `apps/web/src/render/freshness.ts` Stale presentation to pass T061 (depends on T054).

**Checkpoint**: Pipeline is resilient; UI degrades honestly to Stale.

---

## Phase 9: User Story 4 - Read solar, UV, and the sun/moon position (Priority: P3) — Issue #8

**Goal**: Solar & Sky panel: solar (W/m²), UV index, Eastern sunrise/sunset, a day arc
with the sun marker at the interpolated current position (bounded before sunrise / after
sunset), and a moon-phase indicator — all computed offline (SunCalc).

**Independent Test**: With solar 540 / UV 5 and known sunrise/sunset at a known time,
confirm the readouts, Eastern sunrise/sunset, the sun marker at the correct arc
position (apex at midday; bounded outside daylight), and the moon phase.

### Tests (write first, must fail)

- [ ] T066 [P] [US4] Test: `apps/api/tests/enrich.astro.test.ts` — `AstronomicalData` from SunCalc (lat/lon + date): sunrise/sunset UTC, `sunAltitudeFraction` 0–1 bounded outside daylight, `moonPhase` (FR-021–FR-023, data-model.md §6); offline only.
- [ ] T067 [P] [US4] Test: `apps/web/tests/render/solarSky.test.ts` — solar/UV readouts, Eastern sunrise/sunset, day-arc sun-marker position (apex at midday, bounded at night), moon-phase indicator (FR-019–FR-023, edge case).

### Implementation

- [ ] T068 [US4] Implement `apps/api/src/enrich.ts` astro section (SunCalc) and include `astro` in the latest route to pass T066 (depends on T022, T049).
- [ ] T069 [US4] Implement `apps/web/src/render/solarSky.ts` (readouts + day arc + sun marker + moon phase) and wire into the left column to pass T067 (depends on T068).

**Checkpoint**: Solar & Sky panel renders with server-computed astro.

---

## Phase 10: User Story 5 - Check indoor temperature and humidity (Priority: P3) — Issue #9

**Goal**: Two smaller companion rings — indoor temperature (°F, shared temp scale) and
indoor relative humidity (%).

**Independent Test**: Indoor 70°F ⇒ ring shows 70°F; indoor RH 48% ⇒ ring shows 48%;
indoor temp ring follows the same visible-spectrum scale across refreshes.

### Tests (write first, must fail)

- [ ] T070 [P] [US5] Test: `apps/web/tests/render/indoorRings.test.ts` — indoor temperature ring (°F, shared `tempScale`) and indoor humidity ring (%) as smaller secondary dials (FR-024/FR-025/FR-026/FR-026a).

### Implementation

- [ ] T071 [US5] Implement `apps/web/src/render/indoorRings.ts` (indoor temp + humidity rings) and wire into the right column to pass T070 (depends on T036).

**Checkpoint**: Indoor rings render independently from a snapshot.

---

## Phase 11: User Story 6 - Read barometric pressure trend and current condition (Priority: P3) — Issue #10

**Goal**: Barometer panel: absolute pressure (hPa) with a 3-hour rising/steady/falling
trend + delta (or explicit "trend unavailable" with <3 h of history), and an
**NWS-sourced** sky-condition icon that greys out (stale) when NWS is unavailable
(offline-first, not offline-only).

**Independent Test**: 1013 hPa renders; rising/falling/steady over the window show the
right arrow + delta; <3 h history shows "trend unavailable" (no arrow/delta); when NWS
reports a clear sky the icon shows clear, and when NWS is unreachable/stale the icon
renders greyed without affecting any other panel.

### Tests (write first, must fail)

- [ ] T072 [P] [US6] Test: `apps/api/tests/enrich.baro.test.ts` — `BarometricTrend` over the 3 h window: rising (`delta > +epsilon`), falling (`delta < -epsilon`), and steady (`|delta| <= BARO_STEADY_EPSILON_HPA`) deterministically, plus `unavailable`/null when <3 h of history exist (FR-031/FR-032/FR-032a, data-model.md §7/§10).
- [ ] T073 [P] [US6] Test: `apps/api/tests/nws.map.test.ts` — pure `nwsObservation → conditionIcon` mapping over the vocabulary (`clear`/`partly-cloudy`/`cloudy`/`fog`/`rainy`/`snow`/`thunderstorm`/`night`), incl. NWS day/night, as a pure function (FR-033, data-model.md §7a).
- [ ] T074 [P] [US6] Test: `apps/web/tests/render/barometer.test.ts` — pressure readout, trend arrow + delta (and "trend unavailable" state), the condition icon, **and the greyed stale-icon state when `conditionStale` is true** (FR-031/FR-032/FR-032a/FR-033, US6 scenarios).
- [ ] T085a [P] [US6] Test: `apps/api/tests/nws.test.ts` — injectable/mocked NWS client: success ⇒ caches + maps latest observation; reuse within `NWS_CACHE_TTL_SECONDS`; `NWS_TIMEOUT_MS` timeout ⇒ keep last good + `conditionStale:true`; last good older than `NWS_STALE_AFTER_SECONDS` ⇒ `conditionStale:true`; never throws to the route (FR-033/FR-057, no live network).

### Implementation

- [ ] T075 [US6] Implement `apps/api/src/enrich.ts` baro-trend section (3 h window read from store) to pass T072 (depends on T018, T049).
- [ ] T076 [US6] Implement `apps/api/src/nws.ts` — injectable NWS client (fetch latest observation with `NWS_USER_AGENT` + `NWS_TIMEOUT_MS`, cache for `NWS_CACHE_TTL_SECONDS`, stale after `NWS_STALE_AFTER_SECONDS`) plus the pure `conditionIcon` mapping; include `baroTrend`, `conditionIcon`, and `conditionStale` (with stale fallback on any NWS failure) in the latest route to pass T073/T085a (depends on T068, T075).
- [ ] T077 [US6] Implement `apps/web/src/render/barometer.ts` (pressure + trend + condition icon, incl. trend-unavailable state and **greyed icon when `conditionStale` is true**) and wire into the right column to pass T074 (depends on T076).

**Checkpoint**: All nine user stories independently functional.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Responsive behavior, accessibility, containerization, backup, and the
quickstart validation — concerns that span stories.

- [ ] T078 [P] Test + implement responsive layout in `apps/web/tests/render/responsive.test.ts` + `apps/web/src/styles.css`: two-column ≥900px; stacked single-column (Outdoors→Solar→Indoors→Rainfall→Barometer) below; iPad Air M2 landscape/portrait (FR-038/FR-039/FR-039a).
- [ ] T079 [P] Test + implement accessibility in `apps/web/tests/a11y.test.ts`: hamburger menu focus outline + ≥44px touch targets; headline dials legible at glance distance (FR-040/FR-041).
- [ ] T080 [P] Implement the hamburger menu + in-app nav (Live active; History/Trends/Records/Settings placeholders) in `apps/web/src/render/header.ts` (FR-003/FR-004a).
- [ ] T081 [P] Add `apps/poller/Dockerfile`, `apps/api/Dockerfile`, `apps/web/Dockerfile` (build → nginx static), pinned base-image tags (no `latest`).
- [ ] T082 Add `docker-compose.yml` (poller + api + web + backup sidecar; `restart: unless-stopped`; SQLite volume; pinned tags) per plan.md.
- [ ] T083 [P] Add `scripts/backup-sqlite.sh` (online `.backup` to off-host target) + restore notes (Decision 11 / finding C1).
- [ ] T084 Run the [quickstart.md](quickstart.md) validation end-to-end (US7/US8/US9 flows + full-fidelity capture check + Eastern standard/DST date checks); record first-legible-paint timing on the Surface Pro 3 (SC-004) and the glance-readability check (SC-001); confirm `npm run typecheck` and `npm run test:coverage` are green at 100%.
- [ ] T085 [P] Test + implement an architectural import-boundary guard in `apps/api/tests/boundary.test.ts` (or a lint rule): assert only `apps/poller` depends on `gatewayClient` (the single cross-VLAN consumer, FR-044) and `apps/web` reaches data only via `api.ts`, never the store or gateway (FR-036).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**.
- **User Stories (Phases 3–11)**: each depends only on Foundational. Recommended build
  order follows priority: P1 (US1 → US7 → US8) → P2 (US2, US3, US9) → P3 (US4, US5, US6).
  US1 is testable against a mocked API; US7 then wires the real pipeline behind it.
- **Polish (Phase 12)**: depends on the desired user stories being complete.

### Story-level dependencies / sequencing notes

- **US1 (#2)**: needs only the shared schema + web shell — independently testable with a
  mocked snapshot.
- **US7 (#3)**: builds the real poller→store→API pipeline; makes US1–US6 show real data.
- **US8 (#4)**: needs the latest route (US7) to add the no-data branch + Missing rendering.
- **US9 (#7)**: hardens the US7 pipeline (rejection/retry) + adds Stale rendering.
- **US4 (#8)** extends `apps/api/src/enrich.ts` (astro). **US6 (#10)** adds the baro
  trend in `enrich.ts` **and** the NWS sky-condition icon in a new
  `apps/api/src/nws.ts`; the NWS icon is independent of US4 (NWS supplies its own
  day/night), so US6 no longer waits on US4's astro for the condition. **US7 (#3)**
  adds the daily-derived section in `enrich.ts` (`dayHighF`/`dayLowF`/
  `windAvg10mMph`/`maxDailyGustDir` from stored history, T049a) since these are not
  in the gateway payload. The shared `enrich.ts` astro/baro/daily-derived
  implementation tasks are still **not** [P] with each other (same file).
- **US2 (#5)**, **US3 (#6)**, **US5 (#9)** are independent web render panels — fully
  parallelizable once Foundational is done.

### Within each story

- The test task(s) are written first and MUST fail before implementation (Red → Green).
- Shared pure helpers (e.g., `tempScale`) before the panels that consume them.
- API enrichment before the web panels that display it.

---

## Parallel Opportunities

- **Setup**: T002–T007 run in parallel after T001.
- **Foundational**: the three test groups (shared T008–T010, store T015/T017, config
  T019/T021) are parallel; within each, implementation follows its test.
- **Across stories**: once Foundational completes, US2, US3, and US5 (pure web panels)
  can be built fully in parallel; US1 can proceed against a mocked API in parallel with
  US7's pipeline work.
- **Within a story**: all `[P]` test tasks for that story run together; independent
  render modules (different files) run in parallel.

### Parallel Example: User Story 1

```bash
# Write all US1 tests first (different files, in parallel):
Task: "tempScale.test.ts"      # T031
Task: "outdoorRing.test.ts"    # T032
Task: "feelsLikeRing.test.ts"  # T033
Task: "header.test.ts"         # T034
Task: "liveUpdate.test.ts"     # T035
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational (blocks everything).
2. Phase 3 US1 (headline view, mocked API) → **STOP and validate** the MVP look.
3. Phase 4 US7 (real pipeline) → US1 now shows live household data.
4. Phase 5 US8 (no-data path) → clean fresh-install behavior.
5. Deploy/demo the P1 slice.

### Incremental Delivery

- After P1: add P2 (US2 wind, US3 rainfall, US9 resilience) → demo.
- Then P3 (US4 solar/sky, US5 indoor, US6 barometer) → demo.
- Each story is independently testable and adds value without breaking prior stories.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every implementation task is gated by a failing test (FR-057, 100% coverage; Red → Green → Refactor).
- All tests use mock/synthetic data only — no gateway, network, or external service reachability.
- Storage UTC / display `America/New_York` everywhere; pin the timezone explicitly in every timestamped render.
- Commit after each task or logical group on branch `001-live-dashboard` (never `main`).
- GitHub Issues are the source of truth; `/speckit.taskstoissues` syncs these tasks into issues #2–#10.
