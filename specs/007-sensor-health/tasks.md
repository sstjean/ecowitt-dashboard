# Tasks: Sensor Battery & Signal Health (007)

**Input**: Design documents from `/specs/007-sensor-health/`

**Prerequisites**: [plan.md](./plan.md) ✅, [spec.md](./spec.md) ✅, [research.md](./research.md) ✅, [data-model.md](./data-model.md) ✅, [contracts/sensors-info-fetch.md](./contracts/sensors-info-fetch.md) ✅, [contracts/sensor-health-normalization.md](./contracts/sensor-health-normalization.md) ✅, [contracts/latest-envelope.md](./contracts/latest-envelope.md) ✅, [quickstart.md](./quickstart.md) ✅

**Source of truth**: GitHub Issues [#25](https://github.com/sstjean/ecowitt-dashboard/issues/25) (parent — dedicated Sensor Health page, US3) / [#36](https://github.com/sstjean/ecowitt-dashboard/issues/36) (per-card indicators, US2). US1/US4 sub-issues to be created under #25. If they disagree with this file, the Issues win.

**Tests**: REQUIRED. This is a strict-TDD project (Constitution Principle IV + CI 100%-coverage gate). **Every production edit is preceded by a failing-test task (Red) and an explicit Red-verification gate before the implementation (Green).** Tests are NEVER modified to make production pass; if a test was authored wrong, revert production, fix the test, re-verify Red, then re-apply Green.

**Organization**: Tasks are grouped by user story. **US1 is the shared foundation built first**; **US3 and US2 then proceed in parallel** on top of it; **US4 (honest degradation) is woven through US1 + both UIs**, not a separate phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `US1`/`US2`/`US3`/`US4` for user-story phases; Setup/Foundational/Polish carry no story tag
- Exact file paths are included in every task

## Path Conventions (from [plan.md](./plan.md) → Project Structure)

- Shared contract + normalizer (EXTEND): [packages/shared/src/schema.ts](../../packages/shared/src/schema.ts) · tests [packages/shared/tests/schema.test.ts](../../packages/shared/tests/schema.test.ts) + [packages/shared/tests/sensorHealth.test.ts](../../packages/shared/tests/sensorHealth.test.ts)
- Poller fetch (EXTEND): [apps/poller/src/gatewayClient.ts](../../apps/poller/src/gatewayClient.ts) · tests [apps/poller/tests/sensorsInfo.test.ts](../../apps/poller/tests/sensorsInfo.test.ts)
- Poller persist + wiring: [apps/poller/src/store.ts](../../apps/poller/src/store.ts) + [apps/poller/src/poll.ts](../../apps/poller/src/poll.ts) · tests [apps/poller/tests/store.test.ts](../../apps/poller/tests/store.test.ts) + [apps/poller/tests/poll.test.ts](../../apps/poller/tests/poll.test.ts)
- API read + freshness (NEW): [apps/api/src/store.ts](../../apps/api/src/store.ts) + [apps/api/src/sensorHealth.ts](../../apps/api/src/sensorHealth.ts) · tests [apps/api/tests/sensorHealth.test.ts](../../apps/api/tests/sensorHealth.test.ts)
- API envelope wiring: [apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts) · tests [apps/api/tests/latest.test.ts](../../apps/api/tests/latest.test.ts)
- Web indicator (NEW): [apps/web/src/render/sensorIndicator.ts](../../apps/web/src/render/sensorIndicator.ts) · tests [apps/web/tests/sensorIndicator.test.ts](../../apps/web/tests/sensorIndicator.test.ts)
- Web health page (NEW): [apps/web/src/render/sensorHealthPage.ts](../../apps/web/src/render/sensorHealthPage.ts) · tests [apps/web/tests/sensorHealthPage.test.ts](../../apps/web/tests/sensorHealthPage.test.ts)
- Web card map (NEW): [apps/web/src/sensorCardMap.ts](../../apps/web/src/sensorCardMap.ts)
- Web wiring + header + styles: [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts) + [apps/web/src/render/header.ts](../../apps/web/src/render/header.ts) + [apps/web/src/styles.css](../../apps/web/src/styles.css)
- e2e (EXTEND/GUARD): [apps/web/e2e/fixtures.ts](../../apps/web/e2e/fixtures.ts) + [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts) + [apps/web/e2e/kiosk.spec.ts](../../apps/web/e2e/kiosk.spec.ts)
- Fixtures (NEW, committed static-capture test data): `apps/poller/tests/fixtures/sensorsInfo/` + `packages/shared/tests/fixtures/sensorHealth/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the branch and stage the committed static-capture fixtures every story replays. Fixtures are **committed STATIC CAPTURES** — de-identified extracts of a real `get_sensors_info` response (hex radio ids only; this app stores no PII, so a static capture of real values is acceptable). Tests replay these captures and **NEVER** read the live gateway or DB at test time (Constitution: Test Data Separation — deterministic, no live fetch; the gateway ignores ICMP — reach it with `curl`, never `ping`).

- [X] T001 Confirm working branch is `007-sensor-health` and create fixture dirs `apps/poller/tests/fixtures/sensorsInfo/` and `packages/shared/tests/fixtures/sensorHealth/`
- [X] T002 [P] Capture committed STATIC-CAPTURE raw page fixtures `apps/poller/tests/fixtures/sensorsInfo/page1.json` and `apps/poller/tests/fixtures/sensorsInfo/page2.json` — the real two-page `get_sensors_info` `{ command: [{ sensor: [...] }] }` shape (all values JSON strings): WS90 (`img wh90`, `type 48`, `id 12FAD`, `batt 5`, `signal 4`, `rssi -74`, `idst 1`), wh31 CH2 (`type 7`, `id A0`, `batt 0`, `signal 4`, `rssi -96`, `idst 1`), wh25 wired (`type 4`, no/zero radio), plus placeholder rows (`id FFFFFFFE`/`FFFFFFFF`, `idst 0`) and a duplicate-id row spanning both pages (FR-001/FR-002/FR-003)
- [X] T003 [P] Capture committed STATIC-CAPTURE normalization fixtures `packages/shared/tests/fixtures/sensorHealth/merged.json` (the merged raw payload — page1+page2 deduped, drives the SC-001 acceptance test) and `packages/shared/tests/fixtures/sensorHealth/garbage.json` (a malformed/non-`{command:[{sensor}]}` payload, drives the US4 whole-payload-guard path, FR-012/SC-005)

---

## Phase 2: Foundational (Blocking Prerequisites — additive shared schemas)

**Purpose**: Add the NEW, **additive** (non-breaking) shared schemas, tunable defaults, and derived types that every later phase consumes — `sensorHealthEntrySchema`, `sensorHealthSchema`, `SENSOR_HEALTH_DEFAULTS`, and the exported `SensorHealthEntry`/`SensorHealth` types. `latestSnapshotSchema` is intentionally **left untouched here** (the breaking required-field change + its ripple is the first atomic step of US1, T007–T011) so the existing suite stays green through this phase.

**⚠️ CRITICAL**: Blocks the normalizer (US1), the API envelope (US1), and both web surfaces (US2/US3). Nothing downstream can begin until this is green.

- [X] T004 Red: extend `packages/shared/tests/schema.test.ts` — assert `sensorHealthEntrySchema` (a `z.strictObject`) validates the documented projection (`battery` ∈ `OK|Low|Unknown|N/A`; `batteryRaw` `number|null`; `signalBars` `int 0–4 | null`; `rssiDbm` `number|null`; `registered` boolean; `lastSeenUtc` `isoUtc`; non-empty `id`/`img`/`name`; int `type`) and rejects out-of-enum/out-of-range/missing fields; assert `sensorHealthSchema` validates `{ available, stale, capturedAtUtc: isoUtc|null, sensors: [] }`; assert `SENSOR_HEALTH_DEFAULTS` exposes `WS90_BATTERY_LOW_MAX === 1` and `SENSOR_HEALTH_STALE_SECONDS === 300`; assert exported types `SensorHealthEntry`/`SensorHealth` are inferred from the schemas (FR-004/FR-005)
- [X] T005 Red-verify: run `npm --workspace packages/shared run test` and CONFIRM the new assertions FAIL (schemas/constants/types not yet present)
- [X] T006 Green: add `sensorHealthEntrySchema`, `sensorHealthSchema`, `SENSOR_HEALTH_DEFAULTS` (tunable named constants — no magic numbers), and `export type SensorHealthEntry`/`SensorHealth` to `packages/shared/src/schema.ts` (additive only; `latestSnapshotSchema` untouched). Re-run `npm --workspace packages/shared run test` to green

**Checkpoint**: Shared contract surface exists. The breaking envelope-field change is handled atomically in US1 next.

---

## Phase 3: User Story 1 — Poller fetches, normalizes, persists & serves per-sensor health (Priority: P1) 🎯 MVP

**Goal**: Each poll cycle additionally fetches `get_sensors_info` (both pages), normalizes every **registered** sensor to a health projection (placeholders excluded, per-type battery rules applied), persists a **single-row** snapshot, and the API merges a `sensorHealth` object onto `/api/v1/latest` with an `available`/`stale` freshness marker. Honest degradation (US4) is built in here: a failed/garbage fetch never touches the readings write path. (FR-001..FR-006, FR-012, FR-016; SC-001, SC-004, SC-005, SC-006)

**Independent Test**: Feed the captured two-page payload through the poller's normalization → API returns exactly one record per registered sensor (placeholders excluded) with correct battery/signal/rssi/last-seen; make the fetch fail → readings still served and `sensorHealth` is `available:false`/`stale:true`.

### US1a — Breaking envelope field + the known ripple (atomic) ⚠️

> **Learned in 008**: `latestSnapshotSchema` is a `z.strictObject`; adding a **required** `sensorHealth` field breaks EVERY existing full-envelope fixture AND both e2e mocks the moment it lands. The field addition and the fixture/e2e ripple MUST ship together (one atomic change) or the suite goes red. Treat the ripple as part of this task, not an afterthought.

- [X] T007 [US1] Red: extend `packages/shared/tests/schema.test.ts` — assert `latestSnapshotSchema` (strictObject) now REQUIRES `sensorHealth: sensorHealthSchema`, rejects an envelope missing it, and accepts a well-formed `{ available, stale, capturedAtUtc, sensors }` (contract: [latest-envelope.md](./contracts/latest-envelope.md))
- [X] T008 [US1] Red-verify: run `npm --workspace packages/shared run test` and CONFIRM the `latestSnapshotSchema` assertion FAILS (field not yet added)
- [X] T009 [US1] Green: add `sensorHealth: sensorHealthSchema` to the `latestSnapshotSchema` strictObject in `packages/shared/src/schema.ts`; re-run `npm --workspace packages/shared run test` to green
- [X] T010 [US1] Green (ripple — atomic with T009): update EVERY existing producer of a full `LatestSnapshot` to include a well-formed `sensorHealth` so the suite stays green — BOTH mocks in `apps/web/e2e/fixtures.ts` (`latestSnapshot` AND `noDataSnapshot` → empty health `{ available:false, stale:true, capturedAtUtc:null, sensors:[] }`), and any unit fixtures that build a full envelope literal in `apps/api/tests/latest.test.ts` and `apps/web/tests/**` render snapshots
- [X] T011 [US1] Ripple-verify: run `npm --workspace apps/api run test` and `npm --workspace apps/web run test` and CONFIRM the previously-passing suites are green again (no fixture left without `sensorHealth`); this guards against the 008 CI breakage

### US1b — Normalization (shared, pure) ⚠️

- [X] T012 [US1] Red: create `packages/shared/tests/sensorHealth.test.ts` (AAA, self-contained) — `normalizeSensorHealth(merged.json, capturedAtUtc)` yields exactly one record per **registered** sensor; placeholders `FFFFFFFF`/`FFFFFFFE` and `idst !== "1"` excluded (FR-003/SC-001); WS90 (`type 48, batt 5, signal 4, rssi -74`) → `battery OK, signalBars 4, rssiDbm -74, lastSeenUtc = capturedAtUtc`; whole-payload guard: `garbage.json` (non-`{command:[{sensor}]}`) → `[]` (FR-012/SC-005)
- [X] T013 [US1] Red: add per-type battery + projection boundary tests to `packages/shared/tests/sensorHealth.test.ts` (uses `builders`/inline raw entries) — WS90 `batt 1` ⇒ `Low`, `batt 2` ⇒ `OK` (boundary at `WS90_BATTERY_LOW_MAX`); wh31 `batt 0` ⇒ `OK`, `batt 1` ⇒ `Low` (flag polarity, never "0% empty", SC-004); wh25 wired (no `signal`/`rssi`) ⇒ `battery N/A, signalBars null, rssiDbm null` (FR-009); unknown `type` with `batt 3` ⇒ `Unknown` (never fabricate a level, FR-005); missing `batt` ⇒ `batteryRaw null` + rule; `signal "9"` clamped to `4`; one malformed entry among valid ones ⇒ malformed skipped, valid kept (per-entry salvage, FR-012)
- [X] T014 [US1] Red-verify: run `npm --workspace packages/shared run test sensorHealth` and CONFIRM every assertion FAILS (`normalizeSensorHealth` does not yet exist)
- [X] T015 [US1] Green: add `normalizeSensorHealth(raw, capturedAtUtc): SensorHealthEntry[]` and the per-type `SENSOR_BATTERY_RULES` registry (keyed by numeric `type`, safe `Unknown` fallback — SRP: one rule per type, DRY shared coercion helper) to `packages/shared/src/schema.ts`, single-sourcing `WS90_BATTERY_LOW_MAX` from `SENSOR_HEALTH_DEFAULTS`. Run T012–T013 to green; never weaken a test to pass

### US1c — Poller fetch (sole cross-VLAN consumer) ⚠️

- [X] T016 [US1] Red: create `apps/poller/tests/sensorsInfo.test.ts` (injected `fetchImpl`, static page1/page2 fixtures — never the live gateway) — both pages OK ⇒ merged + deduped raw (`ok:true`); page1 OK / page2 network error ⇒ page-1 sensors (`ok:true`, best-effort); page1 timeout (`AbortError`) ⇒ `{ ok:false, error }` no throw; non-2xx ⇒ `{ ok:false, error }`; non-JSON body ⇒ `{ ok:false, error }`; duplicate id across pages ⇒ appears once (contract: [sensors-info-fetch.md](./contracts/sensors-info-fetch.md), FR-001/FR-002)
- [X] T017 [US1] Red-verify: run `npm --workspace apps/poller run test sensorsInfo` and CONFIRM every test FAILS (`fetchSensorsInfo` not yet present)
- [X] T018 [US1] Green: add `fetchSensorsInfo(baseUrl, timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS, fetchImpl = fetch): Promise<GatewayResult<RawSensorsInfo>>` to `apps/poller/src/gatewayClient.ts` — two pages each under their own `AbortController` timeout, page-2 best-effort, merge+dedup by `id`, **never throws** (mirrors `fetchLivedata`). Run T016 to green

### US1d — Poller persist (single-row snapshot) ⚠️

- [X] T019 [US1] Red: extend `apps/poller/tests/store.test.ts` — `upsertSensorHealth(capturedAtUtc, sensors)` INSERTs the single row (`id=1`), and on a second call UPDATEs `captured_at`/`sensors_json` in place (ON CONFLICT — still exactly one row, NOT a history table, FR-016); the `sensor_health` table bootstrap is idempotent (safe to call twice)
- [X] T020 [US1] Red-verify: run `npm --workspace apps/poller run test store` and CONFIRM the new assertions FAIL (`upsertSensorHealth`/table not yet present)
- [X] T021 [US1] Green: add the `sensor_health(id INTEGER PRIMARY KEY CHECK(id=1), captured_at TEXT, sensors_json TEXT)` bootstrap and `upsertSensorHealth(capturedAtUtc, sensors)` (INSERT … ON CONFLICT(id) DO UPDATE) to `apps/poller/src/store.ts`. Run T019 to green

### US1e — Poller wiring with isolated failure (US4 woven in) ⚠️

- [X] T022 [US1] [US4] Red: extend `apps/poller/tests/poll.test.ts` — on a successful cycle the poller fetches `get_sensors_info`, normalizes, and calls `upsertSensorHealth`; when `fetchSensorsInfo` returns `{ ok:false }` (or normalize yields `[]`) the poller **skips** the upsert, the readings ingest still completes, and **no exception propagates** (failure reported via `onError` only) — the health failure never touches the readings write path (FR-012/SC-005)
- [X] T023 [US1] [US4] Red-verify: run `npm --workspace apps/poller run test poll` and CONFIRM the new assertions FAIL (health step not yet wired)
- [X] T024 [US1] [US4] Green: wire `apps/poller/src/poll.ts` — after the readings ingest, fetch+normalize+upsert sensor health inside an **isolated try/catch** (failure → `onError`, readings untouched). Run T022 to green

### US1f — API read + freshness envelope ⚠️

- [X] T025 [US1] Red: extend `apps/api/tests/sensorHealth.test.ts` (new file) for the store reader — `getSensorHealth()` returns `{ capturedAt, sensors: SensorHealthEntry[] } | null` (parses `sensors_json`; `null` when no row); table bootstrap idempotent
- [X] T026 [US1] Red-verify: run `npm --workspace apps/api run test sensorHealth` and CONFIRM the reader assertions FAIL (`getSensorHealth`/table not yet present)
- [X] T027 [US1] Green: add the `sensor_health` bootstrap (reader side) and `getSensorHealth(): { capturedAt; sensors } | null` to `apps/api/src/store.ts`. Run T025 to green
- [X] T028 [US1] [US4] Red: add envelope-builder tests to `apps/api/tests/sensorHealth.test.ts` — `buildSensorHealthEnvelope(row, now, staleSeconds)` matrix: `null` row ⇒ `{ available:false, stale:true, capturedAtUtc:null, sensors:[] }`; fresh row (`now − captured_at ≤ staleSeconds`) ⇒ `{ available:true, stale:false, … sensors passthrough }`; aged row (`> staleSeconds`) ⇒ `{ available:true, stale:true, … last-known sensors }`; boundary `now − captured_at === staleSeconds` ⇒ NOT stale (`≤` is fresh) (FR-012/FR-013, contract: [latest-envelope.md](./contracts/latest-envelope.md))
- [X] T029 [US1] [US4] Red-verify: run `npm --workspace apps/api run test sensorHealth` and CONFIRM the envelope assertions FAIL (`sensorHealth.ts` not yet present)
- [X] T030 [US1] [US4] Green: create `apps/api/src/sensorHealth.ts` — `buildSensorHealthEnvelope(row, now, staleSeconds)` computing `available`/`stale` (SRP: freshness decision lives here, not in the route), single-sourcing `SENSOR_HEALTH_STALE_SECONDS` from `@ecowitt/shared`. Run T028 to green

### US1g — Merge onto `/api/v1/latest` (both branches) ⚠️

- [X] T031 [US1] Red: extend `apps/api/tests/latest.test.ts` — the `ok` branch carries `sensorHealth` from `buildSensorHealthEnvelope(store.getSensorHealth(), now, SENSOR_HEALTH_STALE_SECONDS)`; the `no-data` branch carries a well-formed empty `sensorHealth` (`available:false, stale:true, capturedAtUtc:null, sensors:[]`); both branches round-trip `latestSnapshotSchema.parse` (FR-006/SC-006)
- [X] T032 [US1] Red-verify: run `npm --workspace apps/api run test latest` and CONFIRM the new envelope assertions FAIL (route not yet wired)
- [X] T033 [US1] Green: wire `apps/api/src/routes/v1/latest.ts` `buildLatestSnapshot` — read `getSensorHealth()`, call `buildSensorHealthEnvelope`, and merge `sensorHealth` into BOTH `latestSnapshotSchema.parse(...)` branches. Run T031 to green
- [X] T034 [US1] Gate: run `npm --workspace packages/shared run test:coverage`, `npm --workspace apps/poller run test:coverage`, and `npm --workspace apps/api run test:coverage` and confirm **100%** statements/branches/functions/lines across the new normalizer, fetch, persist, poll wiring, reader, and envelope code (`src/server.ts` excluded)

**Checkpoint**: US1 delivers the full lower-tier slice end-to-end — fetch → normalize → persist → serve, with honest degradation. `curl /api/v1/latest | jq '.sensorHealth'` returns one record per registered sensor. **This is the MVP.**

---

## Phase 4: User Story 3 — Dedicated Sensor Health page via the existing hamburger menu (Priority: P1, the formal #25 deliverable) — parallel with US2

**Goal**: A dedicated in-dashboard **Sensor Health overlay** lists every registered sensor with name/model, battery status, signal bars + rssi, and last-seen (Eastern), reached through a NEW **"Sensors"** item added to the EXISTING header hamburger menu (which also gets a touch-target + legibility upgrade). The overlay is **hidden by default** so the single-viewport kiosk no-scroll contract stays green byte-for-byte. (FR-010, FR-011, FR-014, FR-015, FR-017; SC-003, SC-007)

**Independent Test**: Serve the health set → the overlay lists WS90, wh31, wh25 with distinct `OK`/`Low`/lost-link/`N/A`/`Unknown` states and Eastern last-seen; the overlay is `hidden` on load and visible after choosing "Sensors"; `kiosk.spec.ts` no-scroll still passes on the default view.

**Depends on**: US1 (T033 — envelope carries `sensorHealth`). Shared indicator helper (US2 T052) is reused by the page rows — sequence US2 T052 before T040 if building both, or stub the bar/badge helper import.

### Tests for User Story 3 (write FIRST, verify Red) ⚠️

- [X] T035 [P] [US3] Red: extend `apps/web/tests/render/header.test.ts` (create if absent) — the existing hamburger menu gains a **"Sensors"** nav item that, when activated, reveals the health overlay (toggles `hidden`/class — no client-side router); the hamburger touch target/icon and `.nav-item` font/hit areas are enlarged for kiosk legibility (Feature 004 conventions, FR-017) while preserving the existing nav items
- [X] T036 [P] [US3] Red: create `apps/web/tests/sensorHealthPage.test.ts` — given a served `sensorHealth` set, the page renders one row per sensor with name/model, battery status, signal bars + rssi, and last-seen; distinct visual states for `OK`, `Low` battery, lost-link/offline (0 bars or `registered:false`), `N/A` (wired wh25 — never empty bars/“0%”), and `Unknown`/stale (FR-011); the set reflects the currently-registered sensors and re-renders when it changes (FR-015); the overlay element is `hidden` by default (kiosk default intact); every last-seen timestamp renders via `Intl.DateTimeFormat({ timeZone: 'America/New_York' })` (NON-NEGOTIABLE TZ rule, FR-014/SC-007)
- [X] T037 [US3] Red-verify: run `npm --workspace apps/web run test` and CONFIRM the header + page assertions FAIL (menu item/overlay not yet implemented)

### Implementation for User Story 3

- [X] T038 [US3] Green: implement `apps/web/src/render/sensorHealthPage.ts` — kiosk-legible overlay (hidden by default, `position: fixed`, own scroll context) listing every registered sensor with the shared indicator helper (US2), distinct `OK`/`Low`/lost-link/`N/A`/`Unknown`-stale states, and Eastern (`America/New_York`) last-seen. Run T036 to green
- [X] T039 [US3] Green: add the **"Sensors"** item + touch-target/legibility upgrade to `apps/web/src/render/header.ts` and the matching `--cp-*` token styles (enlarged hamburger + nav-item font/hit areas) to `apps/web/src/styles.css`. Run T035 to green
- [X] T040 [US3] Red→Green: extend `apps/web/tests/render/index.test.ts` to require `renderSnapshot` mounts the (hidden) health overlay and wires the "Sensors" toggle from `header.ts` to it; verify Red, then update `apps/web/src/render/index.ts` to mount the overlay + bind the toggle. Keep tests green
- [X] T041 [US3] [US4] Red→Green (e2e): extend `apps/web/e2e/dashboard.spec.ts` — choosing "Sensors" reveals the overlay with every sensor (uses the extended fixtures from T010); extend/GUARD `apps/web/e2e/kiosk.spec.ts` — the overlay is `hidden` on load and the default 2160×1440 view still asserts **no vertical scroll** (`scrollHeight − clientHeight ≤ 1`); verify the new assertions fail before wiring, then green
- [X] T042 [US3] Gate: run `npm --workspace apps/web run test:coverage` and confirm **100%** across `render/sensorHealthPage.ts`, `render/header.ts`, and the wired `render/index.ts`

**Checkpoint**: The formal #25 deliverable is live — a dedicated, legible Sensor Health overlay reached from the existing menu, with the kiosk no-scroll contract preserved.

---

## Phase 5: User Story 2 — Per-card at-a-glance signal + battery indicators (Priority: P2) — parallel with US3

**Goal**: Each dashboard card backed by a physical sensor shows a small signal-bars + battery indicator (from one shared SRP+DRY builder). All four WS90-backed cards reflect the **single** WS90 record; the wired wh25 cards show no radio indicator and `N/A` battery; a `Low` battery shows a distinct cue (never "0%"); stale/unknown health shows an honest `Unknown` state. (FR-007, FR-008, FR-009, FR-013, FR-014, FR-017; SC-002, SC-004, SC-007)

**Independent Test**: Serve the latest envelope with the health set → outdoor/solar/rain cards show 4 bars + `OK` from the one WS90; indoor/baro (wired wh25) show no radio indicator + `N/A`; a `Low` record shows the low-battery cue; a `stale` envelope shows `Unknown`.

**Depends on**: US1 (T033 — envelope carries `sensorHealth`) and Foundational (T006 — types). Shares `sensorIndicator.ts` with US3 (T038).

### Tests for User Story 2 (write FIRST, verify Red) ⚠️

- [X] T043 [P] [US2] Red: create `apps/web/tests/sensorCardMap.test.ts` — the static `sensorCardMap` maps `outdoor`/`solar`/`rain` cards → WS90 `12FAD` (radio indicator) and `indoor`/`baro` → wired wh25 (no radio); all four WS90 cards resolve to the **same one** WS90 record, not four radios (FR-008); wh31 CH2 has no card (health-page-only)
- [X] T044 [P] [US2] Red: create `apps/web/tests/sensorIndicator.test.ts` — `buildSignalBars(bars)` renders 0–4 bars and a no-radio state for `null` (never empty bars implying "lost", FR-009); `buildBatteryBadge(status)` renders distinct `OK`/`Low`/`Unknown`/`N/A` cues with NO numeric "0% / empty" for flag/wired sensors (FR-005/SC-004); a `stale`/`available:false` envelope renders the `Unknown` state (FR-013); any last-seen on the indicator renders in `America/New_York` (FR-014/SC-007); kiosk legibility honored (Feature 004, FR-017)
- [X] T045 [US2] Red-verify: run `npm --workspace apps/web run test` and CONFIRM the card-map + indicator assertions FAIL (helpers not yet present)

### Implementation for User Story 2

- [X] T046 [US2] Green: create `apps/web/src/sensorCardMap.ts` — the static `data-panel` → backing-radio-id map (one WS90 backs four cards; wired wh25 backs two with no radio). Run T043 to green
- [X] T047 [US2] Green: create `apps/web/src/render/sensorIndicator.ts` — shared `buildSignalBars()`/`buildBatteryBadge()` helpers (SRP+DRY, reused by every card AND the US3 page), with `N/A`/`Unknown`/`Low` states and Eastern last-seen, plus the `--cp-*` token styles in `apps/web/src/styles.css`. Run T044 to green
- [X] T048 [US2] [US4] Red→Green: extend `apps/web/tests/render/index.test.ts` to require each sensor-backed card receives its indicator via `sensorCardMap` (all four WS90 cards from the one record; wired wh25 cards get `N/A`/no-radio; stale envelope ⇒ `Unknown`); verify Red, then attach the indicator in `apps/web/src/render/index.ts`. Keep tests green
- [X] T049 [US2] Red→Green (e2e): extend `apps/web/e2e/dashboard.spec.ts` — each sensor-backed card renders bars + battery glyph (WS90 cards 4 bars + `OK`; wired cards `N/A`/no radio) using the extended fixtures (T010); verify the new assertions fail before wiring, then green
- [X] T050 [US2] Gate: run `npm --workspace apps/web run test:coverage` and confirm **100%** across `sensorCardMap.ts`, `render/sensorIndicator.ts`, and the wired `render/index.ts`

**Checkpoint**: All four user stories are functional — US1 serves health, US3 lists the fleet, US2 surfaces per-card glances, and US4 degrades honestly across all surfaces.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Prove the whole stack green and run the quickstart success-criteria scenarios (SC-001..SC-007), including the End-to-End Verification standard (API curl + Playwright/Chrome visual).

- [X] T051 [P] Run full test + coverage per workspace and confirm **100%** (`src/server.ts` excluded): `npm --workspace packages/shared run test:coverage`, `npm --workspace apps/poller run test:coverage`, `npm --workspace apps/api run test:coverage`, `npm --workspace apps/web run test:coverage`
- [X] T052 [P] Run typecheck clean across all four workspaces: `npm --workspace packages/shared run typecheck`, `npm --workspace apps/poller run typecheck`, `npm --workspace apps/api run typecheck`, `npm --workspace apps/web run typecheck`
- [X] T053 Run the web e2e suite `npm --workspace apps/web run test:e2e` and confirm the kiosk **no-vertical-scroll** guard holds with the overlay hidden on load, and the "Sensors" toggle reveals the health overlay (US3/SC-003)
- [X] T054 Execute [quickstart.md](./quickstart.md) SC-001..SC-007 against the mock stack (`docker compose -f docker-compose.mock.yml up --build`): SC-001 one record per registered sensor (placeholders excluded) via `curl …/api/v1/latest | jq '.sensorHealth'`; SC-002 cards show bars + battery; SC-003 overlay lists every sensor; SC-004 flag/wired battery never "0%/empty"; SC-006 health rides `/latest` with no second web call (network log); SC-007 last-seen Eastern — capture a Playwright/Chrome screenshot per the End-to-End Verification standard and inspect colors/bars/timestamps visually
- [X] T055 [US4] Failure-path smoke (SC-005): point the poller at an unreachable/garbage `get_sensors_info` (mock returns 500 or junk), confirm `curl …/api/v1/latest | jq '.reading'` is **still populated** (readings unaffected) while `… | jq '.sensorHealth'` is `available:false`/`stale:true`, and the cards/overlay render `Unknown` (never empty bars or "0%"); record the outcome in the PR description

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately (fixtures T002/T003 are `[P]`).
- **Foundational (Phase 2)**: depends on Setup. **Blocks** the normalizer (US1b), the envelope (US1f/g), and both web surfaces (US2/US3).
- **US1 (Phase 3)**: US1a (breaking field + ripple, T007–T011) gates everything that builds a full envelope; US1b–US1g layer fetch → normalize → persist → poll → read → envelope → route. US1 **blocks** US2 and US3 (they consume the served `sensorHealth`).
- **US3 (Phase 4)** and **US2 (Phase 5)**: both depend on US1 (T033) and Foundational (T006); they proceed **in parallel**. They share `render/sensorIndicator.ts` (US2 T047) — build that helper before the US3 page rows consume it, or stub the import.
- **US4**: woven through US1e (T022–T024), US1f (T028–T030), US3 (T041), US2 (T048), and validated in Polish (T055) — not a separate phase.
- **Polish (Phase 6)**: depends on all stories complete.

### Critical TDD ordering (per implementation unit)

`Red (author failing test)` → `Red-verify (confirm it fails)` → `Green (implement)`:
- Shared additive schemas: T004 → T005 → T006
- Breaking envelope field + ripple: T007 → T008 → T009 → T010 → T011
- Normalizer: T012/T013 → T014 → T015
- Poller fetch: T016 → T017 → T018
- Poller persist: T019 → T020 → T021
- Poller wiring (US4): T022 → T023 → T024
- API reader: T025 → T026 → T027
- API envelope (US4): T028 → T029 → T030
- API route: T031 → T032 → T033
- US3 header/page: T035/T036 → T037 → T038/T039/T040
- US2 map/indicator: T043/T044 → T045 → T046/T047/T048

### Parallel Opportunities

- Setup fixtures **T002, T003** (distinct files).
- US3 test authoring **T035, T036** (`header.test.ts` vs `sensorHealthPage.test.ts`).
- US2 test authoring **T043, T044** (`sensorCardMap.test.ts` vs `sensorIndicator.test.ts`).
- **US3 (Phase 4) and US2 (Phase 5) run in parallel** once US1 is green.
- Polish **T051, T052** (coverage vs typecheck).
- Same-file test tasks (T012 then T013; T028 after T025 in `sensorHealth.test.ts`) are sequential.

---

## Parallel Example: Phase 1 Setup

```bash
# Capture the committed static-capture fixtures together:
Task T002: page1.json + page2.json   (apps/poller/tests/fixtures/sensorsInfo/)
Task T003: merged.json + garbage.json (packages/shared/tests/fixtures/sensorHealth/)
```

## Parallel Example: US3 + US2 test authoring (after US1 green)

```bash
Task T035: extend apps/web/tests/render/header.test.ts     (Sensors item + touch/legibility)
Task T036: create apps/web/tests/sensorHealthPage.test.ts  (page rows + states + Eastern)
Task T043: create apps/web/tests/sensorCardMap.test.ts     (sensor→card map, one WS90 → 4 cards)
Task T044: create apps/web/tests/sensorIndicator.test.ts   (bars/battery + N/A + Unknown + TZ)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (additive schemas) → 3. Phase 3 US1 (breaking field + ripple, then fetch → normalize → persist → poll → read → envelope → route) → **STOP & VALIDATE**: `curl /api/v1/latest | jq '.sensorHealth'` returns one record per registered sensor (placeholders excluded); make the fetch fail → readings still served, health `available:false`/`stale:true`. Ship the MVP.

### Incremental Delivery

1. Setup + Foundational → contract ready.
2. US1 → fetch/normalize/persist/serve end-to-end + honest degradation (MVP).
3. US3 ∥ US2 → dedicated health overlay + per-card indicators (parallel).
4. Polish → full coverage + typecheck + e2e + quickstart SC-001..SC-007 + US4 failure smoke.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- `[Story]` maps a task to its user story / GitHub Issue for traceability.
- Verify Red before every Green; never modify a test to make production pass.
- **Storage = UTC, Display = America/New_York is NON-NEGOTIABLE** for every "last seen" (FR-014/SC-007).
- **Single Cross-VLAN Consumer (NON-NEGOTIABLE)**: only the poller may fetch `get_sensors_info`; the API reads only the store.
- **No history table** (FR-016) — `sensor_health` is a single upserted row (current snapshot only).
- **Known ripple (008 lesson)**: the required `sensorHealth` field on `latestSnapshotSchema` breaks every full-envelope fixture + both e2e mocks the instant it lands — T009/T010/T011 ship it atomically and re-verify the suite green.
- Fixtures are committed STATIC CAPTURES of a real `get_sensors_info` response (Constitution: Test Data Separation) — replayed deterministically via injected `fetchImpl`, never the live gateway/DB at test time.
- `SensorHealthEntry`/`SensorHealth` are single-sourced in `@ecowitt/shared`; the poller, API, and web import them — no duplicate declarations.
- Commit after each task or logical Red→Green pair; never commit directly to `main`.
