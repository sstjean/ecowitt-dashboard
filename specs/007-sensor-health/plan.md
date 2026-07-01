# Implementation Plan: Sensor Battery & Signal Health (007)

**Branch**: `007-sensor-health` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/007-sensor-health/spec.md](./spec.md)

**Source of truth**: GitHub Issues [#25](https://github.com/sstjean/ecowitt-dashboard/issues/25) (parent — dedicated Sensor Health page) and [#36](https://github.com/sstjean/ecowitt-dashboard/issues/36) (per-card indicators). This markdown is a derived tool; if they disagree, the Issues win.

## Summary

Surface **per-sensor battery and RF-signal health** the gateway only exposes on a
*separate* endpoint (`get_sensors_info`, paginated) — data that is entirely absent from
the `get_livedata_info` payload the poller consumes today. One feature, two UI surfaces on
top of one shared lower-tier slice:

1. **US1 (foundation, P1)** — the poller additionally fetches `get_sensors_info` (`?page=1`
   + `?page=2`), merges the pages, drops unpaired placeholders, **normalizes** every
   registered sensor to a health projection (battery status enum, signal bars, rssi,
   registration, last-seen UTC), and **persists a single-row latest snapshot** the API
   reads and attaches to the existing `/api/v1/latest` envelope.
2. **US2 (P2)** — a small signal-bars + battery indicator on each sensor-backed dashboard
   card, built from one shared indicator helper (SRP+DRY).
3. **US3 (P1, the formal deliverable)** — a dedicated in-dashboard **Sensor Health page**
   listing every registered sensor with battery + signal + last-seen (Eastern), reachable
   without breaking the single-viewport wall-kiosk layout.
4. **US4 (P1, woven through)** — honest degradation: if the extra fetch fails or returns
   garbage, readings keep flowing and health shows `Unknown`/stale — never a crash, never
   a fabricated value.

**Technical approach**: The decisive constraint is the constitution's **Single Cross-VLAN
Consumer** rule (NON-NEGOTIABLE): the poller is the *only* component permitted to cross the
main→IoT firewall pinhole, so the API **MUST NOT** fetch `get_sensors_info` itself. The
poller therefore fetches and normalizes the health set and writes it to a **dedicated
single-row `sensor_health` snapshot table** (an upsert — current state only, **not** a
history table, honoring FR-016). The API reads that one row, computes an `available`/`stale`
freshness marker (mirroring the existing `conditionStale` pattern), and merges a
`sensorHealth` object onto the latest envelope. The web is a pure presenter on both
surfaces. Battery normalization is **sensor-type-aware** (WS90 0–5 level, wh31 0/1 flag,
wh25 wired/none) so a binary flag or wired sensor is never rendered as a misleading "0%
empty battery." All thresholds (battery-`Low`, staleness) ship as **tunable named
constants**, not magic numbers — see [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (ES modules, `.ts` extensions), Node ≥22.

**Primary Dependencies**: Fastify (API), better-sqlite3 (store), Zod (`@ecowitt/shared` schemas), Vite (web vanilla-TS), Vitest (unit/acceptance), Playwright (web e2e). No new runtime dependency.

**Storage**: SQLite. **New**: a single-row `sensor_health(id=1, captured_at TEXT, sensors_json TEXT)` snapshot table (upsert), bootstrapped idempotently by both the poller (writer) and API (reader). The existing `readings` table is untouched.

**Testing**: Vitest unit + acceptance, **100% coverage gate** (statements/branches/functions/lines; `src/server.ts` excluded), Playwright e2e. TDD Red→verify→Green mandatory. Committed static-capture fixtures of real `get_sensors_info` payloads (Test Data Separation: never read the live gateway/DB at test time).

**Target Platform**: Self-hosted Docker Compose on the LAN host; Chromium wall kiosk (2160×1440, single fixed viewport) + household phones.

**Project Type**: Web (monorepo: `apps/poller` + `apps/api` + `apps/web` + `packages/shared`).

**Performance Goals**: One extra `GET get_sensors_info` per page per poll cycle (2 small requests at the 30–60 s cadence), each behind the same `AbortController` fail-fast timeout as the livedata fetch. The API read is a single-row `SELECT` + a parse of a tiny JSON array (≤ ~10 sensors) — negligible against the existing latest-route budget.

**Constraints**: **Single Cross-VLAN Consumer (NON-NEGOTIABLE)** — only the poller may reach the gateway; the API must not. Offline-first / honest degradation (US4, FR-012/FR-013). Storage=UTC / Display=America/New_York (NON-NEGOTIABLE) for every last-seen timestamp. Kiosk legibility (Feature 004) for the new indicators. The dedicated page must not break the single-viewport kiosk e2e (`apps/web/e2e/kiosk.spec.ts` "no vertical scroll"). **No new history table** (FR-016) — only the current snapshot.

**Scale/Scope**: One household, ~3 registered radios (WS90 `12FAD`, wh31 CH2 `A0`, wh25 wired/console) + placeholders. One poller fetch path, one snapshot table, one envelope object, one shared indicator helper, one health page/overlay.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | One extra fetch, one single-row snapshot table, one envelope object, one shared web indicator helper. No new endpoint, no new service, no new dependency, no history/trend machinery. |
| II. YAGNI | ✅ PASS | Only the fields/signals the four stories require. A small typed per-type battery-rule registry (3 known types + safe fallback), **not** a generic sensor-plugin framework. No history table, no config rules engine. |
| III. SRP | ✅ PASS | "Fetch" (poller `fetchSensorsInfo`) is split from "normalize" (`normalizeSensorHealth` pure) is split from "persist" (`upsertSensorHealth`) is split from "decide freshness" (API) is split from "present" (web). The web indicator is one shared builder reused by every card (no copy-paste). |
| IV. TDD / 100% coverage | ✅ PASS (planned) | Red-Green-Refactor; AAA tests; each FR/SC gets an acceptance test from committed static-capture `get_sensors_info` fixtures. Boundary tests on every threshold (battery-`Low`, staleness) and every per-type battery rule. |
| Display Timezone | ✅ PASS | Every last-seen timestamp (cards + page) renders via explicit `America/New_York` (FR-014). |
| Local Type-Checking Parity | ✅ PASS | `npm run typecheck` already exists per workspace; the new `sensorHealth` types flow through `@ecowitt/shared`. |
| Offline-First / Graceful Degradation | ✅ PASS | The extra fetch is non-blocking: its failure never touches the `readings` write path; health degrades to `Unknown`/stale (US4). |
| Single Cross-VLAN Consumer (NON-NEGOTIABLE) | ✅ PASS | The poller is the sole gateway client; the API reads only the store. This rule is what *forces* the poller-written-snapshot architecture (see research D1). |
| Input Validation | ✅ PASS | The `get_sensors_info` payload is Zod-validated; partial garbage is salvaged per-entry, whole-payload garbage is rejected without corrupting the store (FR-012). |
| Test Data Separation | ✅ PASS | CI fixtures are committed static captures of a real `get_sensors_info` response (no PII — hex radio ids only); tests never read the live gateway/DB. |

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/007-sensor-health/
├── plan.md              # This file
├── research.md          # Phase 0 — D1..D6 resolved (architecture, thresholds, mappings)
├── data-model.md        # Phase 1 — health record, per-type battery rules, envelope object
├── quickstart.md        # Phase 1 — runnable validation scenarios (SC-001..SC-007)
├── contracts/
│   ├── sensors-info-fetch.md           # Poller↔gateway get_sensors_info fetch + merge contract
│   ├── sensor-health-normalization.md  # Raw → normalized projection (per-type rules)
│   └── latest-envelope.md              # The new `sensorHealth` object on /api/v1/latest
├── spec.md
└── tasks.md             # (created later by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
└── schema.ts            # EXTEND: sensorHealthEntrySchema, sensorHealthSchema;
                         #   latestSnapshotSchema += sensorHealth; export SensorHealth* types.
                         #   NEW: normalizeSensorHealth() pure normalizer + SENSOR_HEALTH_DEFAULTS
                         #   (battery-Low thresholds, per-type rules) — single-sourced here so
                         #   poller and API agree on the projection.

apps/poller/src/
├── gatewayClient.ts     # ADD fetchSensorsInfo(baseUrl, timeoutMs, fetch): both pages, typed
│                        #   GatewayResult; never throws (mirrors fetchLivedata).
├── poll.ts              # WIRE: after the readings ingest, fetch+normalize+upsert sensor
│                        #   health in an isolated try/catch — failure reported via onError,
│                        #   readings write untouched (US4).
└── store.ts             # ADD upsertSensorHealth(capturedAtUtc, sensors); bootstrap sensor_health.

apps/api/src/
├── store.ts             # ADD getSensorHealth(): { capturedAt, sensors } | null; bootstrap table.
├── sensorHealth.ts      # NEW — buildSensorHealthEnvelope(row, now, staleSeconds): computes
│                        #   available/stale and assembles the envelope object (SRP: freshness
│                        #   decision lives here, not in the route).
└── routes/v1/latest.ts  # WIRE: read getSensorHealth(), call buildSensorHealthEnvelope, merge
                         #   `sensorHealth` into BOTH envelope branches (ok + no-data).

apps/web/src/
├── render/sensorIndicator.ts   # NEW — shared buildSignalBars()/buildBatteryBadge() helpers
│                               #   (SRP+DRY) reused by every card and the health page.
├── render/sensorHealthPage.ts  # NEW — US3 dedicated page/overlay (hidden by default; toggle).
├── render/index.ts             # WIRE: attach the indicator to each sensor-backed card via the
│                               #   sensor→card map; mount the (hidden) health overlay + toggle.
├── render/header.ts            # ADD a "Sensors" item to the EXISTING hamburger menu that
│                               #   opens the overlay; enlarge hamburger touch target + bump
│                               #   nav-item font/hit areas (touch-friendly, per Steve).
├── sensorCardMap.ts            # NEW — sensor-id → card(data-panel) mapping (US2/FR-008).
└── styles.css                  # ADD --cp-* token-based styles for bars/battery/health page.

apps/poller/tests/sensorsInfo.test.ts      # NEW — fetch + merge + honest-fail
packages/shared/tests/sensorHealth.test.ts # NEW — normalization (per-type, placeholders, partial)
apps/api/tests/sensorHealth.test.ts        # NEW — envelope available/stale; both branches
apps/web/tests/sensorIndicator.test.ts     # NEW — bars/battery builder + N/A + Unknown
apps/web/tests/sensorHealthPage.test.ts    # NEW — page rows, Low/lost-link/N/A/Unknown, Eastern
apps/web/e2e/fixtures.ts                    # EXTEND — add `sensorHealth` to BOTH mock envelopes
apps/web/e2e/{dashboard,kiosk}.spec.ts      # EXTEND/GUARD — card indicators; kiosk no-scroll holds
```

**Structure Decision**: The **normalizer lives in `packages/shared`** (`normalizeSensorHealth`)
because both the poller (which writes the snapshot) and any test must agree on the exact
projection, and the shared package is the single home for the Zod contract + derived types
(mirrors how `projectLiveReading`/`mappedReadingSchema` already live there). The **fetch and
persist** live in `apps/poller` (the sole cross-VLAN consumer). The **freshness decision**
(`available`/`stale`) lives in `apps/api/src/sensorHealth.ts` (the same locus as the
`conditionStale` computation in the latest route). The **web is presentation-only**, with one
shared indicator helper consumed by both the cards (US2) and the health page (US3).

## Phase 0 — Research

See [research.md](./research.md). Resolves:
- **D1** — *the* architecture decision: poller-written single-row snapshot vs API direct
  fetch (forced by the Single-Cross-VLAN constitutional rule).
- **D2** — battery-`Low` thresholds + per-sensor-type battery rules (defined against the live
  snapshot).
- **D3** — staleness threshold + `available`/`stale` semantics.
- **D4** — sensor-id → card mapping (one WS90 backs four cards; wh25 wired = N/A).
- **D5** — US3 page placement that preserves the single-viewport kiosk e2e. **Confirmed (Steve, 2026-06-30):** reached via a new "Sensors" item in the **existing header hamburger menu** (overlay, hidden by default); the menu also gets a touch-target + legibility upgrade (current nav text is 14px / hit areas small).
- **D6** — LiveMock/cloud-source behavior (gateway-only endpoint ⇒ Unknown).

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the `SensorHealthEntry` projection, the per-type battery
  rule registry, the snapshot table, and the `sensorHealth` envelope object.
- [contracts/sensors-info-fetch.md](./contracts/sensors-info-fetch.md) — the poller↔gateway
  fetch + two-page merge + honest-fail contract.
- [contracts/sensor-health-normalization.md](./contracts/sensor-health-normalization.md) —
  raw entry → normalized projection, per-type rules, placeholder exclusion.
- [contracts/latest-envelope.md](./contracts/latest-envelope.md) — the new `sensorHealth`
  object on `/api/v1/latest` (both branches).
- [quickstart.md](./quickstart.md) — runnable validation scenarios mapped to SC-001..SC-007.

**Post-Design Constitution Re-check**: PASS — the design adds one fetch, one single-row
snapshot table, one envelope object, one shared web helper, and one (hidden-by-default) page.
No new endpoint, dependency, service, or history storage was introduced during design; the
Single-Cross-VLAN boundary is preserved.

## Build Order

The four stories layer on one foundation; US1 is built first, then US2 and US3 proceed in
parallel on top, with US4 degradation woven into the US1 poller/API and both UIs.

1. **US1 — foundation (P1)** *(blocks everything)*:
   - `packages/shared`: `sensorHealthEntrySchema` + `sensorHealthSchema` + `normalizeSensorHealth`
     + `SENSOR_HEALTH_DEFAULTS`; extend `latestSnapshotSchema` with `sensorHealth`.
   - `apps/poller`: `fetchSensorsInfo` (both pages, honest-fail); `upsertSensorHealth` + table
     bootstrap; wire into `poll.ts` in an isolated try/catch.
   - `apps/api`: `getSensorHealth` + table bootstrap; `buildSensorHealthEnvelope`
     (`available`/`stale`); merge into BOTH latest-envelope branches.
   - **Ripple (do here, atomically):** every committed `latestSnapshotSchema` fixture and the
     two e2e mock envelopes in `apps/web/e2e/fixtures.ts` gain a `sensorHealth` object (see
     "Known ripple" below).
2. **US3 — dedicated Sensor Health page (P1, the formal #25 deliverable)** *(parallel with US2)*:
   `sensorHealthPage.ts` overlay (hidden by default), reached via a new "Sensors" item in the
   existing hamburger menu (+ hamburger/nav touch-target & legibility upgrade), rows with
   Low/lost-link/N/A/Unknown states and Eastern last-seen.
3. **US2 — per-card indicators (P2)** *(parallel with US3)*: `sensorIndicator.ts` shared
   builder + `sensorCardMap.ts`; attach to each sensor-backed card; wh25 cards show no radio
   indicator + N/A battery; all four WS90 cards reflect the single WS90 record.
4. **US4 — honest degradation (P1)** *(woven through 1–3, not a separate phase)*: poller
   isolated-fail, API `available`/`stale`, and the `Unknown`/stale visual state on both
   surfaces. Its acceptance tests drive the failure-path fixtures.

## Known Ripple — e2e + fixture breakage (learned in 008)

`latestSnapshotSchema` is a Zod `strictObject`; adding a **required** `sensorHealth` field is
a **breaking contract change**. Every place that constructs or asserts a full envelope must be
updated in the same change or `latestSnapshotSchema.parse(...)` will throw:

- `apps/web/e2e/fixtures.ts` — **both** `latestSnapshot` and `noDataSnapshot` mocks (these feed
  Playwright via `page.route` in `dashboard.spec.ts` and `kiosk.spec.ts`).
- Any API/web unit fixtures that build a `LatestSnapshot` literal (e.g. `latest.test.ts`,
  render tests that synthesize a snapshot).
- The `no-data` branch of `buildLatestSnapshot` must emit a well-formed empty
  `sensorHealth` (`available: false`, `stale: true`, `capturedAtUtc: null`, `sensors: []`).

This bit us in 008 (the two rain-fault fields). Treat the fixture/e2e update as part of the
US1 task, not an afterthought, and run `npm --workspace apps/web run test:e2e` before declaring
US1 green.

## 100% Coverage Requirement

The CI gate enforces **100%** statements/branches/functions/lines across `packages/shared`,
`apps/poller`, `apps/api`, and `apps/web` (`src/server.ts` excluded). Every new branch — each
per-type battery rule, the placeholder-exclusion path, the two-page merge, the partial-garbage
salvage path, the `available`/`stale` matrix, the wired-`N/A` and `Unknown` render branches —
needs a covering test. Run `npm run test:coverage` (per workspace) **and** `npm run typecheck`
before commit; passing tests alone do not satisfy the gate.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
