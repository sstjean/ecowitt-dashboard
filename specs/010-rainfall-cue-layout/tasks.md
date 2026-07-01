# Tasks: Rainfall-Card Cue Layout Refinement (010)

**Input**: Design documents from `/specs/010-rainfall-cue-layout/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/render-rainfall.md](contracts/render-rainfall.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. This feature is **strict TDD** — every production edit is preceded by a failing-test task (Red) and an explicit **Red-verification gate** before implementation (Green). Tests are NEVER modified to make production pass.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 — maps to the user stories in [spec.md](spec.md)
- Exact file paths are included in every task

## Scope guardrails (from plan.md)

- **Web-only.** Touch ONLY: [apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts), [apps/web/src/styles.css](../../apps/web/src/styles.css), [apps/web/tests/render/rainfall.test.ts](../../apps/web/tests/render/rainfall.test.ts), [apps/web/tests/render/index.test.ts](../../apps/web/tests/render/index.test.ts), [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts), [apps/web/e2e/kiosk.spec.ts](../../apps/web/e2e/kiosk.spec.ts), [apps/web/e2e/fixtures.ts](../../apps/web/e2e/fixtures.ts).
- **NO** `apps/api`, `apps/poller`, or `packages/shared` changes. Data contract (`reading.isRaining`, `snapshot.rainSensorSuspect`, `snapshot.rainSensorReason`) is unchanged.
- E2e layout-containment guard runs at the **kiosk viewport 2160×1440** (matching [apps/web/e2e/kiosk.spec.ts](../../apps/web/e2e/kiosk.spec.ts)) and **reuses the existing `expectContained` helper** in [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts).

---

## Phase 1: Setup

**Purpose**: Confirm the working branch and test tooling are ready.

- [X] T001 Confirm on branch `010-rainfall-cue-layout` and workspace deps installed (`npm install` at repo root); run `npm --workspace apps/web run typecheck` to establish a clean baseline.
- [X] T002 [P] Ensure Playwright browsers are installed for the web app (`cd apps/web && npx playwright install`) so the e2e containment guard can run.

**Checkpoint**: Branch confirmed, typecheck clean, Playwright ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared e2e fixtures every containment-guard task depends on. NO production behavior yet.

**⚠️ CRITICAL**: The e2e guard tasks in US1/US2/US3 cannot run until these fixtures exist.

- [X] T003 Add `rainingSnapshot` (`reading.isRaining: true`, `snapshot.rainSensorSuspect: false`), `faultSnapshot` (`rainSensorSuspect: true`, with a short `rainSensorReason`), and `longReasonFaultSnapshot` (`rainSensorSuspect: true`, with a long multi-line `rainSensorReason` for the wrap edge case) to [apps/web/e2e/fixtures.ts](../../apps/web/e2e/fixtures.ts). Derive from the existing `latestSnapshot` shape; do NOT change the envelope contract.
- [X] T004 Verify fixtures compile: run `npm --workspace apps/web run typecheck` and confirm no type errors introduced by the new fixtures.

**Checkpoint**: Fixtures available for routed e2e tests. Story work can begin.

---

## Phase 3: User Story 1 — Active-rain cue no longer clips the card (Priority: P1) 🎯 MVP

**Goal**: Move "Raining now" into the left/main column directly above the Daily Rain value; its only layout effect is to push Daily Rain + label down, and no card content clips.

**Independent Test**: Render with `isRaining = true`, `rainSensorSuspect = false`; the `.rain-now-banner[data-rain-now]` is nested inside `.rain-main` and precedes `[data-rain-daily]`; droplet + Totals grid (incl. Yearly) stay put and contained; card does not grow.

### Tests for User Story 1 (Red) ⚠️

- [X] T005 [US1] **Red (unit)** In [apps/web/tests/render/rainfall.test.ts](../../apps/web/tests/render/rainfall.test.ts) add AAA assertions: when raining (not suspect), `.rain-now-banner[data-rain-now]` is a **descendant of `.rain-main`** and appears **before** `[data-rain-daily]` in DOM order, contains the pulsing `.dot` + "Raining now" text, is NOT `hidden`, and `.rain-body` does NOT have `dimmed`; when dry, the banner is `hidden` and `[data-rain-daily]` is in normal position.
- [X] T006 [US1] **Verify Red gate** Run `npm --workspace apps/web run test:coverage` and CONFIRM the new US1 assertions FAIL against the current card-level full-width banner. Do NOT touch production yet. If a test is wrong, fix the test and re-verify Red.
- [X] T007 [US1] **Red (e2e)** In [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts) add a **State A** layout-containment guard at the **2160×1440 kiosk viewport**, routing `rainingSnapshot` via `mockLatest`: assert `.rain-now-banner` is inside `.rain-main` above `[data-rain-daily]`; **reuse `expectContained`** to assert `.drop-wrap`, `.rain-grid`, and `[data-rain-yearly]` stay within the `[data-panel="rain"]` card box; assert **only** `[data-rain-daily]` shifts down vs. the dry baseline; assert the **card does not grow** (`scrollHeight ≤ clientHeight + 1px`, fixed ±1px sub-pixel tolerance); assert the `.rain-now-text` computed `font-size` is ≥ **13px** (established cue size, FR-008 legibility).
- [X] T008 [US1] **Verify Red gate** Run `npm --workspace apps/web run test:e2e` and CONFIRM the State A guard FAILS on the current full-width banner layout. Do NOT touch production yet.

### Implementation for User Story 1 (Green)

- [X] T009 [US1] **Green** Implement the banner move to Green: in [apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts) extract a `buildRainingBanner(doc)` local builder and render it as the **first child of `.rain-main`** (above `.rv`), removing it from the card-level child list; retain `data-rain-now` + `[hidden]` (dry OR suspect) semantics. In [apps/web/src/styles.css](../../apps/web/src/styles.css) add the compact in-column banner style (blue `--cp-link` accent, pulsing dot, tightened padding, centered in column). Minimal change to pass US1 tests only.
- [X] T010 [US1] Run `npm --workspace apps/web run test:coverage` and `npm --workspace apps/web run test:e2e`; confirm all US1 unit + State A e2e assertions are Green.

**Checkpoint**: US1 fully functional and independently testable — "Raining now" no longer clips.

---

## Phase 4: User Story 2 — Sensor-fault state dims the whole card with a centered overlay (Priority: P1)

**Goal**: When `rainSensorSuspect = true`, render an absolutely-positioned, centered, full-card `.rain-fault-overlay` (⚠ + title + reason, no timestamp), and dim `.rain-body` behind it; nothing clips.

**Independent Test**: Render with `rainSensorSuspect = true`; exactly one `.rain-fault-overlay[data-rain-fault]` centered over the card; `.rain-body` has `dimmed`; no timestamp text; card contained and not grown.

### Tests for User Story 2 (Red) ⚠️

- [X] T011 [US2] **Red (unit)** In [apps/web/tests/render/rainfall.test.ts](../../apps/web/tests/render/rainfall.test.ts) add AAA assertions: when suspect, exactly one `.rain-fault-overlay[data-rain-fault]` is a card child containing `.rain-fault-icon` ("⚠"), `.rain-fault-title` ("Sensor may not be reporting"), and `.rain-fault-reason[data-rain-fault-reason]` with the reason text; `.rain-body` has `dimmed`; the overlay contains **no** time/timestamp text (no UTC); the old inline `.rain-fault` block is absent; and with `rainSensorReason: null` the overlay still renders icon + title (empty reason) without breaking.
- [X] T012 [US2] **Red (unit)** In [apps/web/tests/render/index.test.ts](../../apps/web/tests/render/index.test.ts) add/verify wiring assertions that `snapshot.rainSensorSuspect` + `snapshot.rainSensorReason` flow through into `renderRainfall` producing the new overlay structure (FR-001, no contract change).
- [X] T013 [US2] **Verify Red gate** Run `npm --workspace apps/web run test:coverage` and CONFIRM the new US2 unit assertions FAIL against the current inline `.rain-fault` block. Do NOT touch production yet. Fix any mis-authored test and re-verify Red.
- [X] T014 [US2] **Red (e2e)** In [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts) add a **State B** guard at **2160×1440**, routing `faultSnapshot`: assert exactly one `.rain-fault-overlay` is **centered** over the card (mid-x/mid-y within tolerance of card center) and **contained** (reuse `expectContained`); assert `.rain-body` carries `dimmed`; assert no card content overflows and the **card does not grow** (`scrollHeight ≤ clientHeight + 1px`, fixed ±1px tolerance); assert the `.rain-fault-title` computed `font-size` is ≥ **13px** (established cue size, FR-008 legibility). Add a second case routing `longReasonFaultSnapshot` asserting the overlay wraps/clips **inside itself** and stays within the card box (card still does not grow).
- [X] T015 [US2] **Verify Red gate** Run `npm --workspace apps/web run test:e2e` and CONFIRM the State B + long-reason guards FAIL on the current inline fault layout. Do NOT touch production yet.

### Implementation for User Story 2 (Green)

- [X] T016 [US2] **Green** Implement the overlay to Green: in [apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts) extract `buildFaultOverlay(doc, reason)` and, when suspect, append the `.rain-fault-overlay[data-rain-fault]` as the **last card child** and add the `dimmed` class to `.rain-body`; remove the old inline `.rain-fault` block. In [apps/web/src/styles.css](../../apps/web/src/styles.css) add `.rain-fault-overlay` (`position: absolute; inset: 0`, flex-centered both axes, amber/warning styling, `max-width/max-height` bounded to card, `overflow: hidden`, `overflow-wrap: anywhere`) and `.rain-body.dimmed` (reduced opacity / muted scrim). No timestamp element. Minimal change to pass US2 tests only.
- [X] T017 [US2] Run `npm --workspace apps/web run test:coverage` and `npm --workspace apps/web run test:e2e`; confirm all US2 unit + State B + long-reason e2e assertions are Green.

**Checkpoint**: US1 AND US2 both work independently — fault state dims + centers, nothing clips.

---

## Phase 5: User Story 3 — The two cues remain mutually exclusive (Priority: P2)

**Goal**: Preserve the Feature 008 invariant — a suspected fault always suppresses "Raining now" regardless of `isRaining`.

**Independent Test**: Render with `isRaining = true` AND `rainSensorSuspect = true`; only the fault overlay renders and the "Raining now" banner is not visible.

### Tests for User Story 3 (Red) ⚠️

- [X] T018 [US3] **Red (unit)** In [apps/web/tests/render/rainfall.test.ts](../../apps/web/tests/render/rainfall.test.ts) add AAA assertions: when `isRaining = true` AND `rainSensorSuspect = true`, a `.rain-fault-overlay` is present and any `.rain-now-banner` in the DOM is `hidden`/not visible (mutual exclusion); a visible banner and an overlay MUST NOT coexist for any input.
- [X] T019 [US3] **Verify Red gate** Run `npm --workspace apps/web run test:coverage`. If the assertion FAILS, proceed to T020 to make it Green. If it already passes because the retained `[hidden]` guard covers it, record this task as a **regression guard** (behavior verified, no production change required) — do NOT weaken the assertion to force a Red.

### Implementation for User Story 3 (Green)

- [X] T020 [US3] **Green** Ensure mutual exclusivity in [apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts): the banner's "hidden when dry OR suspect" guard is retained and the overlay is built only when suspect. Re-run `npm --workspace apps/web run test:coverage` to confirm the US3 assertion is Green.
- [X] T021 [US3] **e2e** In [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts) add a **State C** (neither: `isRaining:false`, `suspect:false`) containment case AND a mutual-exclusivity case (route a suspect+raining snapshot) at **2160×1440**: State C asserts no banner, no overlay, no `dimmed`, card contained; mutual-exclusivity asserts overlay present and banner not visible. Run `npm --workspace apps/web run test:e2e` to confirm Green.

**Checkpoint**: All three states are independently functional and the invariant holds.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Enforce the coverage/typecheck/e2e gates and local visual validation.

- [X] T022 **Coverage gate** Run `npm --workspace apps/web run test:coverage` and confirm **100% coverage** on [apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts) and [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts) (every branch: banner shown/hidden, overlay present/absent, dim applied, mutual exclusion, empty/missing reason).
- [X] T023 [P] Run `npm --workspace apps/web run typecheck` (`tsc --noEmit`) and confirm clean.
- [X] T024 **Full e2e guard** Run `npm --workspace apps/web run test:e2e` and confirm all three states (Raining now / sensor fault / neither) plus the **card-does-not-grow** assertion (`scrollHeight ≤ clientHeight + 1px`) and the **FR-008 legibility** font-size assertions pass at the 2160×1440 kiosk viewport.
- [X] T025 [P] Optionally add/verify a kiosk-viewport containment case in [apps/web/e2e/kiosk.spec.ts](../../apps/web/e2e/kiosk.spec.ts) for the raining and fault states (reusing the routed fixtures) if not already covered by `dashboard.spec.ts`.
- [X] T026 Run [quickstart.md](quickstart.md) local visual check: `npm --workspace apps/web run dev`, open the dashboard in Chrome, confirm banner sits above Daily Rain (raining), centered dimmed overlay (fault), nothing clipped, Eastern-time header intact.

**Checkpoint**: All gates green locally; ready to ship the web image.

---

## Phase 7: Deploy (web image only) & Prod Visual Verify

**Purpose**: Rebuild the amd64 **web** image only and ship to prod, then Playwright-verify both states on the kiosk host. Per repo `prod-deploy.md` (ship images, not source; Mac arm64 → host amd64). `api`/`poller` are NOT rebuilt or shipped.

- [ ] T027 From repo root, build the amd64 web image: `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build web`.
- [ ] T028 Ship and bring up on the kiosk host: `docker save ecowitt/web:1.0.0 | gzip -1 | ssh steve@192.168.10.5 'gunzip | docker load'` then `ssh steve@192.168.10.5 'cd ~/ecowitt-dashboard && docker compose up -d web'` (no `--build`).
- [ ] T029 **Prod visual verify** Using Playwright/Chrome against **http://192.168.10.5:8090/**, screenshot and visually confirm BOTH states: (a) "Raining now" banner above Daily Rain with Totals/Yearly fully visible and nothing clipped; (b) centered fault overlay with dimmed card content and no overflow. Confirm Eastern-time header intact and no console/network errors.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup. **Blocks** all e2e guard tasks (T007, T014, T021, T024, T025).
- **US1 (Phase 3)**: after Foundational. MVP.
- **US2 (Phase 4)**: after Foundational. Independently testable; shares `rainfall.ts`/`styles.css` with US1 so sequence US1 → US2 to keep edits clean.
- **US3 (Phase 5)**: after US1 + US2 (the invariant guards the interaction of both cues).
- **Polish (Phase 6)**: after US1–US3.
- **Deploy (Phase 7)**: after Phase 6 all-green.

### Strict-TDD ordering (inviolable)

- Red test task → **Red-verification gate** → Green implementation, for every production edit:
  - US1: T005 → T006 → T007 → T008 → **T009 (edit)** → T010
  - US2: T011/T012 → T013 → T014 → T015 → **T016 (edit)** → T017
  - US3: T018 → T019 → **T020 (edit/guard)** → T021
- Tests are never modified to make production pass. A mis-authored Red test is fixed at authoring time and Red is re-verified.

### Parallel opportunities

- T002 (Playwright install) ∥ T001 baseline.
- T023 (typecheck) ∥ T022/T024 in Polish (different concerns).
- T025 optional kiosk case ∥ other Polish tasks.
- US1 and US2 unit-test authoring could be drafted in parallel, but because both edit `rainfall.ts` + `styles.css`, implement US1 → US2 sequentially.

---

## Implementation Strategy

- **MVP = User Story 1** (P1): "Raining now" moved in-column, no clipping — delivers the most common everyday state on its own.
- **Increment 2 = User Story 2** (P1): centered dimmed fault overlay — the element that actually overflowed today.
- **Increment 3 = User Story 3** (P2): mutual-exclusivity regression guard.
- Ship the web image (Phase 7) only after all unit + coverage + typecheck + e2e gates are green and the change is merged.
