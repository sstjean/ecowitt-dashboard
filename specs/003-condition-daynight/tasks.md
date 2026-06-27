---
description: "Dependency-ordered, TDD task list for 003-condition-daynight"
---

# Tasks: Sky-condition day/night decoupled from the deprecated NWS icon

**Input**: Design documents from `/specs/003-condition-daynight/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/condition-envelope.md, quickstart.md

**Tests**: REQUIRED. This is a strict TDD project (Constitution Principle IV +
CI 100%-coverage gate). Every implementation task is preceded by a failing test
task (Red) and gated by a Red-verification task before any production edit
(Green). Never modify a test to make it pass.

**Scope**: This feature touches **only `apps/api`** — `src/nws.ts`,
`src/routes/v1/latest.ts`, and their four test files
(`tests/nws.map.test.ts`, `tests/nws.test.ts`, `tests/nws.http.test.ts`,
`tests/latest.test.ts`). `packages/shared` and `apps/web` are deliberately
untouched (external `/api/v1/latest` envelope is preserved).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependency).
- **[US1]**: The single user story (P1) — the entire feature.
- Exact file paths are included in every task.

---

## Phase 1: Setup (baseline)

**Purpose**: Confirm a green baseline before authoring any failing test, so a
later Red is unambiguously caused by the new assertions (not pre-existing rot).

- [ ] T001 Confirm branch `003-condition-daynight` is checked out and the API
  workspace baseline is green: run `npm --workspace apps/api run test` and
  `npm --workspace apps/api run typecheck` and record that both pass against the
  current (pre-change) code in [apps/api](../../apps/api).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None. There is no shared infrastructure to build before the story —
the work is a single vertical reshape inside `apps/api`. (No tasks; proceed to
Phase 3.)

---

## Phase 3: User Story 1 — Condition icon reflects real local day/night and tolerates missing NWS text (Priority: P1) 🎯 MVP

**Goal**: Sever all dependence on the deprecated NWS observation `icon` URL;
derive day/night from the household astro `sunriseUtc`/`sunsetUtc` at read time;
keep the condition keyword from NWS `textDescription`; tolerate empty/missing
text without falling through to a false `night`; preserve the external envelope.

**Independent Test**: Drive the pure functions and `buildLatestSnapshot` with
injected `textDescription`, `sunriseUtc`, `sunsetUtc`, and `now` (no network);
assert the resolved icon/label across daytime, after-dark, empty-text,
precip/cloud-keyword, exact-sunrise, exact-sunset, boundary-flip, icon-field-
independence, and cold-start cases. The external envelope still emits
`conditionIcon | conditionStale | conditionText` byte-compatibly.

### Red — author failing tests first (all parallel; distinct files)

- [ ] T002 [P] [US1] In [apps/api/tests/nws.map.test.ts](../../apps/api/tests/nws.map.test.ts):
  replace the `conditionIcon(obs(...))` suite (and the `isDaytime`-carrying
  `obs()` fixture) with two new suites against the not-yet-existing exports
  `isDaytime(now, sunriseUtc, sunsetUtc)` and
  `resolveConditionIcon(textDescription, now, sunriseUtc, sunsetUtc)`:
  - `isDaytime`: daytime → `true`; after-sunset → `false`; before-sunrise →
    `false`; **exactly at sunrise** → `true` (day); **exactly at sunset** →
    `false` (night). (D2, FR-001)
  - `resolveConditionIcon`: each keyword (`thunderstorm/snow/rainy/fog`),
    `cloudy` vs `partly-cloudy`, clear-day → `clear`, clear-night → `night`,
    **empty-text day → `clear`** (NOT `night`), empty-text night → `night`, and
    a precip/cloud-keyword case asserted to win **regardless** of day vs night.
    (FR-004/FR-005/FR-008)
- [ ] T003 [P] [US1] In [apps/api/tests/nws.map.test.ts](../../apps/api/tests/nws.map.test.ts):
  add an **icon-field-independence** case for `resolveConditionIcon` — three
  invocations with identical `textDescription`+astro+`now` produce an identical
  icon (the function takes no icon argument, so this is a structural guard that
  the deprecated field can never influence the result). (FR-003, SC-004)
- [ ] T004 [P] [US1] In [apps/api/tests/nws.test.ts](../../apps/api/tests/nws.test.ts):
  rewrite the `createNwsClient` assertions to the new
  `ConditionState = { conditionText, conditionStale, hasObservation }` (no
  `conditionIcon`):
  - cold start (no fetch) → `{ conditionText: null, conditionStale: true,
    hasObservation: false }`. (FR-011, D4)
  - after a successful fetch with good text → `{ conditionText: <text>,
    conditionStale: false, hasObservation: true }`; text **cached & reused**
    within `cacheTtlSeconds`, refetched once past it.
  - **empty-text fetch** → `{ conditionText: "", conditionStale: false,
    hasObservation: true }` (not stale by empty text). (FR-006)
  - aged-out last-good → `conditionStale: true` by age; a failed/timed-out
    refresh **keeps** the last-good text. (FR-011, D6)
- [ ] T005 [P] [US1] In [apps/api/tests/nws.http.test.ts](../../apps/api/tests/nws.http.test.ts):
  update the fetcher assertions so the parsed observation is
  `{ textDescription }` only — drop every `isDaytime` expectation. Add an
  explicit **icon-field-independence** assertion: feeding the injected
  `fetchImpl` a latest-observation payload whose `icon` is a `/day/` URL, a
  `/night/` URL, or `null` yields the **identical** `{ textDescription }`
  result (the fetcher ignores `properties.icon`). (FR-002/FR-003)
- [ ] T006 [P] [US1] In [apps/api/tests/latest.test.ts](../../apps/api/tests/latest.test.ts):
  add/adjust `buildLatestSnapshot` tests for **read-time** resolution against
  injected `astro` + `now` (build `ConditionState` fixtures of the new shape):
  - **Rewrite the existing `threads the injected NWS condition …` test** (it
    currently injects the OLD `ConditionState` and asserts the icon is *echoed*):
    its mock must return the new shape
    `{ conditionText, conditionStale, hasObservation }` and it must assert
    `conditionIcon` is **resolved from the injected `astro` + `now`** via
    `resolveConditionIcon`, NOT echoed from the mock. (C1, FR-007)
  - cold-start passthrough: `hasObservation: false` →
    `{ conditionIcon: null, conditionText: null, conditionStale: true }`.
    (FR-011)
  - empty-text fetch: `hasObservation: true`, `conditionText: ""`, fresh →
    `conditionIcon` resolved (e.g. `clear` in daytime), `conditionText: null`
    (label omitted), `conditionStale` **NOT forced true**. (FR-006, SC-003)
  - clear-day good text → `conditionIcon: "clear"`, `conditionText: <text>`.
  - **boundary flip without refetch**: one cached clear observation, call
    `buildLatestSnapshot` with a daytime `now` (→ `clear`) and again with a
    `now` past `sunsetUtc` (→ `night`), and a `now` before `sunriseUtc`
    (→ `night`) then at/after `sunriseUtc` (→ `clear`) — same observation, no
    new fetch. (FR-007, SC-002)
  - staleness-by-age still flows through to the envelope. (FR-011)
- [ ] T007 [P] [US1] In [apps/api/tests/latest.test.ts](../../apps/api/tests/latest.test.ts):
  add the **contract regression guard** — the `/api/v1/latest` envelope (both
  `status: "ok"` and `status: "no-data"`) still emits exactly
  `conditionIcon` (`ConditionIcon | null`), `conditionStale` (`boolean`), and
  `conditionText` (`string | null`) per
  [contracts/condition-envelope.md](./contracts/condition-envelope.md); no
  existing external-shape assertion is removed. (FR-003/FR-006, D8)

### Red gate — verify the tests fail for the right reason

- [ ] T008 [US1] Run `npm --workspace apps/api run test` and confirm RED: the
  new suites fail to compile/resolve (`isDaytime` / `resolveConditionIcon` not
  exported; `ConditionState` lacks `hasObservation` / still has
  `conditionIcon`; fetcher still returns `isDaytime`). Capture the failure
  output. Do NOT touch production code until this Red is observed.

### Green — implement to pass the tests (sequential; shared files)

- [ ] T009 [US1] In [apps/api/src/nws.ts](../../apps/api/src/nws.ts): reshape the
  NWS boundary — `NwsObservation` → `{ textDescription: string }` (drop
  `isDaytime`); `LatestObservationResponse.properties` → `{ textDescription }`
  (drop `icon`); `createHttpObservationFetcher` returns
  `{ textDescription: latest.properties.textDescription ?? "" }` only — coerce
  empty/missing text to `""` at the boundary (X1) and stop reading
  `latest.properties.icon`. Also refresh the surviving JSDoc in `nws.ts` to cite
  this feature's FRs and drop the stale `FR-033`/`FR-057` references from a prior
  feature (X2). (FR-002/FR-003/FR-004/FR-006; data-model §1/§2)
- [ ] T010 [US1] In [apps/api/src/nws.ts](../../apps/api/src/nws.ts): add the two
  exported pure functions and remove the old mapping —
  `isDaytime(now, sunriseUtc, sunsetUtc)` = half-open `[sunrise, sunset)`
  (sunrise=day, sunset=night); `resolveConditionIcon(textDescription, now,
  sunriseUtc, sunsetUtc)` with the **identical** keyword/cloud precedence
  (thunder → snow/sleet/flurries/ice → rain/drizzle/shower → fog/haze/mist/smoke
  → cloud|overcast/partly → else `isDaytime(...) ? "clear" : "night"`); delete
  `conditionIcon(observation)`. (FR-001/FR-005/FR-008; data-model §5)
- [ ] T011 [US1] In [apps/api/src/nws.ts](../../apps/api/src/nws.ts): reshape the
  cache/state — `ConditionState` → `{ conditionText: string | null;
  conditionStale: boolean; hasObservation: boolean }`; `lastGood` →
  `{ text: string; atMs: number } | null` (no icon); `current(now)` returns the
  new shape (`hasObservation = lastGood !== null`, `conditionStale` age-based);
  `refresh(now)` caches **text only** (no icon resolution at refresh time).
  (FR-006/FR-007/FR-011; data-model §3/§4)
- [ ] T012 [US1] In [apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts):
  update the `ConditionState` import and reshape `UNAVAILABLE_CONDITION` →
  `{ conditionText: null, conditionStale: true, hasObservation: false }`
  (drop `conditionIcon`). (data-model §6)
- [ ] T013 [US1] In [apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts):
  resolve the three envelope condition fields at **read time** inside
  `buildLatestSnapshot` (it already holds `astro` + `now`): if
  `!condition.hasObservation` → `conditionIcon: null, conditionText: null,
  conditionStale: true`; else `conditionIcon = resolveConditionIcon(
  condition.conditionText ?? "", now, astro.sunriseUtc, astro.sunsetUtc)`,
  `conditionText = trimmed-nonempty ? text : null`, `conditionStale =
  condition.conditionStale` (passthrough). Wire these into both the `no-data`
  and `ok` `latestSnapshotSchema.parse(...)` calls. (FR-005/FR-006/FR-007;
  data-model §7)

### Green gate — story checkpoint

- [ ] T014 [US1] Run `npm --workspace apps/api run test` and confirm all suites
  (including every T002–T007 case) pass GREEN.
- [ ] T015 [US1] Run `npm --workspace apps/api run typecheck` (`tsc`) and confirm
  it is clean — the `ConditionState` reshape forces `tsc` to flag any remaining
  consumer of the old shape; there must be none. (Local Type-Checking Parity)

**Checkpoint**: User Story 1 is fully implemented and independently verifiable —
clear midday with a `null` upstream icon resolves to `clear`, empty text omits
the label without forcing stale, and a single cached observation flips
`clear ↔ night` across the astro boundary with no refetch.

---

## Phase 4: Polish & Coverage Gate (cross-cutting)

**Purpose**: Enforce the constitution's 100% coverage gate (passing tests are
not enough) and a clean tree.

- [ ] T016 Run `npm --workspace apps/api run test:coverage` and confirm **100%**
  coverage for both [apps/api/src/nws.ts](../../apps/api/src/nws.ts) and
  [apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts)
  (statements/branches/functions/lines). Every branch — boundary inclusivity
  both sides, each keyword, empty-text day vs night, cold-start vs empty-fetch,
  stale-by-age, failure-keeps-text — must be exercised. (Constitution IV, SC-005)
- [ ] T017 [P] Confirm no stray references to the removed surface remain:
  grep `apps/api` for `properties.icon`, `conditionIcon(` (the old function),
  any `ConditionState`/object literal still carrying a `conditionIcon` field,
  and any `current(`/`UNAVAILABLE_CONDITION` consumer still missing
  `hasObservation`; ensure `packages/shared` and `apps/web` are untouched.

---

## Phase 5: Deployment & Verification (after Green)

**Purpose**: Ship the rebuilt amd64 `api` image to the household host and verify
the fix end to end (API → UI) per the end-to-end-verification standard. Build/
ship commands per repo deploy notes; use an explicit immutable tag for rollback.

- [ ] T018 Build the `api` image for **linux/amd64** from the repo root:
  `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build api` (tag e.g.
  `ecowitt/api:1.0.1` — an explicit immutable tag so rollback to the prior
  image is possible).
- [ ] T019 Ship the image to host `192.168.10.5` (SSH key auth, daemon not on
  TCP): `docker save ecowitt/api:<tag> | gzip -1 | ssh steve@192.168.10.5
  'gunzip | docker load'`, then on the host
  `cd ~/ecowitt-dashboard && docker compose up -d api` (no `--build`; preloaded
  image; sqlite volume persists).
- [ ] T020 API verification (live, Eastern): `curl -s
  http://192.168.10.5:8090/api/v1/latest | jq '{conditionIcon, conditionStale,
  conditionText, sunrise: .astro.sunriseUtc, sunset: .astro.sunsetUtc,
  serverTime}'` — confirm a clear daytime reading returns `conditionIcon:
  "clear"` (NOT `"night"`), the empty-text/`icon: null` failure does not
  reproduce, and `serverTime` falls between `sunriseUtc` and `sunsetUtc`.
  (SC-001)
- [ ] T021 UI verification (Playwright/Chrome): open
  `http://192.168.10.5:8090/`, screenshot, and inspect as the household would —
  daytime clear sky shows the **sun/clear** icon (not a moon), empty NWS text
  renders **no blank label** and is not greyed for that reason, times/labels are
  in Eastern (`America/New_York`), and there are no console/network errors.
  (FR-006/FR-009, SC-003) Report the screenshot before declaring done.

---

## Dependencies & Execution Order

- **Phase 1 (T001)** → **Phase 3 Red (T002–T007)** → **Red gate (T008)** →
  **Green (T009→T013, sequential)** → **Green gate (T014→T015)** →
  **Phase 4 (T016→T017)** → **Phase 5 (T018→T021, sequential)**.
- **Red is parallel**: T002–T007 touch four distinct test files with no shared
  state → all `[P]`. (T002 and T003 share `nws.map.test.ts`; T006 and T007 share
  `latest.test.ts` — do those two pairs in the same edit pass, but the four
  files are mutually parallel.)
- **Green is sequential**: T009–T011 all edit `apps/api/src/nws.ts` (same file →
  no `[P]`); T012–T013 edit `apps/api/src/routes/v1/latest.ts` and **depend on**
  the new `nws.ts` exports/types, so they follow T009–T011.
- **Gates are hard barriers**: do not start Green (T009) until the Red gate
  (T008) is observed; do not start Phase 5 until coverage (T016) is 100%.

## Parallel Opportunities

- **Red authoring**: T002/T003 (`nws.map.test.ts`), T004 (`nws.test.ts`),
  T005 (`nws.http.test.ts`), T006/T007 (`latest.test.ts`) — four files in
  parallel.
- **Polish**: T017 (grep audit) is `[P]`; it only reads.
- Green implementation has **no** parallelism (two shared files, with the route
  depending on `nws.ts`).

## Implementation Strategy (MVP)

There is a single user story (P1) and it **is** the MVP. Complete Phases 1–4 for
a fully tested, 100%-covered fix; Phase 5 ships and visually verifies it on the
wall display. No partial/incremental story split applies.

## Ordering Risks

- **Coverage, not just green** (T016 vs T014): the suite can pass while a branch
  (e.g. empty-text *night*, or the failure-keeps-text path) is uncovered. T016
  is a separate gate precisely so CI's 100% gate is met locally first.
- **Route depends on `nws.ts`**: starting T012/T013 before T009–T011 leaves
  `tsc` red on the missing `resolveConditionIcon`/reshaped `ConditionState`.
  Keep Green strictly in T009→T013 order.
- **Don't edit tests to chase Green**: if a T002–T007 assertion is wrong, revert
  any production change, fix the test, re-verify Red (T008), then re-apply Green.
- **Deploy = ship images** (T018–T019), never source; Mac is arm64 so the
  `linux/amd64` build flag is mandatory or the host load will fail.
