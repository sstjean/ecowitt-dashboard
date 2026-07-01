# Feature Specification: Fix Feature 007 `get_sensors_info` Contract (Bug Fix)

**Feature Branch**: `011-fix-sensors-info-contract`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Bug fix to shipped Feature 007 (sensor battery & signal health). 007 shipped and deployed but is broken on the real GW2000 gateway because its `get_sensors_info` parser and test fixtures assumed an envelope shape the device never emits. Correct the contract to the real bare-array shape, fix the registered-sensor filter and signal coercion, re-capture real device fixtures, correct the honest card mapping, and redeploy."

## This is a bug fix

Feature 007 (Sensor Battery & Signal Health) is **shipped and deployed** but
**broken in production**. This feature corrects the `get_sensors_info` contract
that 007 got wrong. It adds **no new user-facing capability** — it makes 007's
existing capability actually work against the real hardware. Feature 007's design,
API envelope, battery/signal semantics, and honest-degradation guarantee (US4) all
stand; only the **payload contract, filter key, coercion edge, fixtures, and card
mapping** are corrected.

> **Regression, not enhancement.** The acceptance bar is: on the real GW2000 the
> served `sensorHealth` populates with real registered sensors and the poller stops
> error-logging every cycle — the exact behavior 007 promised but never delivered
> on hardware.

## Background — the bug (verified live 2026-07-01 against GW2000 at 192.168.30.109)

007 was built and "100%-covered" entirely against **fabricated fixtures** whose
shape the real device never emits. The 100% coverage proved nothing because it
validated a contract the hardware does not honor. Five concrete defects:

1. **Wrong envelope shape.** 007's `fetchSensorsInfo`
   ([apps/poller/src/gatewayClient.ts](../../apps/poller/src/gatewayClient.ts)) and
   `normalizeSensorHealth`
   ([packages/shared/src/schema.ts](../../packages/shared/src/schema.ts)) parse
   `{ "command": [ { "sensor": [ … ] } ] }`. The real device returns
   `get_sensors_info?page=1` and `?page=2` **each as a bare JSON array** of sensor
   objects: `[{img,type,name,id,batt,rssi,signal,idst,version?}, …]`. So
   `body.command[0]!.sensor` throws `Cannot read properties of undefined (reading '0')`
   every poll cycle. Readings still flow (007's US4 isolation held), but
   `sensorHealth` is permanently `available:false` / `stale:true` and the poller
   error-logs each cycle.

2. **Wrong "registered" filter.** 007 keys "registered" on `idst === "1"`. On the
   real device, placeholder/unlinked rows carry `id:"FFFFFFFF"` (or `FFFFFFFE`)
   **and** `idst:"1"` (e.g. the `wh85`, `wh69`, `wh68` slots). "Registered" MUST be
   keyed on the **`id`** (exclude `FFFFFFFF` and `FFFFFFFE`), never on `idst`.

3. **`rssi`/`signal` can be the string `"--"`** on unlinked rows (not a number) →
   must coerce to `null` (never `NaN`, never `0`).

4. **Fabricated fixtures.** The committed captures
   ([apps/poller/tests/fixtures/sensorsInfo/page1.json](../../apps/poller/tests/fixtures/sensorsInfo/page1.json),
   `page2.json`, and
   [packages/shared/tests/fixtures/sensorHealth/merged.json](../../packages/shared/tests/fixtures/sensorHealth/merged.json))
   used the fake wrapper shape, a stale WS90 id (`12FAD`), and an invented wired
   `wh25` radio entry. Fixtures MUST be re-captured from the real device.

5. **Wired `wh25` is NOT in `get_sensors_info`.** The real registered radios are
   ONLY: **WS90** (`img wh90`, type 48, id `1242D`, batt 5, signal 4, rssi −76) on
   page 1, and one **`wh31` CH2** (type 7, id `A0`, batt 0 = OK flag, signal 4,
   rssi −94) on page 2. The indoor/baro `wh25` is **wired to the console** and
   reported via `get_livedata_info`'s `wh25[]` block — it does **not** appear in
   `get_sensors_info`. 007's `sensorCardMap`
   ([apps/web/src/sensorCardMap.ts](../../apps/web/src/sensorCardMap.ts)) invents a
   wired `wh25` health row (id `C7`) that no `get_sensors_info` record backs. The
   honest behavior: indoor/baro cards get **no radio indicator / no health row**,
   because there is no radio sensor to report.

### Real device payload (de-identified static capture, radio hex ids only — no PII)

Page 1 (16 entries) — the only registered row is the WS90; all others are
placeholders:

```json
[
  {"img":"wh85","type":"49","name":"Wind & Rain","id":"FFFFFFFF","batt":"9","rssi":"--","signal":"--","idst":"1"},
  {"img":"wh90","type":"48","name":"Temp & Humidity & Solar & Wind & Rain","version":"160","id":"1242D","batt":"5","rssi":"-76","signal":"4","idst":"1"},
  {"img":"wh69","type":"0","name":"…","id":"FFFFFFFF","batt":"9","rssi":"--","signal":"--","idst":"1"},
  … (13 more placeholder rows: FFFFFFFF/FFFFFFFE, rssi/signal "--") …
]
```

Page 2 (16 entries) — the only registered row is the `wh31` CH2:

```json
[
  {"img":"wh31","type":"7","name":"Temp & Humidity CH2","id":"A0","batt":"0","rssi":"-94","signal":"4","idst":"1"},
  … (15 placeholder rows: FFFFFFFF, rssi/signal "--") …
]
```

Full captures are saved locally at `/tmp/real_sensors_page1.json` and
`/tmp/real_sensors_page2.json` for re-capture reference.

### Real registered sensor set (the correct health projection)

| Sensor | `img` | `type` | `id` | `batt` | `signal` | `rssi` | Battery projection |
|--------|-------|--------|------|--------|----------|--------|--------------------|
| **WS90** | `wh90` | 48 | `1242D` | 5 (level 0–5) | 4 | −76 | `OK` |
| **`wh31` CH2** | `wh31` | 7 | `A0` | 0 (low flag) | 4 | −94 | `OK` |

Everything else on both pages is a placeholder (`FFFFFFFF` / `FFFFFFFE`) and MUST be
excluded. The indoor/baro cards have **no** `get_sensors_info` record.

## Scope

**In scope**: the poller fetch/parse contract, the shared normalization
projection, the web card→sensor mapping, and the four workspaces' test fixtures
and tests. Redeploy of all three amd64 images to prod and live verification.

**Out of scope**: any new columns, endpoints, history/trends, or UI beyond
restoring 007's promised behavior. Reading indoor/baro battery from
`get_livedata_info`'s `wh25[]` block is a possible future enhancement, **not** this
fix.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Poller parses the real bare-array payload so health populates live (Priority: P1)

As the dashboard backend, I want the poller to parse the **real** bare-array
`get_sensors_info` payload for both pages (defensively tolerating an empty or
garbage page by skipping it, never throwing), so that `sensorHealth` populates on
the live gateway instead of failing every cycle.

**Why this priority**: This is the core of the bug fix and the MVP. Until the
parser accepts the real shape, `sensorHealth` is permanently unavailable and the
poller error-logs every cycle — the other two stories are moot without it.

**Independent Test**: Feed the re-captured real page 1 + page 2 bare arrays through
`fetchSensorsInfo` → `normalizeSensorHealth`; confirm the poller does **not** throw,
the merged projection is produced, and against a fresh snapshot the API's
`sensorHealth.available` is `true` and `stale` is `false`.

**Acceptance Scenarios**:

1. **Given** the real page 1 response is a **bare JSON array** (no `command`
   wrapper), **When** the poller fetches and parses it, **Then** it extracts the
   sensor array without throwing.
2. **Given** page 2 is empty, missing, or non-array garbage, **When** the poller
   parses it, **Then** it skips that page and still returns page 1's sensors —
   never throwing.
3. **Given** both real pages parse successfully and a snapshot is persisted,
   **When** `/api/v1/latest` is served, **Then** `sensorHealth.available` is `true`
   and `sensorHealth.stale` is `false`.
4. **Given** any `get_sensors_info` fetch/parse failure, **When** the poll cycle
   runs, **Then** the readings write path is unaffected (007's US4 honest
   degradation preserved).

---

### User Story 2 - Correct registered-sensor filter and signal coercion (Priority: P2)

As the dashboard backend, I want "registered" keyed on the sensor `id` (excluding
`FFFFFFFF` and `FFFFFFFE`) rather than `idst`, and non-numeric `rssi`/`signal`
values coerced to `null`, so that the served health set contains exactly the two
real radios with correct battery/signal projections.

**Why this priority**: Once the shape parses (US1), the set must be *correct*.
Keying on `idst` would wrongly admit `idst:"1"` placeholders; leaving `"--"` as
`NaN`/`0` would misreport signal.

**Independent Test**: Run the real captures through `normalizeSensorHealth`; assert
the projected set is exactly `{WS90 1242D, wh31 A0}`, zero placeholder ids, and that
every placeholder's `"--"` `rssi`/`signal` never appears as a number.

**Acceptance Scenarios**:

1. **Given** a placeholder row `id:"FFFFFFFF", idst:"1"`, **When** normalized,
   **Then** it is excluded (registered is keyed on `id`, not `idst`).
2. **Given** the WS90 row (`id:1242D, type 48, batt 5, signal 4, rssi −76`), **When**
   normalized, **Then** battery is `OK`, `signalBars` 4, `rssiDbm` −76.
3. **Given** the `wh31` CH2 row (`id:A0, type 7, batt 0`), **When** normalized,
   **Then** battery is `OK` (flag 0), never rendered as "0% empty."
4. **Given** any row with `rssi:"--"` / `signal:"--"`, **When** normalized (if it
   were ever registered), **Then** those fields coerce to `null`, never `NaN` or `0`.

---

### User Story 3 - Honest card mapping: no fabricated wired `wh25` health row (Priority: P3)

As a dashboard viewer, I want the indoor and barometer cards to show **no** radio
health indicator (because no radio sensor backs them), and the outdoor/solar/rain
cards to bind to the **real** WS90 id, so the UI reflects reality instead of an
invented sensor.

**Why this priority**: This corrects a visible dishonesty (a fabricated `wh25`
radio row / `N/A` indicator) but is cosmetic relative to the data-path fix.

**Independent Test**: Assert the card→sensor map binds outdoor/solar/rain to the
real WS90 id (`1242D`), binds no card to a wired `wh25` health row, and that
indoor/baro render no radio indicator.

**Acceptance Scenarios**:

1. **Given** the corrected card map, **When** the dashboard renders, **Then** the
   outdoor, solar, and rain cards reflect the single WS90 radio (`1242D`).
2. **Given** the indoor and barometer cards, **When** the dashboard renders,
   **Then** they show **no** radio/battery health indicator and reference **no**
   `get_sensors_info` health row.
3. **Given** the `wh31` CH2 sensor, **When** the Sensor Health page renders,
   **Then** it appears there (no dashboard card binds it).

---

### Edge Cases

- **Both pages garbage/empty** → merged projection is empty; `sensorHealth.available`
  reflects "no registered sensors," and the poller does not throw.
- **Page 1 succeeds, page 2 fails** → page 1's registered sensors are still served
  (best-effort page 2, unchanged from 007).
- **A registered row with a non-numeric `type`** → skip that single entry without
  discarding its siblings (per-entry salvage, unchanged from 007).
- **A future firmware that re-adds a `command` wrapper** → out of scope; the fix
  targets the shape the hardware emits today (bare array).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The poller MUST parse each `get_sensors_info?page=N` response as a
  **bare JSON array** of sensor objects (the real GW2000 shape), replacing the
  `{ command:[{ sensor:[…] }] }` wrapper assumption.
- **FR-002**: The parser MUST defensively tolerate an empty, missing, or non-array
  page by **skipping** it and never throwing.
- **FR-003**: The shared normalization MUST accept the merged real payload and
  produce the health projection without depending on a `command`/`sensor` wrapper.
- **FR-004**: A registered sensor MUST be identified by its `id` **not** being in
  `{FFFFFFFF, FFFFFFFE}` (and non-empty). Registration MUST NOT be keyed on `idst`.
- **FR-005**: `rssi` and `signal` values of `"--"` (or any non-numeric string) MUST
  coerce to `null` — never `NaN`, never `0`.
- **FR-006**: The existing per-type battery rules MUST be preserved: WS90 (type 48)
  numeric level 0–5 with `≤1 ⇒ Low` else `OK`; `wh31` (type 7) flag `0 ⇒ OK` /
  `1 ⇒ Low`; unknown type ⇒ `Unknown`.
- **FR-007**: The served health set MUST reflect reality — exactly the registered
  radios **WS90 (`1242D`)** and **`wh31` CH2 (`A0`)**; all placeholders excluded.
- **FR-008**: All stale WS90 id references (`12FAD`) MUST be corrected to the real
  `1242D` across code, fixtures, and any bound UI mapping.
- **FR-009**: The indoor and barometer cards MUST show **no** radio/battery health
  indicator and MUST NOT reference a fabricated wired `wh25` health row; the
  corrected card map MUST NOT invent a `get_sensors_info` record for them.
- **FR-010**: The outdoor, solar, and rain cards MUST bind to the real WS90 id
  (`1242D`) so all three reflect the single WS90 radio's health.
- **FR-011**: Test fixtures MUST be **re-captured from the real device** — the full
  16-entry page 1 and page 2 arrays including placeholders (the placeholders are
  exactly what exercise the registered filter). The fabricated wrapper-shape,
  stale-id, and invented-`wh25` fixtures MUST be removed.
- **FR-012**: 007's honest-degradation guarantee (US4) MUST be preserved: a
  `get_sensors_info` fetch/parse/normalize failure MUST NEVER disturb the readings
  write path.
- **FR-013**: On a fresh snapshot from the real device, `/api/v1/latest`
  `sensorHealth.available` MUST be `true` and `stale` `false`, and the poller MUST
  stop error-logging on `get_sensors_info` each cycle.

### Key Entities *(include if feature involves data)*

- **Raw sensor entry** (real shape): a flat JSON object per page-array element with
  string fields `img`, `type`, `name`, `id`, `batt`, `rssi`, `signal`, `idst`, and
  optional `version`. `id ∈ {FFFFFFFF, FFFFFFFE}` marks a placeholder/unpaired slot.
- **Health projection** (unchanged from 007): one record per registered sensor —
  `id`, `img`, `type`, `name`, `battery` (`OK|Low|Unknown|N/A`), `batteryRaw`,
  `signalBars` (0–4 or null), `rssiDbm` (or null), `registered`, `lastSeenUtc`.
- **Card→sensor binding** (corrected): outdoor/solar/rain → WS90 `1242D` (radio);
  indoor/baro → **no** health row (no radio indicator).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the live gateway, `/api/v1/latest` `sensorHealth.available` is
  `true` and `stale` `false`, containing the two registered sensors — verified after
  redeploy.
- **SC-002**: The served registered set contains **exactly** WS90 (`1242D`) and
  `wh31` CH2 (`A0`) — zero placeholder ids (`FFFFFFFF`/`FFFFFFFE`).
- **SC-003**: The poller produces **no** `get_sensors_info` parse error on any poll
  cycle against the real device (log inspection over ≥3 cycles shows zero throws).
- **SC-004**: Indoor and barometer cards render with **no** radio/battery health
  indicator; no fabricated `wh25` health row exists anywhere.
- **SC-005**: 100% test coverage (statements/branches/functions/lines) across all
  four workspaces, with fixtures sourced from the real device; Playwright e2e green.
- **SC-006**: All three amd64 images redeployed to prod and live-verified.

## Assumptions

- The real device's `get_sensors_info` shape is a **bare array per page** as
  captured 2026-07-01; a future firmware change to that shape is out of scope.
- De-identified static captures of real payloads (radio hex ids only, no PII) are an
  acceptable committed test fixture, consistent with the project's Test Data
  Separation rule (tests never read the live gateway/DB).
- The 007 API envelope, `SensorHealthEntry` schema, and battery/signal semantics are
  correct and unchanged; only the input contract, filter key, coercion edge,
  fixtures, and card map are corrected.
- Indoor/baro battery/signal is genuinely absent from `get_sensors_info` (the `wh25`
  is wired to the console); surfacing it from `get_livedata_info` is a future
  enhancement, not this fix.
- Storage remains UTC; any "last seen" display remains America/New_York (Eastern).
