# Implementation Plan: Rain-Gauge "Not Measuring" Fault Detection (008)

**Branch**: `008-rain-fault-detection` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/008-rain-fault-detection/spec.md](./spec.md)

**Source of truth**: GitHub Issues [#26](https://github.com/sstjean/ecowitt-dashboard/issues/26) / [#28](https://github.com/sstjean/ecowitt-dashboard/issues/28) / [#29](https://github.com/sstjean/ecowitt-dashboard/issues/29) / [#30](https://github.com/sstjean/ecowitt-dashboard/issues/30). This markdown is a derived tool; if they disagree, the Issues win.

## Summary

Detect a powered, linked WS90 piezo rain gauge that is **mis-measuring** — emitting a
valid-looking `0.00` while a rainstorm is actually falling — and surface it on the
rainfall card as a "sensor may not be reporting" indicator, distinct from a genuine
dry `0.00`. Detection is **local-only** (no NWS precip cross-check), derived from a
rolling 90-minute window of stored WS90 readings.

**Technical approach**: A pure detector module `apps/api/src/rainFault.ts` consumes the
recent stored-reading window (the same `openReadStore.getWindow` path `enrich.ts`
already uses for daily/baro derivation), evaluates the WS90 storm signature against the
piezo rain channel, and returns `{ rainSensorSuspect, rainSensorReason }`. The result is
merged onto the existing `/api/v1/latest` envelope in `buildLatestSnapshot` (FR-008, no
new endpoint). The shared `latestSnapshotSchema` gains the two fields; `apps/web`
renders a distinct kiosk-legible indicator on the rainfall card (Feature 004
conventions, Eastern-time timestamps).

The fault fires only when the **dynamic storm signature** concurs with a **near-zero
piezo** reading. The discriminator is dynamics (temperature crash + humidity surge +
gust spike), not saturation — so nightly dew (calm saturation) never trips it.

All OQ-1..OQ-4 thresholds are **empirically derived** from the production SQLite store
(8,057 readings, 2026-06-26 → 2026-06-29) and pinned as **tunable named constants**
(`RAIN_FAULT_DEFAULTS`), not magic numbers. See [research.md](./research.md) for the
per-window observed values that justify each threshold.

## Technical Context

**Language/Version**: TypeScript 5.x (ES modules, `.ts` extensions), Node 22.

**Primary Dependencies**: Fastify (API), better-sqlite3 (read store), Zod (`@ecowitt/shared` schemas), SunCalc (astro — already wired via `computeAstro`), Vite (web), Vitest (tests).

**Storage**: SQLite (`readings` table; `metrics_json` holds the WS90 channels). Read-only access from the API via `openReadStore`.

**Testing**: Vitest unit + acceptance, 100% coverage gate; Playwright for web E2E. Committed static-capture fixtures only (Constitution: Test Data Separation) — fixtures are trimmed, de-identified extracts of the ACTUAL stored per-window readings in [research.md](./research.md), replayed deterministically and never read from the live DB at test time.

**Target Platform**: Self-hosted Docker Compose on the LAN host; wall kiosk (Chromium) for the web.

**Project Type**: Web (monorepo: `apps/api` + `apps/web` + `packages/shared`).

**Performance Goals**: Detection runs synchronously inside the `/latest` request over a ≤90-minute window (~180 readings at the 30 s poll cadence); the rolling-delta scan over ≤~200 rows is sub-millisecond — well within the existing latest-route budget.

**Constraints**: Offline-first (local sensors only, FR-012); never false-positive on nightly dew (FR-006); graceful degradation on sparse/missing windows (FR-013); Storage=UTC / Display=America/New_York (NON-NEGOTIABLE); ignore removed Ambient `rain_0x*` fields (FR-002).

**Scale/Scope**: One detector module, one envelope-field addition (2 fields), one web render change. Single household, single gauge.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | One pure function over an existing data path; no new endpoint, no new storage, no new dependency. Reuses `getWindow` and `isDaytime`. |
| II. YAGNI | ✅ PASS | Only the fields and signals the three user stories require. Thresholds are constants, not a config/rules engine. No speculative "multi-sensor" abstraction. |
| III. SRP | ✅ PASS | Detector splits into pure helpers: per-signal evaluators (`tempCrash`, `humiditySurge`, `gustSpike`, `pressureDip`, `solarCollapse`, `piezoNearZero`) + a composition (`detectRainFault`). "Get the window" (route) is separate from "decide" (detector). |
| IV. TDD / 100% coverage | ✅ PASS (planned) | Red-Green-Refactor; AAA tests; each FR/SC has an acceptance test driven by committed static-capture fixtures of the observed per-window readings. Boundary tests on every threshold (incl. `MIN_PROXIES`). |
| Display Timezone | ✅ PASS | The web indicator renders any timestamp via explicit `America/New_York`. |
| Local Type-Checking Parity | ✅ PASS | `npm run typecheck` already exists per workspace; the new fields flow through `@ecowitt/shared` types. |
| Offline-First | ✅ PASS | Local WS90 only; no NWS precip call (FR-012). |
| Test Data Separation | ✅ PASS | CI fixtures are committed static captures of real readings (no PII); the live production DB is never read at test time — it was read **once, read-only**, off-host to derive thresholds (research provenance). |

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/008-rain-fault-detection/
├── plan.md              # This file
├── research.md          # Phase 0 — OQ-1..OQ-4 resolved against stored fixtures
├── data-model.md        # Phase 1 — detector entities, signals, envelope fields
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   ├── rain-fault-detector.md   # Detector input/output contract + thresholds
│   └── latest-envelope.md       # The two new /api/v1/latest fields
├── spec.md
└── tasks.md             # (created later by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
└── schema.ts            # EXTEND latestSnapshotSchema: + rainSensorSuspect, rainSensorReason
                         #   + export RainFaultState type

apps/api/src/
├── rainFault.ts         # NEW — pure detector: detectRainFault() + RAIN_FAULT_DEFAULTS
│                        #   + per-signal helpers (SRP)
├── enrich.ts            # (unchanged; reference for the getWindow/num() pattern)
├── store.ts             # (unchanged; StoredReading / getWindow)
└── routes/v1/latest.ts  # WIRE — fetch 90-min window, compute isDay, call detector,
                         #   merge rainSensorSuspect/rainSensorReason into the envelope

apps/web/src/
├── render/rainfall.ts   # RENDER — distinct "not measuring" indicator vs dry 0.00
└── render/index.ts      # PASS the suspect fields from snapshot into renderRainfall

apps/api/tests/rainFault.test.ts   # NEW — acceptance + boundary tests (static-capture fixtures)
apps/api/tests/latest.test.ts      # EXTEND — envelope carries the two fields
apps/web/tests/rainfall.test.ts    # EXTEND — indicator for suspect=true; absent for false
```

**Structure Decision**: Detection lives in `apps/api` (not `packages/shared`) because it
operates over the API-side rolling window of `StoredReading`s — the same locus as
`enrich.ts`'s `deriveDaily`/`deriveBaroTrend`. The shared package only gains the envelope
**types** (so API and web agree on the contract). The web is a presentation-only consumer.

## Phase 0 — Research

See [research.md](./research.md). Every `NEEDS CLARIFICATION` (OQ-1..OQ-4) is resolved
against the stored production fixtures with per-window observed values and a full-dataset
false-positive sweep.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — entities (Detection window, Signal evaluators, Rain-suspect state), validation rules, and the envelope-field additions.
- [contracts/rain-fault-detector.md](./contracts/rain-fault-detector.md) — the pure detector's input/output and the `RAIN_FAULT_DEFAULTS` constants.
- [contracts/latest-envelope.md](./contracts/latest-envelope.md) — the two new `/api/v1/latest` fields.
- [quickstart.md](./quickstart.md) — runnable validation scenarios mapped to SC-001..SC-006.

**Post-Design Constitution Re-check**: PASS — the design adds one pure module, two typed
fields, and one render branch; no new layers, dependencies, or endpoints were introduced
during design.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
