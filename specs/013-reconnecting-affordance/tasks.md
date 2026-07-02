---
description: "Dependency-ordered, strict-TDD task list for the Reconnecting Affordance (visible outage cue)"
---

# Tasks: Reconnecting Affordance (Visible Outage Cue)

**Feature Branch**: `013-reconnecting-affordance`

**Input**: Design documents in [specs/013-reconnecting-affordance/](./)

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/render-seam.md](./contracts/render-seam.md), [quickstart.md](./quickstart.md)

**GitHub Issues**: Feature #56 (parent) · User Story #57 (US1)

**Tests**: REQUIRED. This feature is **strict TDD** — every production edit is
preceded by a failing-test task (Red) and an explicit **Red-verification gate**
before the Green implementation task, followed by a **Green-verification gate**.
Tests are NEVER modified to make production pass; if a Red test is wrong, revert
Green, fix the test, re-verify Red, then re-apply Green.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (maps to the single user story in [spec.md](./spec.md))
- Every task lists an exact file path.

## Scope guardrails

- Touches ONLY: `apps/web/src/render/reconnecting.ts` (new),
  [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts),
  [apps/web/src/styles.css](../../apps/web/src/styles.css),
  [apps/web/src/bootstrap.ts](../../apps/web/src/bootstrap.ts) (+1 wiring line),
  `apps/web/tests/render/reconnecting.test.ts` (new),
  [apps/web/tests/render/index.test.ts](../../apps/web/tests/render/index.test.ts),
  `apps/web/e2e/reconnecting.spec.ts` (new).
- **UNCHANGED**: [apps/web/src/main.ts](../../apps/web/src/main.ts) — it already
  owns `onReconnectingChange` (the sole driver, delivered/covered in Feature 012).
- **No** changes to `apps/api`, `apps/poller`, `packages/shared`, any response
  contract, stored data, or the reconnect state machine (FR-010/FR-011).
- **Coverage nuance**: `bootstrap.ts` is coverage-EXCLUDED (wiring only) per
  [apps/web/vitest.config.ts](../../apps/web/vitest.config.ts). The covered-gate
  files are the new `render/reconnecting.ts` and the extended `render/index.ts`
  seam, which MUST reach 100%. The Playwright e2e (required) proves the composed
  wiring end-to-end and is the only automated gate for the SC-001/SC-002 timing
  bound.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the toolchains the TDD gates depend on are present.

- [X] T001 Verify workspace deps installed (`npm install` at repo root) and that
  `apps/web` scripts `test`, `test:coverage`, `typecheck`, `test:e2e` resolve.
- [X] T002 [P] Ensure Playwright chromium is installed for the e2e gate
  (`cd apps/web && npx playwright install chromium`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: There is a single user story and **no shared production foundation** —
no schema, no shared model, no API/contract change. The sole driver
(`onReconnectingChange`) already exists in `main.ts` from Feature 012 and is
left untouched. The only cross-task prerequisite is the tooling verified in
Phase 1.

- [X] T003 Confirm no shared foundation work is required (record in PR
  description): `main.ts` stays UNCHANGED (D1), `bootstrap.ts` remains
  coverage-excluded per
  [apps/web/vitest.config.ts](../../apps/web/vitest.config.ts), and no
  `apps/api` / `apps/poller` / `packages/shared` edits are in scope (FR-011).

**Checkpoint**: Foundation ready — US1 may proceed.

---

## Phase 3: User Story 1 - Operator sees a subtle "reconnecting" cue during a transient outage (Priority: P3) 🎯 MVP

**Goal**: Render the already-shipped edge-triggered reconnect signal as a subtle,
kiosk-legible cue (a quietly pulsing `--cp-warning` dot + short "Reconnecting…"
label) co-located with the header clock/freshness area. The cue appears once when
the poll loop starts failing and clears automatically when data flows again, while
the last-known panel values stay on screen untouched.

**Independent Test**: Toggle the cue via the seam and the render helper:
`set(true)` reveals a subtle cue within one `intervalMs` edge (SC-001); `set(false)`
hides it (SC-002); `set(true)` ×N stays a single steady cue with no re-animate
(SC-005); with only success the cue is never shown (SC-004); panel HTML is
byte-identical across `setReconnecting` toggles (SC-003). The e2e drives a real
fail→recover cycle and asserts the cue appears then clears while `[data-out-temp]`
persists.

> **Test authoring (constitution IV, NON-NEGOTIABLE):** every test below uses
> explicit `// Arrange` / `// Act` / `// Assert` sections and is written
> **adversarially** (drive the edge cases, not just the happy path).

### Tests for User Story 1 (write FIRST — must FAIL before implementation) ⚠️

- [X] T004 [US1] Write failing Vitest + jsdom unit tests for the new render helper
  in `apps/web/tests/render/reconnecting.test.ts` covering the
  `createReconnectingCue(doc) → { element, set(active) }` behavioural contract
  ([contracts/render-seam.md](./contracts/render-seam.md) §2): (a) hidden on
  creation — no dot/label visible (FR-003/SC-004); (b) `set(true)` reveals the cue
  with a pulsing dot AND a fixed "Reconnecting…" label (FR-001/FR-006/SC-001);
  (c) `set(false)` hides it again (FR-002/SC-002); (d) idempotent-steady —
  `set(true)` twice yields exactly one cue and does NOT re-insert the node or
  restart the pulse animation (FR-005/SC-005); (e) never-on-success — with no
  `set(true)` (or only `set(false)`) the cue never shows (FR-003/SC-004); (f) the
  cue renders a fixed label and NO time value (FR-009). Use explicit
  `// Arrange` / `// Act` / `// Assert` sections (constitution IV).
- [X] T005 [US1] Add failing seam tests to
  [apps/web/tests/render/index.test.ts](../../apps/web/tests/render/index.test.ts):
  `mountDashboard` exposes `setReconnecting(active)` and injects the cue element
  into the header area (D4); `setReconnecting(true)` shows the cue and
  `setReconnecting(false)` hides it (FR-001/FR-002); and — the panel-safety
  assertion — capture a rendered panel value (e.g. `[data-panel]` /
  `[data-out-temp]` HTML) after `update(snapshot)`, then assert it is
  byte-identical before and after `setReconnecting(true)` then `setReconnecting(false)`
  (the cue MUST NOT read, write, blank, or corrupt any panel node — FR-004/SC-003,
  INV-2); (Fresh/Stale non-interference, **G1**) with a panel already marked stale
  (`.card.stale` / stale badge present), toggling `setReconnecting(true)` then
  `(false)` leaves that panel's stale class and badge unchanged (edge case
  "Interaction with existing Fresh/Stale", INV-4); (first-paint failure, **G2**)
  with the dashboard in its initial no-data state (before any `update`, or an
  empty/no-reading snapshot), `setReconnecting(true)` shows the cue WITHOUT
  altering the no-data content (edge case "Failure exactly at first paint",
  FR-004). Use explicit `// Arrange` / `// Act` / `// Assert` sections and cover
  these adversarial edge cases (constitution IV).

### ⛔ Red-verification gate (US1)

- [X] T006 [US1] Run `cd apps/web && npm run test -- reconnecting.test.ts index.test.ts`;
  CONFIRM both files fail for the right reason (`render/reconnecting.ts` absent /
  `mountDashboard` has no `setReconnecting`). Do NOT proceed to Green until Red is
  verified.

### Implementation for User Story 1 (Green)

- [X] T007 [US1] Create `apps/web/src/render/reconnecting.ts` exporting
  `ReconnectingCue` and `createReconnectingCue(doc: Document): ReconnectingCue`
  (D5, seam §2): build a hidden cue element (a `--cp-warning` dot + "Reconnecting…"
  label via the existing `el()` helper in
  [apps/web/src/render/dom.ts](../../apps/web/src/render/dom.ts)); `set(active)`
  toggles a single class/`hidden` flag on that one element — idempotent, never
  re-inserts, never restarts the pulse, never touches a panel node
  (FR-001..FR-006/FR-009, INV-1/2/3/5). Make T004 pass.
- [X] T008 [US1] Extend `Dashboard` and `mountDashboard` in
  [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts) (seam §3):
  add `setReconnecting(active: boolean)` to the `Dashboard` interface; in
  `mountDashboard`, call `createReconnectingCue(document)`, inject `cue.element`
  into the header status area (co-located with the clock, out of the header grid
  flow per D4), and implement `setReconnecting` as a thin delegate to `cue.set`.
  `update` / `stop` behaviour stays unchanged; panels are never touched
  (FR-004/FR-007). Make T005 pass.
- [X] T009 [P] [US1] Add the subtle cue styling to
  [apps/web/src/styles.css](../../apps/web/src/styles.css): the `--cp-warning`
  dot, the short uppercase-tracked "Reconnecting…" label in the same muted-warning
  color, a slow low-amplitude opacity pulse keyframe, a hidden-by-default rule, and
  `position: relative` on `.header` + `position: absolute` on the cue so the
  header's `1fr auto 1fr` grid is undisturbed (D3/D4, FR-006/FR-007). No layout
  shift; no banner/modal.
- [X] T010 [US1] Add the ONE wiring line to
  [apps/web/src/bootstrap.ts](../../apps/web/src/bootstrap.ts) (coverage-EXCLUDED,
  seam §4): pass `onReconnectingChange: (active) => dashboard.setReconnecting(active)`
  into the existing `startPollLoop({ … })` call. No other change; `main.ts` stays
  UNCHANGED (FR-010).

### End-to-end test for User Story 1 (required — the only automated gate for the SC-001/SC-002 timing bound, G3)

- [X] T011 [P] [US1] Write `apps/web/e2e/reconnecting.spec.ts` mirroring
  [apps/web/e2e/selfheal.spec.ts](../../apps/web/e2e/selfheal.spec.ts) and honoring
  [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts): route-stub
  `**/api/v1/latest` → 200 (fixture), load `/`, assert a known value
  (`[data-out-temp]`) is visible and the cue is NOT shown; switch the stub to fail
  (500/abort) and after ~1 `intervalMs` assert the cue appears while the known value
  is STILL visible (display not blanked — FR-004/SC-003); switch the stub back to
  200 and after ~1 `intervalMs` assert the cue clears automatically with no manual
  refresh while the known value remains (FR-002/SC-002). Timing is quantified
  against `intervalMs` (~10 s default), NOT the 30 s `POLL_CADENCE_SECONDS`
  staleness threshold (D2). This e2e is the sole **automated** proof of the
  SC-001/SC-002 "within one poll interval" timing bound (T016 is the on-wall
  manual confirmation). Use explicit `// Arrange` / `// Act` / `// Assert`
  sections (constitution IV).

### ✅ Green-verification gate (US1)

- [X] T012 [US1] Run `cd apps/web && npm run test:coverage` (100% incl. the new
  `render/reconnecting.ts` and the extended `render/index.ts` seam — `bootstrap.ts`
  remains excluded) and `npm run typecheck` (clean — the new helper and extended
  `Dashboard` interface type-check). Also run
  `npm run test:e2e -- reconnecting.spec.ts` (appear→clear with values persisting).

**Checkpoint**: US1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: Polish, Ship & Acceptance Proof

**Purpose**: Full-suite gate, then the web-only production deploy and the on-wall
acceptance proof that the cue shows/clears during a simulated outage while values
persist.

- [X] T013 Run the full `apps/web` gate: `npm run test:coverage` (100%),
  `npm run typecheck` (clean), and `npm run test:e2e -- reconnecting.spec.ts`
  (green).
- [X] T014 Run [quickstart.md](./quickstart.md) validation end-to-end (§1 unit +
  coverage, §2 typecheck, §3 e2e, §4 manual `build`+`preview` visual check:
  subtle pulsing dot + "Reconnecting…" near the clock, NOT a banner; panels never
  blanked; cue clears on its own within ~1 `intervalMs`; reload mid-outage re-derives
  from live ticks with nothing persisted; header clock still Eastern, no new
  timestamp — FR-004/FR-006/FR-008/FR-009).
- [X] T015 Build and ship the **web-only** `amd64` image to prod at
  `192.168.10.5:8090` (no `api`/`poller`/`shared` change; nginx serves the new
  `dist`).
- [X] T016 [US1] **Acceptance proof**: on the wall kiosk (`192.168.10.156`),
  simulate a transient outage (block `/api/v1/latest` / stop the API) and confirm
  the subtle "reconnecting" cue appears within ~1 `intervalMs` while 100% of the
  last-known panel values stay on screen (SC-001/SC-003); restore data and confirm
  the cue clears on its own within ~1 `intervalMs` with zero operator interaction
  (SC-002); confirm across a healthy stretch the cue is shown 0 times (SC-004) and,
  during a multi-tick outage, appears exactly once with no per-tick flicker
  (SC-005). Verified live 2026-07-02: `docker compose stop api` on `192.168.10.5`
  → cue appeared (witnessed on an iPad viewing the dashboard; the wall kiosk was
  self-healed onto the same build) with readings intact; `start api` → cue cleared
  on its own. SC-001/SC-002/SC-003 confirmed.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US1)** →
  **Phase 4 (Polish/Ship)**, in order.
- **Within US1 (strict TDD)**: T004 + T005 (Red, parallel — different files) →
  **T006 (Red gate)** → T007 (helper) → T008 (seam; depends on T007) → T009 (CSS,
  parallel with T007/T008 — different file) → T010 (wiring; depends on T008) →
  T011 (e2e; depends on T007–T010) → **T012 (Green gate)**.
- **Phase 4**: T013 → T014 → T015 → T016, in order (ship precedes on-wall proof).
- **Hard rule**: never write Green (T007–T010) before the Red gate (T006) passes.
  If a Red test is wrong, revert Green, fix the test, re-verify Red, re-apply.

## Parallel Opportunities

- **Setup**: T002 runs alongside T001.
- **US1 Red**: T004 (`tests/render/reconnecting.test.ts`) and T005
  (`tests/render/index.test.ts`) are different files → `[P]`.
- **US1 Green**: T009 (`styles.css`) is independent of the TS logic → `[P]`
  alongside T007/T008. T011 (e2e, separate file) → `[P]` once its
  production deps (T007–T010) exist.

## Implementation Strategy

- **MVP scope = User Story 1** (the only story). Delivering Phase 3 through the
  Green gate (T012) is a complete, shippable increment: the covered render helper +
  seam render the existing signal at 100% coverage with panels provably untouched.
- **Incremental within the MVP**: the unit-covered helper/seam (T007/T008) plus CSS
  (T009) satisfy the spec on their own; the bootstrap wiring (T010) lights it up in
  the real app; the e2e (T011) and on-wall proof (T016) validate the
  composed, deployed behaviour.
- **Do not** add a dismiss button, escalation, debounce, persistence, or config —
  all explicitly Out of Scope. Render exactly the already-shipped edge signal.

## Requirement Coverage Map

| Requirement | Task(s) |
|-------------|---------|
| FR-001 (cue on healthy→failing) | T004, T007, T008, T016 |
| FR-002 (auto-clear on next success) | T004, T007, T008, T011, T016 |
| FR-003 (never shown while healthy) | T004, T007, T016 |
| FR-004 (last-known values untouched) | T005, T007, T008, T011, T014 |
| FR-005 (once per outage, steady, no flicker) | T004, T007, T016 |
| FR-006 (subtle, non-banner) | T004, T007, T009, T014 |
| FR-007 (reuse freshness language/placement) | T008, T009 |
| FR-008 (in-memory only, no persistence) | T007, T014 |
| FR-009 (no new timestamp / timezone) | T004, T007, T014 |
| FR-010 (consume existing signal, sole driver) | T003, T010 |
| FR-011 (web layer only, no contract/data change) | T003, T015 |
| SC-001 (visible within one poll interval) | T004, T011, T016 |
| SC-002 (clears within one poll interval, 0 interactions) | T004, T011, T016 |
| SC-003 (100% of values remain visible) | T005, T011, T014, T016 |
| SC-004 (shown 0 times on success-only session) | T004, T016 |
| SC-005 (triggered exactly once across many failed ticks) | T004, T016 |

---

## Done When

- [ ] All Phase 3 tasks complete through the Green gate (T012): `render/reconnecting.ts`
      and `render/index.ts` at 100% coverage; `npm run typecheck` clean.
- [ ] `reconnecting.spec.ts` e2e shows appear→clear with values persisting.
- [ ] Web-only `amd64` image shipped to prod (`192.168.10.5:8090`).
- [ ] On-wall acceptance proof (T016) confirms SC-001..SC-005 during a simulated
      outage: cue appears/clears on its own, panels never blanked, no per-tick
      flicker, never shown on a healthy session.
