---
description: "Dependency-ordered, strict-TDD task list for Kiosk Self-Heal on Deploy"
---

# Tasks: Kiosk Self-Heal on Deploy

**Feature Branch**: `012-kiosk-self-heal`

**Input**: Design documents in [specs/012-kiosk-self-heal/](./)

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/version-json.md](./contracts/version-json.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. This feature is **strict TDD** — every production edit is
preceded by a failing-test task (Red) and an explicit **Red-verification gate**
before the Green implementation task. Tests are NEVER modified to make production
pass; if a Red test is wrong, revert Green, fix the test, re-verify Red, re-apply.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to the user stories in [spec.md](./spec.md))
- Every task lists an exact file path.

## Scope guardrails

- Touches ONLY: [apps/web/vite.config.ts](../../apps/web/vite.config.ts),
  `apps/web/src/selfHeal.ts` (new), `apps/web/src/build-id.d.ts` (new),
  [apps/web/src/main.ts](../../apps/web/src/main.ts),
  [apps/web/src/bootstrap.ts](../../apps/web/src/bootstrap.ts),
  `apps/web/tests/**`, `apps/web/e2e/**`,
  [deploy/kiosk/bin/kiosk-weather](../../deploy/kiosk/bin/kiosk-weather),
  `deploy/kiosk/tests/*.bats`.
- **No** changes to `apps/api`, `apps/poller`, or `packages/shared`.
- **Coverage nuance**: `bootstrap.ts` is coverage-excluded (wiring). The reload
  DECISION logic MUST live in the covered pure module `selfHeal.ts` (`decideReload`)
  at 100% unit coverage; the Playwright e2e proves the end-to-end reload behaviour.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the toolchains the TDD gates depend on are present.

- [X] T001 Verify workspace deps installed (`npm install` at repo root) and that
  `apps/web` scripts `test`, `test:coverage`, `typecheck`, `test:e2e` resolve.
- [X] T002 [P] Ensure Playwright chromium is installed for the e2e gate
  (`cd apps/web && npx playwright install chromium`).
- [X] T003 [P] Ensure `bats` is available for the US3 launcher gate
  (`bats --version`; `brew install bats-core` if missing).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three user stories are independent (US1/US2 = web layer, US3 =
launcher). There is **no shared production foundation** — no schema, no shared
model. The only cross-story prerequisite is the tooling verified in Phase 1.

- [X] T004 Confirm no shared foundation work is required (record in PR description);
  proceed directly to user stories. `bootstrap.ts` remains coverage-excluded per
  [apps/web/vitest.config.ts](../../apps/web/vitest.config.ts).

**Checkpoint**: Foundation ready — US1, US2, US3 may proceed (in priority order, or
in parallel if staffed).

---

## Phase 3: User Story 1 - New deploy reaches the screen automatically (Priority: P1) 🎯 MVP

**Goal**: A deployed build carries a deterministic build id; the running dashboard
polls the served `version.json` (no-store), and reloads **exactly once** on a
genuine id change, never on equal/unknown, never in a loop.

**Independent Test**: Serve `version.json` whose `buildId` differs from the running
`__BUILD_ID__` → page reloads once. Serve an equal id → no reload. Fail the fetch →
no reload. (Unit: `decideReload` table + effect runner. E2E: real `vite preview`.)

### Tests for User Story 1 (write FIRST — must FAIL before implementation) ⚠️

- [X] T005 [US1] Write failing unit tests for the pure `decideReload(runningId,
  servedId)` decision table (all 4 rows from [contracts/version-json.md](./contracts/version-json.md) §3:
  null→false, equal→false, different→true, blank/whitespace→false) in
  `apps/web/tests/selfHeal.test.ts`.
- [X] T006 [US1] Add failing unit tests for the effectful `checkForUpdate(deps)`
  runner in `apps/web/tests/selfHeal.test.ts`: fetches `/version.json` with
  `cache: 'no-store'`; reloads exactly once on a changed id; no reload on equal id;
  no reload on fetch error / non-JSON / missing `buildId` (treated as `null`); and
  the `hasReloaded` latch prevents a second reload (loop guard, FR-010). Inject
  `fetch` and `reload` so no real network/navigation occurs.
- [X] T007 [US1] Write failing Playwright e2e `apps/web/e2e/selfheal.spec.ts`
  against the real `vite preview` build, covering the three adversarial cases:
  (a) served id **changed** → exactly one reload (stub/observe
  `window.location.reload` or assert a single navigation — do NOT reload the test
  runner), (b) served id **equal** → no reload, (c) `version.json` fetch **fails**
  (route → 500/abort) → no reload.

### ⛔ Red-verification gate (US1)

- [X] T008 [US1] Run `cd apps/web && npm run test -- selfHeal.test.ts` and
  `npm run test:e2e -- selfheal.spec.ts`; CONFIRM both fail for the right reason
  (`selfHeal.ts` absent / `version.json` not emitted / no wiring). Do NOT proceed to
  Green until Red is verified.

### Implementation for User Story 1 (Green)

- [X] T009 [US1] Create `apps/web/src/build-id.d.ts` with
  `declare const __BUILD_ID__: string;` so `tsc --noEmit` resolves the baked
  constant ([contracts/version-json.md](./contracts/version-json.md) §2).
- [X] T010 [US1] Implement `apps/web/src/selfHeal.ts`: pure
  `decideReload(runningId, servedId)` (true only when `servedId` is non-null,
  non-empty and `!= runningId`) + effectful `checkForUpdate(deps)` (no-store fetch,
  swallow errors to `null`, call injected `reload()` once, latch module-level
  `hasReloaded`). Make T005/T006 pass.
- [X] T011 [US1] Add the build-id Vite plugin to
  [apps/web/vite.config.ts](../../apps/web/vite.config.ts): compute ONE `buildId`
  per build, `define: { __BUILD_ID__: JSON.stringify(buildId) }`, and emit
  `dist/version.json` = `{ "buildId": buildId }` (single source, FR-001/002/003/004).
- [X] T012 [US1] Wire `checkForUpdate` into the poll loop in
  [apps/web/src/bootstrap.ts](../../apps/web/src/bootstrap.ts) (coverage-excluded),
  passing `runningId = __BUILD_ID__`, real `fetch`, and `() => location.reload()`
  on the configured check cadence.
- [X] T013 [US1] Configure the e2e to run against the built app (`vite build` +
  `vite preview` webServer) in [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts)
  so an actually-emitted `dist/version.json` is served for `selfheal.spec.ts`.

### ✅ Green-verification gate (US1)

- [X] T014 [US1] Run `cd apps/web && npm run test:coverage` (100% incl.
  `selfHeal.ts`), `npm run typecheck` (clean, `__BUILD_ID__` resolves),
  `npm run build && cat dist/version.json` (emitted, deterministic), and
  `npm run test:e2e -- selfheal.spec.ts` (all three cases green).

**Checkpoint**: US1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Kiosk recovers on its own after a transient outage (Priority: P2)

**Goal**: The live-data poll loop retries forever, surfaces an optional
`reconnecting` state (true on failure, false on the next success), and NEVER blanks
last-known values on a failed tick.

**Independent Test**: With fake timers, reject `fetchSnapshot` one or more times →
loop keeps ticking; `reconnecting` flips `true`; on the next success it flips
`false`; a failed tick calls neither `render` nor any clear (FR-014).

### Tests for User Story 2 (write FIRST — must FAIL before implementation) ⚠️

- [X] T015 [US2] Extend `apps/web/tests/main.test.ts` with failing tests: the loop
  keeps firing after a rejected `fetchSnapshot` (never gives up, FR-011);
  `onReconnectingChange(true)` fires on the first failure and `onReconnectingChange(false)`
  on the next success (FR-012/013); a failed tick does NOT call `render` or clear
  last-known values (FR-014). Use the existing fake-timers pattern.

### ⛔ Red-verification gate (US2)

- [X] T016 [US2] Run `cd apps/web && npm run test -- main.test.ts`; CONFIRM the new
  assertions fail (no `onReconnectingChange` hook yet). Do NOT proceed until Red is
  verified.

### Implementation for User Story 2 (Green)

- [X] T017 [US2] Add an optional `onReconnectingChange(active: boolean)` callback to
  `startPollLoop` in [apps/web/src/main.ts](../../apps/web/src/main.ts): set active
  on the first failed tick, clear on the next success, without touching the
  last-rendered DOM. Make T015 pass.
- [ ] T018 [P] [US2] (Optional) Render a subtle "reconnecting" affordance driven by
  the state in `apps/web/src/render/` and wire it via `onReconnectingChange` in
  [apps/web/src/bootstrap.ts](../../apps/web/src/bootstrap.ts) (coverage-excluded);
  MUST NOT blank last-known values.

### ✅ Green-verification gate (US2)

- [X] T019 [US2] Run `cd apps/web && npm run test:coverage` (100% incl. the poll-loop
  changes) and `npm run typecheck` (clean).

**Checkpoint**: US1 AND US2 both work independently.

---

## Phase 5: User Story 3 - Kiosk waits for the dashboard before showing anything at boot (Priority: P3)

**Goal**: The launcher curl-waits for `KIOSK_URL` reachability before launching
Chrome, so a server-down-at-boot shows a wait/retry rather than a dead error page.

**Independent Test**: `bats` proves `bin/kiosk-weather` loops on `curl -fsS` until
reachable **before** Chrome launches, launches promptly when already reachable, and
preserves the existing `while true` relaunch + `--password-store=basic` flags.

### Tests for User Story 3 (write FIRST — must FAIL before implementation) ⚠️

- [X] T020 [US3] Add failing curl-wait assertions to
  [deploy/kiosk/tests/launcher_selfheal.bats](../../deploy/kiosk/tests/launcher_selfheal.bats):
  the launcher contains a `curl -fsS` reachability loop against `KIOSK_URL` that
  runs BEFORE the `google-chrome-stable` invocation (FR-015/016), and still
  preserves the `while true` relaunch loop and `--password-store=basic` flag.

### ⛔ Red-verification gate (US3)

- [X] T021 [US3] Run `cd deploy/kiosk && bats tests/launcher_selfheal.bats`; CONFIRM
  the new curl-wait assertions fail (no reachability loop yet). Do NOT proceed until
  Red is verified.

### Implementation for User Story 3 (Green)

- [X] T022 [US3] Add a bounded `until curl -fsS -o /dev/null --max-time N "$URL"; do
  sleep S; done` reachability loop to
  [deploy/kiosk/bin/kiosk-weather](../../deploy/kiosk/bin/kiosk-weather) BEFORE the
  Chrome launch, preserving the existing `while true` relaunch wrapper and all flags
  (FR-015/016/017). Make T020 pass.

### ✅ Green-verification gate (US3)

- [X] T023 [US3] Run `cd deploy/kiosk && bats tests/launcher_selfheal.bats` (green)
  and `bash -n bin/kiosk-weather` (syntax clean).

**Checkpoint**: All three user stories are independently functional and tested.

---

## Phase 6: Polish, Ship & Acceptance Proof

**Purpose**: Full-suite gates, then production deploy and the end-to-end acceptance
proof that a redeploy auto-reloads the kiosk with no manual kick.

- [X] T024 Run the full `apps/web` gate: `npm run test:coverage` (100%),
  `npm run typecheck` (clean), `npm run test:e2e -- selfheal.spec.ts` (green), and
  `cd deploy/kiosk && bats tests/launcher_selfheal.bats` (green).
- [X] T025 Run [quickstart.md](./quickstart.md) validation end-to-end (US1 unit +
  build-marker determinism, US2 fake-timer + manual live check, US3 bats).
- [X] T026 Build and ship the **web-only** `amd64` image to prod at
  `192.168.10.5:8090` (no `api`/`poller`/`shared` change). `version.json` is served
  by the existing nginx from `dist`.
- [X] T027 Perform the **ONE final manual kiosk kick** to onboard the self-heal build
  onto the wall screen (first-time onboarding per [plan.md](./plan.md) Deployment
  Notes).
- [X] T028 **Acceptance proof**: deploy a SUBSEQUENT trivial web redeploy (new build
  id) and confirm the kiosk auto-reloads to it within one check interval with
  **no manual kick** (SC-001/SC-006). Verified in prod 2026-07-02: builds D & E
  auto-reloaded the kiosk in ~1–4 s with no manual kick (incl. non-debug config).
- [X] T029 [US3] Vendor the hardened curl-wait launcher on the Surface
  (`192.168.10.156`) — done via a surgical `install` of `bin/kiosk-weather` to
  `/usr/local/bin/kiosk-weather` + `systemctl restart kiosk.service` (old launcher
  backed up to `/root/kiosk-weather.bak.*`), rather than a full `provision.sh`
  re-run (no repo checkout on device; provisioner also needs the WiFi PSK). Verify a
  server-down-at-boot shows a wait state, not a dead error page (SC-005).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** → no dependencies.
- **Foundational (Phase 2)** → after Setup; trivial here (no shared production code).
- **US1 (Phase 3, P1)**, **US2 (Phase 4, P2)**, **US3 (Phase 5, P3)** → each depends
  only on Phases 1–2; they are mutually independent and may run in parallel if
  staffed. Priority order for a single implementer: US1 → US2 → US3.
- **Polish/Ship (Phase 6)** → depends on all in-scope stories being complete and
  green.

### Within each user story (strict TDD)

Red tests → **Red-verification gate** → Green implementation → **Green-verification
gate**. Never write production before the gate confirms Red. Never edit a test to go
green.

- US1: T005, T006, T007 (Red) → T008 (gate) → T009 → T010 → T011 → T012 → T013 (Green)
  → T014 (gate).
- US2: T015 (Red) → T016 (gate) → T017 → T018 (Green) → T019 (gate).
- US3: T020 (Red) → T021 (gate) → T022 (Green) → T023 (gate).

### Parallel opportunities

- Setup: T002 and T003 are `[P]`.
- Across stories: once Phase 2 completes, US1 / US2 / US3 can be worked in parallel
  (different files: `selfHeal.ts`+`vite.config.ts` vs `main.ts` vs `kiosk-weather`).
- Within US1: T005 and T006 share `selfHeal.test.ts` (NOT parallel); T007 (e2e file)
  is independent of them. T009 (`build-id.d.ts`) is independent of T011 (`vite.config.ts`).
- US2: T018 (`render/` + `bootstrap.ts`) is `[P]` relative to the core T017 change.

---

## Parallel Example: cross-story kickoff after Foundational

```bash
# Developer A — US1 (web self-heal):   apps/web/src/selfHeal.ts, vite.config.ts, e2e
# Developer B — US2 (web reconnect):   apps/web/src/main.ts, tests/main.test.ts
# Developer C — US3 (kiosk launcher):  deploy/kiosk/bin/kiosk-weather, tests/*.bats
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 US1 (Red → gate → Green → gate).
3. **STOP and VALIDATE**: US1 independently (unit 100% + e2e three cases).
4. Ship the web image + one manual onboarding kick → auto-reload is live (MVP).

### Incremental delivery

1. US1 → test → deploy (MVP: auto-reload on deploy).
2. US2 → test → deploy (self-healing reconnect).
3. US3 → test → re-provision Surface (boot resilience).

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks.
- `[Story]` label maps each task to US1/US2/US3 for traceability.
- Verify Red before every Green; verify 100% coverage + typecheck after every Green.
- `bootstrap.ts` stays coverage-excluded; all reload DECISION logic lives in the
  covered pure `selfHeal.ts`.
- Commit after each task or logical Red→Green pair; never commit on a red gate.
