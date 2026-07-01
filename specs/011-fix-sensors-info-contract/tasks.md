# Tasks: Fix Feature 007 `get_sensors_info` Contract (Bug Fix)

**Input**: Design documents from `/specs/011-fix-sensors-info-contract/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/get-sensors-info-input.md](./contracts/get-sensors-info-input.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. This is a bug fix — the constitution's Bug-Fix Regression Tests + TDD (NON-NEGOTIABLE) rules apply. Every production edit is preceded by a failing-test task (Red) and an explicit Red-verification gate before the Green implementation. Tests are **never** modified to make production pass.

> **Documented TDD exception (fabricated 007 fixtures/tests).** Feature 007 was authored against a **fake** `get_sensors_info` contract the hardware never emits. Its fixtures and the tests that asserted that shape are therefore corrected **at authoring time** during the Red phase — this is the sanctioned exception, because those tests were written against a contract that does not exist. All *new* behavioral assertions still follow strict Red → verify-Red → Green.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Path Conventions

Four-workspace monorepo (web application): `packages/shared/`, `apps/poller/`, `apps/api/`, `apps/web/`.

---

## Phase 1: Setup

**Purpose**: Confirm the working state and the canonical fixture source before any change.

- [X] T001 Confirm branch is `011-fix-sensors-info-contract`, that canonical real captures exist at `/tmp/real_sensors_page1.json` and `/tmp/real_sensors_page2.json` (16-entry bare arrays), and capture a clean baseline with `npm run typecheck` from the repo root.

---

## Phase 2: Foundational — Re-capture real device fixtures (Blocking Prerequisites)

**Purpose**: Replace the fabricated 007 fixtures with the real bare-array captures. This is the source of truth every user story's tests read from.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — the Red tests in US1/US2/US3 assert against these re-captured fixtures.

- [X] T002 [P] Replace [apps/poller/tests/fixtures/sensorsInfo/page1.json](../../apps/poller/tests/fixtures/sensorsInfo/page1.json) with the real 16-entry **bare array** from `/tmp/real_sensors_page1.json` (WS90 `1242D` registered + 15 `FFFFFFFF`/`FFFFFFFE` placeholders; de-identified radio hex ids only).
- [X] T003 [P] Replace [apps/poller/tests/fixtures/sensorsInfo/page2.json](../../apps/poller/tests/fixtures/sensorsInfo/page2.json) with the real 16-entry **bare array** from `/tmp/real_sensors_page2.json` (`wh31` CH2 `A0` registered + 15 placeholders).
- [X] T004 Rebuild [packages/shared/tests/fixtures/sensorHealth/merged.json](../../packages/shared/tests/fixtures/sensorHealth/merged.json) as the merged real bare array whose registered projection is **exactly** `{WS90 1242D, wh31 A0}` (drop the fabricated wrapper shape, the stale `12FAD` id, and the invented wired `wh25`/`C7` row).
- [X] T005 [P] Verify [packages/shared/tests/fixtures/sensorHealth/garbage.json](../../packages/shared/tests/fixtures/sensorHealth/garbage.json) is retained unchanged as the non-array guard fixture (drives the whole-payload skip → `[]` path).

**Checkpoint**: Real, placeholder-heavy fixtures are in place across `apps/poller` and `packages/shared`; the garbage guard fixture is preserved.

---

## Phase 3: User Story 1 - Poller parses the real bare-array payload so health populates live (Priority: P1) 🎯 MVP

**Goal**: `fetchSensorsInfo` (poller) and `normalizeSensorHealth` (shared) parse each page as a **bare JSON array** — defensively skipping an empty/garbage/non-array page, never throwing — so `sensorHealth` populates instead of failing every cycle.

**Independent Test**: Feed the re-captured real page 1 + page 2 bare arrays through `fetchSensorsInfo` → `normalizeSensorHealth`; confirm no throw, a merged projection is produced, and a fresh snapshot yields `sensorHealth.available:true` / `stale:false`.

### Tests for User Story 1 (Red first) ⚠️

- [X] T006 [US1] Correct/author the poller contract tests in [apps/poller/tests/sensorsInfo.test.ts](../../apps/poller/tests/sensorsInfo.test.ts) to assert the **bare-array** shape (documented authoring-time correction of the fabricated `{command:[{sensor}]}` cases): both real pages merge+dedup by `id` (`ok:true`); page 2 non-array/garbage body → skipped, page-1 sensors returned, no throw; page 1 OK + page 2 network error → page-1 sensors returned; duplicate `id` across pages appears once; `AbortError` timeout / non-2xx / non-JSON → `{ok:false}` without throwing.
- [X] T007 [US1] Correct/author the shared normalizer tests in [packages/shared/tests/sensorHealth.test.ts](../../packages/shared/tests/sensorHealth.test.ts) for the bare-array whole-payload guard: a non-array payload (`garbage.json`) → `[]`; the real merged array (`merged.json`) → a projection is produced (registered set assertions land in US2) — replacing the fabricated wrapper-walk assertions at authoring time.
- [X] T008 [US1] **Red gate**: run `npm run -w apps/poller test` and `npm run -w packages/shared test`; confirm the new bare-array tests **FAIL** because production still walks `body.command[0]!.sensor` / `extractSensorArray` walks the non-existent wrapper. Do not proceed until Red is observed.

### Implementation for User Story 1 (Green)

- [X] T009 [US1] In [packages/shared/src/schema.ts](../../packages/shared/src/schema.ts), change the whole-payload guard so `extractSensorArray`/`normalizeSensorHealth` consume a **bare array** directly (`Array.isArray(raw) ? raw : []` → `[]` on non-array) and introduce the `type RawSensorsInfo = unknown[]` alias; remove the `command`/`sensor` wrapper walk. No change to the emitted `SensorHealthEntry` fields.
- [X] T010 [US1] In [apps/poller/src/gatewayClient.ts](../../apps/poller/src/gatewayClient.ts), rewrite `fetchSensorsInfo` per-page parse to `Array.isArray(body) ? body : []` (skip non-array page, never throw), merge + dedup by `id` across pages, keep best-effort page 2 and the reused 5 s `AbortController` timeout, and change `RawSensorsInfo` to the bare-array shape; preserve 007 US4 (a fetch/parse failure never disturbs the readings write path).
- [X] T011 [US1] **Green gate**: re-run `npm run -w apps/poller test` and `npm run -w packages/shared test`; confirm all US1 tests pass with the tests unmodified since Red.

**Checkpoint**: The real bare-array payload parses end-to-end (poller fetch → shared projection) without throwing — MVP behavior restored.

---

## Phase 4: User Story 2 - Correct registered-sensor filter and signal coercion (Priority: P2)

**Goal**: "Registered" is keyed on the sensor `id` (excluding `FFFFFFFF`/`FFFFFFFE`), never `idst`; non-numeric `rssi`/`signal` (`"--"`) coerce to `null`; per-type battery rules preserved — so the served set is exactly the two real radios.

**Independent Test**: Run the real captures through `normalizeSensorHealth`; assert the projected set is exactly `{WS90 1242D, wh31 A0}`, zero placeholder ids, and no `"--"` ever surfaces as a number.

### Tests for User Story 2 (Red first) ⚠️

- [ ] T012 [US2] Author the failing registration/coercion assertions in [packages/shared/tests/sensorHealth.test.ts](../../packages/shared/tests/sensorHealth.test.ts): a placeholder row `id:"FFFFFFFF", idst:"1"` is **excluded** (registered keyed on `id`, not `idst`); the real merged projection equals exactly `{WS90 1242D, wh31 A0}` with zero placeholder ids; WS90 (`batt 5, signal 4, rssi -76`) → `battery OK`, `signalBars 4`, `rssiDbm -76`; `wh31` CH2 (`batt 0`) → `battery OK` (flag 0, never "0% empty"); any `rssi:"--"`/`signal:"--"` → `null` (never `NaN`/`0`); an entry with a non-numeric `type` is skipped while siblings survive (per-entry salvage).
- [ ] T013 [US2] **Red gate**: run `npm run -w packages/shared test`; confirm the `id`-vs-`idst` and `"--"→null` assertions **FAIL** against the current `idst === "1"` gate. Do not proceed until Red is observed.

### Implementation for User Story 2 (Green)

- [ ] T014 [US2] In [packages/shared/src/schema.ts](../../packages/shared/src/schema.ts), make placeholder-exclusion (`id ∉ {FFFFFFFF, FFFFFFFE} ∧ id ≠ ""`) the **only** registration test and delete the `idst === "1"` gate; ensure the `coerceFinite`/`coerceBars` `"--"→null` path is exercised by the placeholder rows; keep the per-type battery rules intact (type 48 `≤1 ⇒ Low` else `OK`, null ⇒ `Unknown`; type 7 `0 ⇒ OK` / `1 ⇒ Low`; unknown ⇒ `Unknown`).
- [ ] T015 [US2] **Green gate**: re-run `npm run -w packages/shared test`; confirm the projected set is exactly `{1242D, A0}` and all coercion/battery assertions pass with the tests unmodified since Red.

**Checkpoint**: The served health set is *correct* — exactly the two real radios, honest signal/battery, zero placeholders.

---

## Phase 5: User Story 3 - Honest card mapping: no fabricated wired `wh25` health row (Priority: P3)

**Goal**: outdoor/solar/rain cards bind to the real WS90 id `1242D`; indoor/baro are removed from the map entirely (no radio indicator); no invented `wh25`/`C7` health row anywhere; `wh31` CH2 (`A0`) appears only on the Sensor Health page.

**Independent Test**: Assert the card→sensor map binds outdoor/solar/rain to `1242D`, binds no card to a wired `wh25` row, and that indoor/baro render no radio indicator.

### Tests for User Story 3 (Red first) ⚠️

- [ ] T016 [P] [US3] Correct/author the failing card-map tests in [apps/web/tests/sensorCardMap.test.ts](../../apps/web/tests/sensorCardMap.test.ts): outdoor/solar/rain → WS90 `1242D`; indoor and baro **absent** from the map (no binding); no `C7`/`wh25` entry exists — replacing the fabricated `12FAD`/`C7` assertions at authoring time.
- [ ] T017 [P] [US3] Correct/author the failing render assertions in [apps/web/tests/sensorIndicator.test.ts](../../apps/web/tests/sensorIndicator.test.ts) and [apps/web/tests/sensorHealthPage.test.ts](../../apps/web/tests/sensorHealthPage.test.ts): a card with **no** backing sensor (indoor/baro) renders **no** radio/battery indicator; `wh31` CH2 (`A0`) appears on the Sensor Health page; no fabricated `wh25`/`C7` row is rendered.
- [ ] T018 [US3] Update the `sensorHealth` blocks in [apps/web/e2e/fixtures.ts](../../apps/web/e2e/fixtures.ts) to reflect WS90 (`1242D`) + `wh31` (`A0`) only and remove the `C7`/`wh25` health row (authoring-time fixture correction).
- [ ] T019 [US3] **Red gate**: run `npm run -w apps/web test`; confirm the card-map and indicator tests **FAIL** against the current `12FAD`/`C7` mapping. Do not proceed until Red is observed.

### Implementation for User Story 3 (Green)

- [ ] T020 [US3] In [apps/web/src/sensorCardMap.ts](../../apps/web/src/sensorCardMap.ts), bind outdoor/solar/rain → WS90 `1242D` and remove the indoor/baro (`C7`/`wh25`) entries so those cards have no backing sensor.
- [ ] T021 [US3] Verify [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts) (`attachCardIndicators` skips any card absent from the map → no indicator) and [apps/web/src/render/sensorIndicator.ts](../../apps/web/src/render/sensorIndicator.ts) (no fabricated radio indicator for wired/absent cards); if the type-4 `N/A` battery rule is now an uncovered dead path, remove it rather than adding a fake test (keep 100% coverage honest).
- [ ] T022 [US3] **Green gate**: re-run `npm run -w apps/web test`; confirm all US3 tests pass with the tests unmodified since Red.

**Checkpoint**: The UI is honest — real WS90 binding on outdoor/solar/rain, no radio indicator on indoor/baro, no invented `wh25` anywhere.

---

## Phase 6: Polish & Cross-Cutting — Coverage, Deploy & Live Verify

**Purpose**: Prove the fix holds the 100% coverage / typecheck / e2e gates, then rebuild and ship all three amd64 images and verify live on the real gateway.

- [ ] T023 [P] Re-verify `apps/api` is unaffected by the corrected fixtures: run `npm run -w apps/api test:coverage` and confirm [apps/api/tests/sensorHealth.test.ts](../../apps/api/tests/sensorHealth.test.ts) still passes with the `/api/v1/latest` envelope and `SensorHealthEntry` output type **unchanged**.
- [ ] T024 Coverage gate — run `npm run -w packages/shared test:coverage`, `npm run -w apps/poller test:coverage`, and `npm run -w apps/web test:coverage`; confirm **100%** statements/branches/functions/lines on all three. Remove any dead uncovered code (e.g., the now-unused type-4 `N/A` rule) rather than adding a fake test.
- [ ] T025 Run `npm run typecheck` at the repo root; confirm all four workspaces type-check clean.
- [ ] T026 Run `npm run -w apps/web e2e` (Playwright); confirm green — Sensor Health page shows WS90 + `wh31` CH2, indoor/baro show no radio indicator, and no `wh25`/`C7` row appears in [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts) / [apps/web/e2e/kiosk.spec.ts](../../apps/web/e2e/kiosk.spec.ts).
- [ ] T027 Build the three amd64 images (web + api + poller) from their repo Dockerfiles with immutable tags per the ship-images runbook (`/memories/repo/prod-deploy.md`).
- [ ] T028 Ship the three images to prod `192.168.10.5:8090` and restart the stack per the ship-images runbook.
- [ ] T029 Live-verify the served health: `curl -s http://192.168.10.5:8090/api/v1/latest | jq '.sensorHealth | {available, stale, ids: [.sensors[].id]}'`; expect `{"available":true,"stale":false,"ids":["1242D","A0"]}`.
- [ ] T030 Live-verify the poller: inspect `docker logs --since 5m <poller-container> 2>&1 | grep -i sensors_info` over ≥3 poll cycles and confirm **zero** `get_sensors_info` parse errors ("cycle failed") — the exact behavior 007 promised.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (US1/US2/US3 Red tests read these fixtures).
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 (P1) is the MVP and should land first (it makes the payload parse at all).
  - US2 (P2) depends on US1's bare-array parse being in place (it refines the *set* the parser now produces).
  - US3 (P3) is independent of US1/US2 at the code level (web card map) but its e2e/live proof benefits from the data path being correct.
- **Polish (Phase 6)**: Depends on US1–US3 complete; deploy/live-verify (T027–T030) run last, in order.

### Within Each User Story

- Red tests authored/corrected → **Red gate observed** → Green implementation → **Green gate observed**.
- Tests are never modified to make production pass; the only sanctioned test edits are the authoring-time corrections of the fabricated 007 shape, done during the Red phase.

### Parallel Opportunities

- Phase 2: T002, T003, T005 are `[P]` (distinct fixture files); T004 depends on the real captures being understood but touches a different file and can also run alongside.
- US3 Red: T016 and T017 are `[P]` (distinct test files).
- Phase 6: T023 is `[P]` with the coverage runs; deploy/verify (T027→T030) are strictly sequential.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (re-capture fixtures).
2. Phase 3 US1: Red → verify Red → Green → verify Green.
3. **STOP and VALIDATE**: the real bare arrays parse without throwing and a fresh snapshot projects health — the core regression is fixed.

### Incremental Delivery

1. Foundational fixtures in place.
2. US1 (bare-array parse) → data path restored (MVP).
3. US2 (id filter + coercion) → set is exactly `{1242D, A0}`.
4. US3 (honest card map) → UI reflects reality.
5. Polish → coverage/typecheck/e2e gates, then rebuild + ship all three images and live-verify.

---

## Notes

- `[P]` tasks = different files, no dependencies.
- Every Green task is gated by an observed Red; every Red is authored against the **re-captured real fixtures**.
- The `/api/v1/latest` envelope and `SensorHealthEntry` output type are **unchanged** — `apps/api` is re-verified (T023), not modified.
- Commit after each task or logical Red/Green pair; stop at any checkpoint to validate the story independently.
