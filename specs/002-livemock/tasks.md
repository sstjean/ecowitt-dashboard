# Tasks: LiveMock — Real-Data Dev Source via the Ecowitt Cloud API

**Input**: Design documents from `/specs/002-livemock/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (user stories),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/cloud-realtime.md](./contracts/cloud-realtime.md), [quickstart.md](./quickstart.md)

**Source of truth**: Feature [#11](https://github.com/sstjean/ecowitt-dashboard/issues/11),
user stories [#14](https://github.com/sstjean/ecowitt-dashboard/issues/14) (US1, P1),
[#15](https://github.com/sstjean/ecowitt-dashboard/issues/15) (US2, P1),
[#16](https://github.com/sstjean/ecowitt-dashboard/issues/16) (US3, P1),
[#17](https://github.com/sstjean/ecowitt-dashboard/issues/17) (US4, P2). If a task and an
Issue disagree, the Issue wins.

**Tests**: REQUIRED. The constitution mandates TDD with a 100% coverage gate. For every new
module the failing test is written first (Red), Red is verified, then the implementation
makes it pass (Green). No production code is written ahead of a failing test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (#14), US2 (#15), US3 (#16), US4 (#17)
- Exact file paths are included in each task

## Path Conventions

Monorepo (npm workspaces). This feature touches only:

- `apps/poller/src` + `apps/poller/tests` — cloud fetcher, config switch, wiring
- `packages/shared/src` + `packages/shared/tests` — cloud schema + pure adapter
- repo root — `docker-compose.livemock.yml`, `.env.example`, `.gitignore`
- `apps/api/tests/boundary.test.ts` — import-boundary guard (cross-cutting)

The downstream pipeline (`normalizeToFullMetricMap`, `projectLiveReading`, validation,
store, API, web, freshness) is **reused unchanged**.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Secrets-hygiene prerequisite shared by every story. The monorepo, workspaces,
and downstream pipeline already exist — no scaffolding is required.

- [ ] T001 Confirm work is on branch `002-livemock` and ensure `.env` is gitignored: verify (or add) a `.env` entry in [.gitignore](.gitignore) so credentials can never be committed (FR-017 / Feature 001 FR-055). No `.env` file is created in the repo.

**Checkpoint**: Secrets cannot be committed; per-story work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST exist before user stories.

**No new foundational code is required.** The existing ingest → store → API → web pipeline
in `packages/shared` and `apps/poller` is the foundation and is consumed unchanged
(plan.md "Structure Decision"). Each user story's modules (cloud schema, adapter, fetcher,
config) are story-scoped and begin immediately after Setup. There are intentionally no
tasks in this phase.

**Checkpoint**: Foundation (existing pipeline) confirmed reused as-is — user stories start.

---

## Phase 3: User Story 1 - Poller pulls live readings from the Ecowitt cloud API (Priority: P1) 🎯 MVP

**Goal**: With `POLLER_SOURCE=cloud` and valid credentials, the poller fetches the cloud
`real_time` payload and drives the unchanged downstream pipeline; with `POLLER_SOURCE` unset
or `gateway`, behaviour is identical to today (zero cloud calls). (FR-001–FR-006)

**Independent Test**: Run a single cloud poll cycle (injected `fetch` serving a canned
`code:0` payload) and confirm a reading is produced through the unchanged downstream
pipeline; with `POLLER_SOURCE=gateway`, confirm the gateway path is unchanged.

### Tests for User Story 1 (write FIRST, verify they FAIL) ⚠️

- [ ] T002 [US1] Red: extend [apps/poller/tests/config.test.ts](apps/poller/tests/config.test.ts) to assert `POLLER_SOURCE` defaults to `gateway`, accepts `cloud`, parses `ECOWITT_APP_KEY`/`ECOWITT_API_KEY`/`ECOWITT_MAC`, defaults `ECOWITT_API_BASE_URL` to `https://api.ecowitt.net`, and throws loudly at startup when `source=cloud` but any credential is missing/empty (D10, FR-001/FR-016). Verify Red.
- [ ] T003 [P] [US1] Red: create [apps/poller/tests/ecowittCloud.test.ts](apps/poller/tests/ecowittCloud.test.ts) covering the happy path — a `code:0` envelope returns `{ ok: true, data }`, and the request is built with `application_key`, `api_key`, `mac`, `call_back`, and the display-unit ids (`temp_unitid=2`, `wind_speed_unitid=9`, `rainfall_unitid=13`, `pressure_unitid=4`, `solar_irradiance_unitid=16`) against an injected `fetch` (FR-003/FR-004/FR-005, D1/D8/D9). Verify Red.
- [ ] T004 [US1] Red: create an integration test [apps/poller/tests/cloud.pipeline.integration.test.ts](apps/poller/tests/cloud.pipeline.integration.test.ts) that drives one cloud poll cycle (injected `fetch` → fetcher → `cloudRealtimeToGateway` → existing ingest → store) and asserts a reading is stored with no schema errors; depends on the US2 adapter (T009–T010) to run Green. Verify Red.

### Implementation for User Story 1

- [ ] T005 [US1] Green: extend [apps/poller/src/config.ts](apps/poller/src/config.ts) with the `POLLER_SOURCE` enum (`z.enum(["gateway","cloud"]).default("gateway")`), the three `ECOWITT_*` credentials, optional `ECOWITT_API_BASE_URL`, and the conditional-required validation (creds mandatory only when `source=cloud`). Makes T002 pass.
- [ ] T006 [US1] Green: create [apps/poller/src/ecowittCloud.ts](apps/poller/src/ecowittCloud.ts) — `fetchCloudRealtime(...)` mirroring the gateway client's `{ ok, data } | { ok, error }` contract, building the request per the contract and returning `{ ok: true, data }` on `code:0`, using an injected `fetchImpl` and an `AbortController` timeout (`DEFAULT_GATEWAY_TIMEOUT_MS`). Happy-path + request-shape only; error branches land in US4. Makes T003 pass (D1).
- [ ] T007 [US1] Green: wire source selection in [apps/poller/src/index.ts](apps/poller/src/index.ts) — when `config.source === "cloud"`, build a poll callback that calls `fetchCloudRealtime` → `cloudRealtimeToGateway` → existing `ingestPayload`; otherwise keep today's gateway path. `runPollCycle` stays source-agnostic. Depends on T005, T006, and the US2 adapter (T010). Makes T004 pass.

**Checkpoint**: A cloud poll cycle produces a stored reading through the unchanged pipeline; the gateway default is untouched.

---

## Phase 4: User Story 2 - Cloud payload faithfully adapted to the gateway shape (Priority: P1)

**Goal**: A pure shared adapter translates the validated cloud `real_time` payload into a
`get_livedata_info`-shaped object the existing `normalizeToFullMetricMap` and
`projectLiveReading` accept unchanged, including the two synthesized fields, the synthesized
`srain_piezo`, and weekly/monthly/yearly rain from the piezo group. (FR-007–FR-014)

**Independent Test**: Feed a captured cloud `real_time` payload through `cloudRealtimeToGateway`
and assert the output passes `normalizeToFullMetricMap` + `projectLiveReading` with no schema
errors, with correct values for every mapped, synthesized, and rain-state field.

### Tests for User Story 2 (write FIRST, verify they FAIL) ⚠️

- [ ] T008 [P] [US2] Red: create [packages/shared/tests/cloudMapping.test.ts](packages/shared/tests/cloudMapping.test.ts) covering — (a) `cloudRealtimeSchema` accepts a valid `data` object and rejects a partial/malformed payload (FR-008); (b) every mapped field from the data-model table is translated to the correct `common_list`/`wh25`/`piezoRain` target; (c) pressure is emitted in **inHg** so the mapper's `inHgToHpa` yields the right hPa (FR-005/FR-013, D8); (d) Decision A — `0x19` ← `wind.wind_gust`, `0x6D` ← `wind.wind_direction` (FR-012, D4); (e) weekly/monthly/yearly rain map from `rainfall_piezo.weekly`/`monthly`/`yearly` to `0x11`/`0x12`/`0x13` (D7); (f) `srain_piezo` is `"1"` when `rain_rate > 0` and `"0"` otherwise, so the unchanged mapper sets `isRaining` correctly (FR-011, D5); (g) the tipping-bucket group is ignored (FR-010, D6); and (h) the adapter output passes `normalizeToFullMetricMap` + `projectLiveReading` with no schema errors (FR-014). Verify Red (module absent).

### Implementation for User Story 2

- [ ] T009 [US2] Green: add `cloudRealtimeSchema` (and a reusable `cloudMetricSchema`) to [packages/shared/src/schema.ts](packages/shared/src/schema.ts) — envelope `{ code, msg, time?, data }`, required mapped groups, loose handling of unmapped groups (data-model §1). Makes the schema half of T008 pass.
- [ ] T010 [US2] Green: create the pure adapter [packages/shared/src/cloudMapping.ts](packages/shared/src/cloudMapping.ts) — `cloudRealtimeToGateway(data)` that validates with `cloudRealtimeSchema`, then emits the gateway-shaped `{ common_list, wh25, piezoRain }` per the data-model mapping including the two synthesized `common_list` items, the synthesized `srain_piezo`, and weekly/monthly/yearly rain. Pure (no I/O). Makes the rest of T008 pass.
- [ ] T011 [US2] Green: re-export the adapter from [packages/shared/src/index.ts](packages/shared/src/index.ts) so `apps/poller` can import `cloudRealtimeToGateway` (and the schema) via `@ecowitt/shared`.

**Checkpoint**: The adapter output flows through the unchanged mapper/projection cleanly; US1's wiring (T007) and integration test (T004) can now go Green.

---

## Phase 5: User Story 3 - Run LiveMock off-LAN and see real data on the dashboard (Priority: P1)

**Goal**: Launch LiveMock off-LAN with a single compose override and gitignored `.env`
credentials and see real, current household data refresh on the poll cadence — no secrets
committed. (FR-015–FR-020)

**Independent Test**: Bring the stack up with the LiveMock override and valid credentials,
open the dashboard, confirm live (non-em-dash, non-stale) values that refresh on cadence, and
confirm no secrets are committed.

### Implementation for User Story 3

- [ ] T012 [P] [US3] Create [docker-compose.livemock.yml](docker-compose.livemock.yml) mirroring [docker-compose.mock.yml](docker-compose.mock.yml): set `POLLER_SOURCE=cloud` and pass the `ECOWITT_*` env from the gitignored `.env`, include **no** mock-gateway service, runnable via `docker compose -f docker-compose.yml -f docker-compose.livemock.yml up` (FR-015, D11).
- [ ] T013 [P] [US3] Add placeholders to [.env.example](.env.example): `POLLER_SOURCE`, `ECOWITT_APP_KEY`, `ECOWITT_API_KEY`, `ECOWITT_MAC`, and optional `ECOWITT_API_BASE_URL` — placeholder values only, documenting the required keys (FR-016/FR-017).
- [ ] T014 [US3] Quickstart verification ([quickstart.md](specs/002-livemock/quickstart.md)): bring up the LiveMock stack with real credentials, confirm live values on the web UI + the `/api/v1/latest` curl, run the secrets-hygiene checks (`git check-ignore .env`, `.env.example` placeholders only), and **capture one raw live `real_time` payload to confirm `rainfall_piezo` includes `weekly`/`monthly`/`yearly`** (settles research D7). Depends on T007 + US2 adapter. If the device omits those rain totals, flag D7 for re-opening.

**Checkpoint**: An operator off-LAN sees real data on the dashboard; secrets stay out of the repo; D7 is confirmed against a live capture.

---

## Phase 6: User Story 4 - Cloud-source failures degrade honestly (Priority: P2)

**Goal**: Bad key / non-zero `code` / timeout / network error / rate-limit are surfaced as
typed `{ ok: false, error }` failures (never thrown), the cycle is skipped via the existing
`onError` path, and sustained failure lets the store go stale so the UI degrades to em-dashes
— never fabricated zeros (mirrors Feature 001 US9). (FR-021–FR-024)

**Independent Test**: Drive the fetcher with a non-zero `code` envelope, a timeout, a network
error, and a rate-limit response; assert each is a typed failure that skips the cycle without
crashing; then confirm sustained failure degrades the UI to em-dashes.

### Tests for User Story 4 (write FIRST, verify they FAIL) ⚠️

- [ ] T015 [US4] Red: extend [apps/poller/tests/ecowittCloud.test.ts](apps/poller/tests/ecowittCloud.test.ts) to cover the error branches — `code !== 0` (e.g. `40010 "Invalid application Key"`) → `{ ok: false, error: <msg> }` **not thrown** (FR-021, D2); HTTP non-2xx → `{ ok: false, error: "HTTP <status>" }`; network error → `{ ok: false }`; abort/timeout → `{ ok: false }`; rate-limit response → recoverable `{ ok: false }`. Verify Red.
- [ ] T016 [US4] Red: add a resilience integration test [apps/poller/tests/cloud.resilience.integration.test.ts](apps/poller/tests/cloud.resilience.integration.test.ts) (mirroring [apps/poller/tests/resilience.integration.test.ts](apps/poller/tests/resilience.integration.test.ts)) asserting a failed cloud cycle is reported via `onError`, the store is untouched, and sustained failure lets freshness lapse (downstream degrades to em-dashes, never fabricated zeros) (FR-022/FR-023). Verify Red.

### Implementation for User Story 4

- [ ] T017 [US4] Green: implement the error/timeout/non-zero-code handling in [apps/poller/src/ecowittCloud.ts](apps/poller/src/ecowittCloud.ts) (extends the US1 fetcher) so every failure path returns a typed `{ ok: false, error }` carrying the API message and never throws. Makes T015 and T016 pass; brings the fetcher to 100% branch coverage.

**Checkpoint**: All four stories are independently functional; the cloud source fails safe with honest degradation.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Guards and gates that span the stories.

- [ ] T018 [P] Extend [apps/api/tests/boundary.test.ts](apps/api/tests/boundary.test.ts) to keep the cloud fetcher a poller-only dependency (no `apps/web` or `apps/api` source imports `ecowittCloud`) and to assert the shared adapter stays pure (`packages/shared/src/cloudMapping.ts` imports no fetch/`node:`/I/O modules). Preserves the import-boundary guard (D3, plan Constitution Check).
- [ ] T019 Run the 100% coverage gate and typecheck: `npm run -w @ecowitt/shared test:coverage`, `npm run -w @ecowitt/poller test:coverage`, and `npm run typecheck` — confirm fetcher (success/HTTP-error/network-error/timeout/non-zero-code), adapter (every field + both synthesized fallbacks + weekly/monthly/yearly rain + rain-on/off + inHg pressure + downstream pass-through), and config (default/switch/parsing/missing-creds) are fully covered (FR-024, SC-006).
- [ ] T020 Final [quickstart.md](specs/002-livemock/quickstart.md) end-to-end pass: verify US1 production-default-unchanged (zero cloud calls on `gateway`), US3 live values, and US4 honest degradation (bad key → em-dashes, then recovery), confirming SC-001 through SC-005.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: No new code; existing pipeline is the foundation.
- **User Stories (Phases 3–6)**: Begin after Setup.
  - US1 and US2 are tightly coupled (both P1): US1's wiring (T007) and integration test
    (T004) depend on the US2 adapter (T010). Build US2's schema+adapter alongside US1.
  - US3 depends on US1 wiring (T007) + US2 adapter (T010) to show live data.
  - US4 (P2) extends the US1 fetcher (T006) with its error branches (T017).
- **Polish (Phase 7)**: After the desired stories are complete.

### User Story Dependencies

- **US1 (#14, P1)**: MVP. Independently testable at the fetcher/config level; the full
  pipeline integration (T004) needs the US2 adapter.
- **US2 (#15, P1)**: Pure adapter — independently testable in isolation with a captured
  payload. Unblocks US1's wiring/integration.
- **US3 (#16, P1)**: Operator-facing run — depends on US1 + US2 being Green.
- **US4 (#17, P2)**: Resilience — extends the US1 fetcher module; independently testable via
  injected failure fixtures.

### Within Each User Story

- Tests are written and MUST FAIL before implementation (Red → Green).
- Config + schema before the modules that consume them.
- Adapter (pure) before the wiring that calls it.
- Story complete before moving to the next priority.

### Parallel Opportunities

- T003 (fetcher test) and T002 (config test) touch different files → parallelizable.
- T008 (shared adapter test) is independent of all `apps/poller` work → parallelizable with US1 tests.
- T012 (compose override) and T013 (`.env.example`) touch different files → parallelizable.
- T018 (boundary test) is independent of the implementation files → parallelizable once modules exist.
- US2's pure adapter (T008–T011) can be built in parallel with US1's fetcher/config (T002–T006) by a second developer; converge at US1 wiring (T007).

---

## Parallel Example: US1 + US2 kickoff (both P1)

```text
# Launch the failing tests together (different files, no shared state):
Task T002 [US1]: Red config switch test          → apps/poller/tests/config.test.ts
Task T003 [US1]: Red fetcher happy-path test      → apps/poller/tests/ecowittCloud.test.ts
Task T008 [US2]: Red schema + adapter test        → packages/shared/tests/cloudMapping.test.ts

# Then implement in parallel:
Task T005 [US1]: config.ts source switch          → apps/poller/src/config.ts
Task T006 [US1]: ecowittCloud.ts happy path       → apps/poller/src/ecowittCloud.ts
Task T009/T010 [US2]: schema.ts + cloudMapping.ts → packages/shared/src/*

# Converge:
Task T007 [US1]: wire index.ts (needs T010 adapter)
```

---

## Implementation Strategy

### MVP First (US1 + US2 → US3)

1. Phase 1 Setup (gitignore `.env`).
2. US2 adapter + schema (pure, isolated, 100% coverage) and US1 fetcher + config in parallel.
3. Wire US1 `index.ts` source selection (consumes the US2 adapter) → cloud poll cycle stores a reading.
4. US3 compose override + `.env.example` → bring the stack up off-LAN and **see real data**.
5. STOP and VALIDATE: live values on the dashboard, D7 confirmed from a live capture, no secrets committed.

### Incremental Delivery

1. Setup → US2 (adapter ingestible) → US1 (cloud cycle stores) → **US3 (operator sees real data — the payoff)**.
2. Add US4 (honest degradation) → bad key/timeout/rate-limit fail safe to em-dashes.
3. Polish: boundary guard + full coverage gate + final quickstart pass.

---

## Notes

- [P] = different files, no dependency on incomplete tasks.
- [Story] labels map each task to its Issue (US1 #14, US2 #15, US3 #16, US4 #17) for the
  later `/speckit.taskstoissues` sync.
- Red before Green: verify each new test fails before implementing. Never weaken the strict
  shared schema (Decision A synthesizes the two cloud-absent fields).
- Production default stays `gateway`; no UI changes; secrets only in the gitignored `.env`.
- The fetcher (`ecowittCloud.ts`) is implemented across US1 (happy path) and US4 (error
  branches); it reaches 100% coverage only after T017.
