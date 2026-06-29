# Tasks: Rain-Gauge "Not Measuring" Fault Detection (008)

**Input**: Design documents from `/specs/008-rain-fault-detection/`

**Prerequisites**: [plan.md](./plan.md) ✅, [spec.md](./spec.md) ✅, [research.md](./research.md) ✅, [data-model.md](./data-model.md) ✅, [contracts/rain-fault-detector.md](./contracts/rain-fault-detector.md) ✅, [contracts/latest-envelope.md](./contracts/latest-envelope.md) ✅, [quickstart.md](./quickstart.md) ✅

**Source of truth**: GitHub Issues [#26](https://github.com/sstjean/ecowitt-dashboard/issues/26) / [#28](https://github.com/sstjean/ecowitt-dashboard/issues/28) (US1) / [#29](https://github.com/sstjean/ecowitt-dashboard/issues/29) (US2) / [#30](https://github.com/sstjean/ecowitt-dashboard/issues/30) (US3). If they disagree with this file, the Issues win.

**Tests**: REQUIRED. This is a strict-TDD project (Constitution Principle IV + CI 100%-coverage gate). **Every production edit is preceded by a failing-test task (Red) and an explicit Red-verification gate before the implementation (Green).** Tests are NEVER modified to make production pass; if a test was authored wrong, revert production, fix the test, re-verify Red, then re-apply Green.

**Organization**: Tasks are grouped by the three user stories so each can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `US1`/`US2`/`US3` for user-story phases; Setup/Foundational/Polish carry no story tag
- Exact file paths are included in every task

## Path Conventions (from [plan.md](./plan.md) → Project Structure)

- Detector (NEW): [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts) · tests [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts)
- Envelope wiring: [apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts) · tests [apps/api/tests/latest.test.ts](../../apps/api/tests/latest.test.ts)
- Shared contract: [packages/shared/src/schema.ts](../../packages/shared/src/schema.ts) · tests [packages/shared/tests/schema.test.ts](../../packages/shared/tests/schema.test.ts)
- Web render: [apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts) + [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts) · tests [apps/web/tests/render/rainfall.test.ts](../../apps/web/tests/render/rainfall.test.ts) + [apps/web/tests/render/index.test.ts](../../apps/web/tests/render/index.test.ts)
- Fixtures (NEW, committed static-capture test data): `apps/api/tests/fixtures/rainFault/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the branch and stage the committed fixtures every story replays. Fixtures are **committed STATIC CAPTURES** — trimmed, de-identified extracts of the ACTUAL stored `metrics_json` rows for each window (a uniform timestamp shift is allowed), saved as deterministic JSON (this app stores no PII, so a static capture of real values is acceptable). Tests replay these captures and **NEVER** read the live production DB at test time (Constitution: Test Data Separation — deterministic, no live fetch).

- [ ] T001 [P] Confirm working branch is `008-rain-fault-detection` and create the fixtures directory `apps/api/tests/fixtures/rainFault/`
- [ ] T002 [P] Capture committed STATIC-CAPTURE STORM fixture `apps/api/tests/fixtures/rainFault/storm-06-28.json` — a deterministic UTC-ordered `StoredReading[]` extracted from the real 06-28 **signature window** (≈21:30–22:30 UTC; the wider 20:30–23:30 analysis window supplies the baseline) showing temp −13.5°F, humidity +21%, gust 17.2 mph, pressure −1.35 hPa, daytime solar 712→157 W/m², piezo `rainRateInHr`/`rainEventIn` flat at 0. Include a residual Ambient `rain_0x*` field so the "ignore ghost rain" invariant (FR-002) is testable.
- [ ] T003 [P] Capture **TWO** committed STATIC-CAPTURE DEW fixtures (both from real data) proving BOTH exclusion paths (US2): `apps/api/tests/fixtures/rainFault/dew-06-28-gate.json` — the real 06-28 ≈01:00–09:00 window where the WS90 piezo actually read **0.19 in/hr** (proves the piezo-near-zero **GATE** excludes it); and `apps/api/tests/fixtures/rainFault/dew-06-28-calm.json` — a calm-saturation window (humidity ≈99%, temp−dewpoint spread ≈0, no temp crash, gust 1–3 mph, stable pressure, solar 0) with piezo at/near **0** (proves the **QUORUM-not-met** path excludes it even when the gate would pass)
- [ ] T004 [P] Capture committed STATIC-CAPTURE RAIN fixture `apps/api/tests/fixtures/rainFault/rain-06-27.json` — the real 06-27 measured-drizzle **signature window** (≈10:58–11:07 UTC; characterized within the wider 09:59–12:08 loader window) where the piezo genuinely read 0.02 in/hr (no storm dynamics)
- [ ] T005 [P] Add a pure fixture-builder `apps/api/tests/fixtures/rainFault/builders.ts` that returns FRESH `StoredReading[]` windows per call (no shared mutable state) for threshold-boundary and edge cases (insufficient-rows/short-span, calm-saturation-with-zero-piezo, partial-signature). Each builder is deterministic and self-contained.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the shared `latestSnapshotSchema` contract that BOTH the API envelope wiring (US1) and the web indicator (US3) depend on. **No story that touches the envelope or the web can begin until this is green.**

**⚠️ CRITICAL**: Blocks T013–T015 (US1 wiring) and all of US3.

- [ ] T006 Red: extend `packages/shared/tests/schema.test.ts` — assert `latestSnapshotSchema` (a `z.strictObject`) REQUIRES `rainSensorSuspect: boolean` and `rainSensorReason: string | null`, rejects an envelope missing either field, accepts `{ true, "<reason>" }` and `{ false, null }`, and that the exported `RainFaultState` type is `{ rainSensorSuspect: boolean; rainSensorReason: string | null }`
- [ ] T007 Red-verify: run `npm --workspace packages/shared run test` and CONFIRM the new assertions FAIL (fields/type not yet present)
- [ ] T008 Green: extend `packages/shared/src/schema.ts` — add `rainSensorSuspect: z.boolean()` and `rainSensorReason: z.union([z.string(), z.null()])` to the `latestSnapshotSchema` strictObject and `export type RainFaultState = { rainSensorSuspect: boolean; rainSensorReason: string | null }` (this is the **single source** of the type — the detector imports it, never re-declares it; F4); re-run `npm --workspace packages/shared run test` to green

**Checkpoint**: Shared contract carries the two fields — envelope and web can now consume them.

---

## Phase 3: User Story 1 - Flag suspected rain-gauge fault on storm signature + zero rain (Priority: P1) 🎯 MVP

**Goal**: A pure detector raises `rainSensorSuspect = true` (with a human-readable reason) when the WS90 storm signature concurs with a near-zero piezo, returns `false` for a working gauge, and that flag reaches the existing `/api/v1/latest` envelope (FR-008, no new endpoint).

**Independent Test**: Replay the STORM fixture through `detectRainFault` → `true` + reason; replay the RAIN fixture → `false`; then `curl /api/v1/latest` and confirm both fields are present on the envelope.

### Tests for User Story 1 (write FIRST, verify Red) ⚠️

- [ ] T009 [US1] Red: create `apps/api/tests/rainFault.test.ts` (AAA, fully self-contained per test) — STORM fixture → `{ rainSensorSuspect: true, rainSensorReason: <non-null string> }` (C5/SC-001); RAIN fixture → `{ false, null }` via the piezo gate (C2/SC-003); graceful degradation when window < `TREND_MIN` minutes or < `MIN_READINGS` rows → `{ false, null }` (C1/FR-013); Ambient `rain_0x*` present but ignored → detection keys only off WS90 piezo (FR-002); reason string names the fired signals
- [ ] T010 [US1] Red: add positive-path boundary tests to `apps/api/tests/rainFault.test.ts` (uses `builders.ts`) — each `RAIN_FAULT_DEFAULTS` threshold at ±epsilon: `TEMP_DROP_F`, `HUMIDITY_SURGE_PCT`, `GUST_SPIKE_MPH`, `PRESSURE_DIP_HPA`, `SOLAR_COLLAPSE_FRAC`, `SOLAR_DAY_MIN_WM2`, `PIEZO_RATE_EPS`, `PIEZO_EVENT_EPS`, `TREND_MIN`, `MIN_READINGS`, `MIN_PROXIES` (3 proxies ⇒ `false`, 4 proxies ⇒ `true`); plus night-vs-day quorum (`isDay=false` ⇒ the solar proxy cannot fire, so the quorum must be reached from the 4 dynamics proxies, C5)
- [ ] T010a [US1] Red: add a **structural** test to `apps/api/tests/rainFault.test.ts` asserting `detectRainFault`'s signature accepts ONLY `(readings, now, isDay, thresholds?)` — there is no precipitation / NWS / network parameter — encoding **FR-012** ("local-only, no NWS cross-check"). Assert via the function's `.length` (required-arg arity) and a type-level check that no NWS/precipitation argument exists.
- [ ] T011 [US1] Red-verify: run `npm --workspace apps/api run test rainFault` and CONFIRM every test FAILS (module `rainFault.ts` does not yet exist)

### Implementation for User Story 1

- [ ] T012 [US1] Green: create `apps/api/src/rainFault.ts` — `export const RAIN_FAULT_DEFAULTS` (tunable named constants incl. `MIN_PROXIES = 4`, no magic numbers), `import type { RainFaultState } from "@ecowitt/shared"` (single-sourced; do NOT re-declare the type, F4), `export function detectRainFault(readings, now, isDay, thresholds?)`, SRP per-signal proxy helpers `tempCrash` / `humiditySurge` / `gustSpike` / `pressureDip` / `solarCollapse` plus the `piezoNearZero` gate, a single shared rolling-delta helper `maxDropOverSpan` / `maxRiseOverSpan` (DRY — not duplicated per signal), and `buildReason`. Concurrence rule per [research.md](./research.md) OQ-4 (count-based quorum): `piezoNearZero AND (count of fired proxies ≥ MIN_PROXIES)` over the 5 symmetric proxies {tempCrash, humiditySurge, gustSpike, pressureDip, isDay-gated solarCollapse}. Run T009–T010a to green; never weaken a test to pass.
- [ ] T013 [US1] Red: extend `apps/api/tests/latest.test.ts` — the `ok` branch carries `rainSensorSuspect`/`rainSensorReason` from `detectRainFault` over a `now − 90 min` window with `isDay` from `isDaytime`; the `no-data` branch carries `{ false, null }`; both fields are always present (strictObject)
- [ ] T014 [US1] Red-verify: run `npm --workspace apps/api run test latest` and CONFIRM the new envelope assertions FAIL (route not yet wired)
- [ ] T015 [US1] Green: wire `apps/api/src/routes/v1/latest.ts` `buildLatestSnapshot` — compute the 90-minute `since`, `store.getWindow(since)`, `isDay = isDaytime(now, astro.sunriseUtc, astro.sunsetUtc)`, call `detectRainFault(window, now, isDay)`, and merge `rainSensorSuspect`/`rainSensorReason` into BOTH `latestSnapshotSchema.parse(...)` branches (`ok` → detector result; `no-data` → `false`/`null`). Run T013 to green.
- [ ] T016 [US1] Gate: run `npm --workspace apps/api run test:coverage` and confirm 100% coverage across `rainFault.ts` and the wired `latest.ts`

**Checkpoint**: US1 delivers detection end-to-end (detector → envelope). The 06-28 storm flags `true`; the 06-27 measured event flags `false`. **This is the MVP.**

---

## Phase 4: User Story 2 - Nightly dewpoint convergence does NOT raise a fault (Priority: P1)

**Goal**: Lock the no-false-positive guarantee — calm nightly saturation (and any saturation without the proxy quorum) NEVER trips the fault (FR-006, SC-002, SC-004), proven via **both** exclusion paths: the piezo **gate** (real 06-28 dew window, piezo 0.19) and the **quorum** (calm-saturation window, piezo 0, fewer than `MIN_PROXIES` proxies).

**Independent Test**: Replay `dew-06-28-gate.json` (piezo 0.19) → `false` via the gate; replay `dew-06-28-calm.json` (piezo 0) → `false` via the quorum; replay a representative span of nightly-saturation windows → zero faults.

> **TDD note**: US1's STORM-`true` test already forces the full quorum rule, so a correct US1 detector should satisfy these discriminator tests. They are authored Red-first as the dew/saturation regression guards. If T019 shows any FAIL, a real detector gap exists → fix via T020 (Green). If all pass, they stand as locked guards — **never weaken them to pass**.

### Tests for User Story 2 (write FIRST, verify Red) ⚠️

- [ ] T017 [US2] Red: add to `apps/api/tests/rainFault.test.ts` — **both** dew exclusion paths: `dew-06-28-gate.json` (piezo 0.19) → `{ false, null }` via the piezo **gate** (C2/C7/SC-002); `dew-06-28-calm.json` (piezo 0, calm) → `{ false, null }` via the **quorum** (fewer than `MIN_PROXIES` proxies fire, C6/FR-006); saturation alone (high RH without the dynamics proxies) → `false`; partial-signature edge (only 3 proxies fire, e.g. gust + pressure + solar without temp/humidity) → `false` (C3 — a 4th proxy is required)
- [ ] T018 [US2] Red: add a nightly-sweep test to `apps/api/tests/rainFault.test.ts` (uses `builders.ts`) iterating a representative set of nightly-saturation windows and asserting EVERY window yields `rainSensorSuspect = false` (SC-004, zero nightly false positives)
- [ ] T019 [US2] Red-verify: run `npm --workspace apps/api run test rainFault` — confirm the US2 discriminator tests execute. If any FAIL → real gap, proceed to T020. If all pass → they are locked regression guards (skip T020).

### Implementation for User Story 2 (conditional)

- [ ] T020 [US2] Green (only if T019 surfaced a gap): tighten the quorum discriminator in `apps/api/src/rainFault.ts` (the `MIN_PROXIES` count over the 5 proxies) so the failing dew/saturation case returns `false`. Never modify a test to pass; if a test was authored wrong, revert, fix the test, re-verify Red, re-apply Green.
- [ ] T021 [US2] Gate: run `npm --workspace apps/api run test:coverage` and confirm 100% coverage still holds with the US2 tests included

**Checkpoint**: Dew and bare-saturation never flag; the detector discriminates dynamics from saturation.

---

## Phase 5: User Story 3 - Rainfall card shows "not measuring" indicator distinct from dry 0.00 (Priority: P1)

**Goal**: The kiosk rainfall card renders a distinct, legible "sensor may not be reporting" indicator (plus the reason) when `rainSensorSuspect = true`, visually different from a genuine dry 0.00, with any timestamp pinned to Eastern time.

**Independent Test**: Render with a `suspect=true` snapshot → distinct fault indicator + reason; render with `suspect=false` + 0.00 → normal dry state, no indicator.

**Depends on**: Foundational (T008 — schema fields) and US1 (T015 — envelope carries the fields).

### Tests for User Story 3 (write FIRST, verify Red) ⚠️

- [ ] T022 [P] [US3] Red: extend `apps/web/tests/render/rainfall.test.ts` — `rainSensorSuspect = true` ⇒ a distinct "not measuring" indicator + the `rainSensorReason`, clearly different from the dry-0.00 presentation (FR-009); `rainSensorSuspect = false` with 0.00 ⇒ normal dry state, no indicator (FR-010); any rendered timestamp uses `America/New_York` (NON-NEGOTIABLE TZ rule, FR-011); indicator honors Feature 004 kiosk-legibility conventions (FR-011)
- [ ] T023 [P] [US3] Red: extend `apps/web/tests/render/index.test.ts` — `renderRainfall` receives `rainSensorSuspect`/`rainSensorReason` from the `latest` snapshot (the suspect fields are plumbed through, FR-008/SC-006)
- [ ] T024 [US3] Red-verify: run `npm --workspace apps/web run test` and CONFIRM the new render assertions FAIL (indicator/plumbing not yet implemented)

### Implementation for User Story 3

- [ ] T025 [US3] Green: implement the indicator in `apps/web/src/render/rainfall.ts` — distinct kiosk-legible "sensor may not be reporting" badge + reason for `suspect=true`, normal dry 0.00 otherwise, Eastern-time (`America/New_York`) timestamps, Feature 004 legibility. Run T022 to green.
- [ ] T026 [US3] Green: update `apps/web/src/render/index.ts` to pass `rainSensorSuspect`/`rainSensorReason` from the snapshot into `renderRainfall`. Run T023 to green.
- [ ] T027 [US3] Gate: run `npm --workspace apps/web run test:coverage` and confirm 100% coverage across `render/rainfall.ts` and `render/index.ts`

**Checkpoint**: All three user stories are independently functional — detection, dew-suppression, and the distinct kiosk indicator.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Prove the whole stack green and run the quickstart success-criteria scenarios.

- [ ] T028 [P] Run full test + coverage per workspace and confirm 100%: `npm --workspace packages/shared run test:coverage`, `npm --workspace apps/api run test:coverage`, `npm --workspace apps/web run test:coverage`
- [ ] T029 [P] Run typecheck clean across workspaces: `npm --workspace packages/shared run typecheck`, `npm --workspace apps/api run typecheck`, `npm --workspace apps/web run typecheck` (tsc, no errors)
- [ ] T030 Execute [quickstart.md](./quickstart.md) SC-001..SC-006: SC-001 STORM→`true`, SC-002 DEW→`false`, SC-003 RAIN→`false` (detector); SC-006 fields present on `curl /api/v1/latest`; SC-005 kiosk visual — distinct indicator legible at distance with Eastern-time timestamp (Playwright/Chrome screenshot per the End-to-End Verification standard)
- [ ] T031 Confirm SC-004 (zero nightly false positives) via the US2 nightly-sweep test result and record the outcome in the PR description

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks** US1 envelope wiring (T013–T015) and all of US3.
- **US1 (Phase 3)**: detector tasks (T009–T012) depend only on Setup fixtures; envelope wiring (T013–T015) depends on Foundational (T008).
- **US2 (Phase 4)**: depends on US1 detector (T012) — extends `rainFault.test.ts`.
- **US3 (Phase 5)**: depends on Foundational (T008) and US1 wiring (T015).
- **Polish (Phase 6)**: depends on all stories complete.

### Critical TDD ordering (per implementation unit)

`Red (author failing test)` → `Red-verify (confirm it fails)` → `Green (implement)`:
- Shared schema: T006 → T007 → T008
- Detector: T009/T010/T010a → T011 → T012
- Envelope: T013 → T014 → T015
- Dew guards: T017/T018 → T019 → (T020 only if Red)
- Web indicator: T022/T023 → T024 → T025/T026

### Within each user story

Tests authored and failing before any production edit · shared rolling-delta helper before per-signal helpers · detector before envelope wiring · envelope before web render · story complete before the next.

### Parallel Opportunities

- Setup fixtures T002, T003, T004, T005 are all `[P]` (distinct files).
- US3 test authoring T022 and T023 are `[P]` (different test files).
- Polish T028 and T029 are `[P]`.
- Same-file test tasks (T009 then T010; T017 then T018) are sequential — they edit `rainFault.test.ts`.

---

## Parallel Example: Phase 1 Setup

```bash
# Capture the committed static-capture fixtures + the boundary builder together:
Task T002: storm-06-28.json       (apps/api/tests/fixtures/rainFault/)
Task T003: dew-06-28-gate.json    (apps/api/tests/fixtures/rainFault/)  # piezo 0.19 → gate path
Task T003: dew-06-28-calm.json    (apps/api/tests/fixtures/rainFault/)  # piezo 0   → quorum path
Task T004: rain-06-27.json        (apps/api/tests/fixtures/rainFault/)
Task T005: builders.ts            (apps/api/tests/fixtures/rainFault/)
```

## Parallel Example: User Story 3 test authoring

```bash
Task T022: extend apps/web/tests/render/rainfall.test.ts   (indicator + TZ + legibility)
Task T023: extend apps/web/tests/render/index.test.ts      (suspect fields plumbed in)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (schema) → 3. Phase 3 US1 (detector + envelope) → **STOP & VALIDATE**: STORM→`true`, RAIN→`false`, fields on `/api/v1/latest`. Ship the MVP.

### Incremental Delivery

1. Setup + Foundational → contract ready.
2. US1 → detection end-to-end (MVP).
3. US2 → dew/saturation no-false-positive guarantee locked.
4. US3 → distinct kiosk indicator.
5. Polish → full coverage + quickstart SC-001..SC-006.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- `[Story]` maps a task to its GitHub Issue for traceability.
- Verify Red before every Green; never modify a test to make production pass.
- Storage = UTC, Display = America/New_York is NON-NEGOTIABLE for the new indicator (FR-011).
- Fixtures are committed STATIC CAPTURES of real stored readings (Constitution: Test Data Separation) — replayed deterministically, never the live prod DB at test time.
- `RainFaultState` is single-sourced in `@ecowitt/shared` and imported by the detector (F4) — no duplicate declaration.
- Detector ignores Ambient `rain_0x*` ghost fields entirely (FR-002) — WS90 piezo only.
- Commit after each task or logical Red→Green pair.
