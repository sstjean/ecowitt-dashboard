# Tasks: Rain-Fault Leading-Edge False Positive Fix (014)

**Input**: Design documents from `/specs/014-rain-fault-leading-edge/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Source of truth**: GitHub Issues [#60](https://github.com/sstjean/ecowitt-dashboard/issues/60) / [#61](https://github.com/sstjean/ecowitt-dashboard/issues/61) / [#62](https://github.com/sstjean/ecowitt-dashboard/issues/62). This markdown is a derived tool; if they disagree, the Issues win.

**Tests**: REQUIRED (Constitution IV — TDD Red→Green, 100% coverage). All new behaviour is driven by static-capture fixtures replayed through the pure detector; the live DB is never read at test time.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (#61 leading-edge suppressed) or US2 (#62 dead-gauge still fires)
- All paths are workspace-relative

## Scope (from plan.md / research.md Decision "Scope confirmation")

- **Changed**: [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts), [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts), one new fixture `apps/api/tests/fixtures/rainFault/leading-edge-07-06.json`, and the generator [scripts/gen-rain-fault-fixtures.py](../../scripts/gen-rain-fault-fixtures.py).
- **UNCHANGED (confirmed in Polish)**: `packages/shared`, `apps/api/src/routes/v1/latest.ts` (`RAIN_FAULT_WINDOW_MIN` stays 90), `apps/web`, `apps/poller`. The `/api/v1/latest` envelope is byte-for-byte unchanged (SC-006).

---

## Phase 1: Setup (Baseline)

**Purpose**: Establish the pre-change GREEN baseline so the tightening guarantee is verifiable — no 008 *negative* may regress, and every 008 *positive* (fixture and re-anchored builder) must stay positive under the sustained gate.

- [X] T001 Establish baseline: run `cd apps/api && npm test -- rainFault` and `npm run test:coverage`; confirm all existing Feature 008 detector tests pass at 100% coverage over [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts) BEFORE any change (records the negatives that must stay negative).

---

## Phase 2: Foundational (Shared Detector Groundwork — BLOCKS US1 & US2)

**Purpose**: The shared detector scaffolding both stories build on — the new tunable, the extracted pure helper (behaviour-preserving refactor), and the committed fixtures. No behaviour change to 008 verdicts yet; the sustained gate itself lands in US1.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 [P] Extend [scripts/gen-rain-fault-fixtures.py](../../scripts/gen-rain-fault-fixtures.py): point the DB at the read-only capture `/tmp/ecowitt-014capture.sqlite` for the 014 window, add a committed `SUSTAIN_MIN = 45` sub-window self-verification (evaluate the signature over both the full window and the `now − 45 min` sub-window, print `008=<bool> 014=<bool> OK`), and emit the **07-06 leading-edge** window (`now` ≈ 17:12 EDT / 21:12Z, before the 21:15Z onset → expect `008=True 014=False`). The existing **storm-06-28** window (`20:30–23:25Z`) needs **no bounds change** — its `now − 45` sub-window (ending 22:40Z) already spans the ~22:00–22:30Z storm core → the self-verify must report `014=True` for it unchanged.
- [X] T003 Run the extended generator off-host, read-only, to generate the NEW committed fixture `apps/api/tests/fixtures/rainFault/leading-edge-07-06.json` and to **re-run the 014 self-verify on the existing** `apps/api/tests/fixtures/rainFault/storm-06-28.json` **without regenerating/altering it**; confirm the console reports `leading-edge-07-06.json … 008=True 014=False OK` and `storm-06-28.json … 014=True OK`. Depends on T002. (T016 scope check expects `storm-06-28.json` to be byte-for-byte unchanged.)
- [X] T004 [P] Add the `SUSTAIN_MIN: number` field to the `RainFaultThresholds` interface (with a doc comment) and `SUSTAIN_MIN: 45` to `RAIN_FAULT_DEFAULTS` in [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts) — named tunable per FR-014, no magic `45` in control flow.
- [X] T005 Extract the pure `signatureFired(samples, end, isDay, th): Array<[string, boolean]> | null` helper in [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts) (readiness `MIN_READINGS` + span `≥ TREND_MIN` + `piezoNearZero` gate + `≥ MIN_PROXIES` quorum → fired list, else `null`) and refactor `detectRainFault` to call it once for the full window ending at `now` (SRP + DRY, behaviour-preserving); re-run `cd apps/api && npm test -- rainFault` to confirm every 008 test stays GREEN. Depends on T004.
- [X] T018 [P] Re-anchor the 008 **positive builder** tests so they survive the sustained gate (blocks US1's T007). In [apps/api/tests/fixtures/rainFault/builders.ts](../../apps/api/tests/fixtures/rainFault/builders.ts), redesign `buildReadings` so each configured `tempDrop`/`humSurge`/`pressDip`/`solarFrac` is applied as a **per-`TREND_MIN` (30-min) rate** continuously across the span (so any 30-min rolling delta equals the configured value, clamping `solarWm2` at 0), and default the storm/night/threeProxy builders' `spanMin` to `≥ SUSTAIN_MIN + TREND_MIN` (≥ 75; use 90) with `startIso` anchored `spanMin` minutes before `now`. This keeps every positive builder's full-window verdict identical AND makes the `now − 45` sub-window assessable and firing. Verify against the (pre-T007) detector that all existing builder tests stay GREEN, then confirm they remain GREEN after T007. Independent of T005 (different file) — both must land before T007.

**Checkpoint**: Tunable + extracted helper in place, new fixture committed (storm-06-28 unchanged), positive builders re-anchored to sustained windows, 008 verdicts and coverage unchanged — story work can begin.

---

## Phase 3: User Story 1 - Leading-edge approaching storm does NOT raise a fault (Priority: P1) 🎯 MVP

**Goal**: Suppress the false positive — a storm signature that has only *recently* appeared (rain onset imminent) yields `rainSensorSuspect = false` (Issue [#61](https://github.com/sstjean/ecowitt-dashboard/issues/61), FR-001/FR-006, SC-001).

**Independent Test**: Replay `leading-edge-07-06.json` (`now` = last reading, ~17:12 EDT, before the 17:15 onset) through `detectRainFault` and confirm it emits `rainSensorSuspect = false` / reason `null`, where the current 008 detector would emit `true`.

### Tests for User Story 1 (write FIRST — verify RED)

- [X] T006 [US1] RED: add a test in [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts) that replays `leading-edge-07-06.json` at `now` = last reading and asserts `rainSensorSuspect === false` and `rainSensorReason === null`; run `cd apps/api && npm test -- rainFault` and confirm it FAILS (current detector returns `true` — the defect).

### Implementation for User Story 1

- [X] T007 [US1] GREEN: in `detectRainFault` ([apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts)) compose `signatureFired` twice — full window @ `now` AND the earlier sub-window `all.filter(s => s.t <= now − SUSTAIN_MIN*60_000)` anchored at `now − SUSTAIN_MIN*60_000` — and raise `{ true, … }` only when BOTH evaluations are non-null; return `NOT_SUSPECT` if either is `null`. Re-run the test → T006 passes (C8/C9 in the contract).
- [X] T008 [US1] Add a graceful-degradation test in [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts) using the synthetic builders in [apps/api/tests/fixtures/rainFault/builders.ts](../../apps/api/tests/fixtures/rainFault/builders.ts): a window whose earlier sub-window is too short/sparse (< `TREND_MIN` / < `MIN_READINGS`) → `false`, no exception — exercises the earlier-sub-window `null` path (FR-013, C10).
- [X] T009 [US1] Add a `SUSTAIN_MIN`-tunable test: pass custom thresholds with a different `SUSTAIN_MIN` and assert the sub-window boundary shifts the verdict accordingly (proves the threshold governs behaviour and is not a magic literal, FR-014).
- [X] T019 [US1] Add a representative **approaching-storm sweep** test in [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts) using [builders.ts](../../apps/api/tests/fixtures/rainFault/builders.ts) (mirrors the SC-004 nightly sweep): sweep a range of leading-edge windows where the full storm signature is present but concentrated in the last `< SUSTAIN_MIN` minutes (sub-window @ `now − 45` below quorum) and assert **every one** yields `rainSensorSuspect = false`, while the matching sustained variant yields `true` — proves zero leading-edge false positives across the population, not just the single 07-06 fixture (SC-005).

**Checkpoint**: The 07-06 leading-edge false positive is suppressed; the sustained gate and its degradation branches are exercised. US1 is independently testable.

---

## Phase 4: User Story 2 - Sustained real downpour with dead gauge STILL raises the fault (Priority: P1)

**Goal**: The US1 fix must not over-correct — a genuinely dead gauge during a sustained downpour still yields `rainSensorSuspect = true` with a reason noting the signature was sustained (Issue [#62](https://github.com/sstjean/ecowitt-dashboard/issues/62), FR-003/FR-005/FR-012, SC-002), and every 008 negative stays negative (FR-007, SC-003/SC-004).

**Independent Test**: Replay the existing `storm-06-28.json` (signature sustained for hours, rain flatlined 0.0) through the amended `detectRainFault` and confirm `rainSensorSuspect = true` with a "sustained" reason — the sub-window @ `now − 45` still fires the full signature.

### Tests for User Story 2

- [X] T010 [US2] Add a test in [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts) replaying the existing `storm-06-28.json` and asserting `rainSensorSuspect === true`; run `cd apps/api && npm test -- rainFault` and confirm it passes with the T007 gate in place (the signature is sustained ≫ 45 min, so the sub-window @ `now − 45` fires).

### Implementation for User Story 2

- [X] T011 [US2] Update the reason string in `detectRainFault` ([apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts)) to reflect the signature was **SUSTAINED** (FR-012) — e.g. `Storm signature sustained with no rain measured (${buildReason(fired)})` composed from the full-window fired proxies — and update the T010 assertion to match the sustained wording.
- [X] T012 [US2] Add a `SUSTAIN_MIN` boundary pair in [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts) via [builders.ts](../../apps/api/tests/fixtures/rainFault/builders.ts): (a) signature holds at `now` but NOT at `now − SUSTAIN_MIN` → `false` (C9); (b) signature holds at BOTH → `true` (C8) — pins the transition point (FR-014).
- [X] T013 [US2] Add/confirm no-regression assertions in [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts) that `dew-06-28-gate.json` (gate path), `dew-06-28-calm.json` (quorum path), and `rain-06-27.json` (measured rain) all still yield `false` — the monotonic-tightening guarantee (FR-004/FR-007, SC-003/SC-004).

**Checkpoint**: The 06-28 dead-gauge true positive still fires with a distinct "sustained" reason, the boundary is pinned, and no 008 negative regressed. Both P1 stories are satisfied.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Enforce the Constitution gates and confirm the change is confined to the detector.

- [X] T014 [P] Run `cd apps/api && npm run test:coverage` — confirm 100% statements/branches/functions/lines over [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts), including every new branch (the sustained gate, both `signatureFired` `null` paths, and the earlier-sub-window degradation path).
- [X] T015 [P] Run `cd apps/api && npm run typecheck` — confirm clean; the `RainFaultState` shape and the `detectRainFault` signature are unchanged (only `RainFaultThresholds` gained `SUSTAIN_MIN: number`).
- [X] T016 Confirm scope with `git diff --stat`: only [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts), [apps/api/tests/rainFault.test.ts](../../apps/api/tests/rainFault.test.ts), `apps/api/tests/fixtures/rainFault/*.json`, and [scripts/gen-rain-fault-fixtures.py](../../scripts/gen-rain-fault-fixtures.py) changed; verify `RAIN_FAULT_WINDOW_MIN` is still `90` in [apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts) and that `packages/shared`, `apps/web`, and `apps/poller` are untouched (SC-006).
- [X] T017 Walk the [quickstart.md](./quickstart.md) validation scenarios V1–V7 and confirm each maps to a passing test (SC-001..SC-006).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories. Within Phase 2: T003 depends on T002; T005 depends on T004; T018 depends on T004 (same file as T005 but the builders live in a *different* file, so T018 ∥ T005). T002/T004 are independent ([P]). **T018 (builder re-anchor) and T005 (extracted helper) MUST both land before US1's T007**, or the positive builder tests go RED.
- **User Stories (Phase 3–4)**: Both depend on Foundational completion.
  - US1 (Phase 3) delivers the sustained gate — it is the MVP and effectively the enabling change.
  - US2 (Phase 4) verifies no over-correction + adds the "sustained" reason; T010 relies on the T007 gate from US1, so US2 follows US1 (they are not independent for *implementation*, but each is independently *testable* via its own fixture).
- **Polish (Phase 5)**: Depends on both stories complete.

### Within Each User Story

- Tests written and RED before implementation (T006 before T007; T010 before T011's reason change).
- Detector edits in `rainFault.ts` are sequential (same file).
- Test additions in `rainFault.test.ts` are sequential (same file).

### Parallel Opportunities

- **T002** (generator, `scripts/`) ∥ **T004** (interface/defaults, `rainFault.ts`) — different files, no dependency.
- **T018** (builders, `builders.ts`) ∥ **T005** (helper, `rainFault.ts`) — different files; both gate T007.
- **T014** (coverage) ∥ **T015** (typecheck) — independent read-only gates.
- Most other tasks concentrate in `apps/api/src/rainFault.ts` and `apps/api/tests/rainFault.test.ts` and are therefore sequential (same-file, avoid conflicts).

---

## Parallel Example: Phase 2 Foundational

```bash
# T002 and T004 touch different files and can proceed together:
Task: "Extend scripts/gen-rain-fault-fixtures.py (SUSTAIN_MIN self-verify + 07-06/06-28 windows)"
Task: "Add SUSTAIN_MIN to RainFaultThresholds + RAIN_FAULT_DEFAULTS in apps/api/src/rainFault.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup baseline (GREEN + 100% coverage recorded).
2. Phase 2: Foundational (tunable, extracted helper, re-anchored builders, new leading-edge fixture).
3. Phase 3: US1 — RED (07-06 → false fails), then compose the sustained sub-window gate → GREEN.
4. **STOP and VALIDATE**: the leading-edge false positive is gone; existing 008 negatives still pass (monotonicity).

### Incremental Delivery

1. Setup + Foundational → groundwork ready.
2. US1 → the fix (leading edge suppressed) → validate → this is the deliverable value.
3. US2 → guard the 008 true positive + "sustained" reason + boundary → validate no over-correction.
4. Polish → coverage/typecheck/scope/quickstart gates.

---

## Notes

- [P] tasks = different files, no dependencies.
- The core change is a single pure function; the monotonic-tightening property (`suspect₀₁₄ = suspect₀₀₈ ∧ earlierFired≠null`) guarantees no 008 negative can flip — only the leading edge is newly suppressed.
- Fixtures are committed static captures; the production copy `/tmp/ecowitt-014capture.sqlite` is read once, off-host, read-only, only by the generator (never at test time) — Constitution: Test Data Separation.
- `SUSTAIN_MIN = 45` lives in `RAIN_FAULT_DEFAULTS`; there must be no bare `45` in the detector's control flow.
- Commit after each task or logical group; verify RED before GREEN for T006 and T010/T011.
