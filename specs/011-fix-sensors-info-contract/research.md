# Phase 0 Research: Fix Feature 007 `get_sensors_info` Contract

**Branch**: `011-fix-sensors-info-contract` | **Date**: 2026-07-01

All five defects below were verified **live** on 2026-07-01 against the real GW2000B at
`192.168.30.109`. The canonical captures are saved at `/tmp/real_sensors_page1.json` and
`/tmp/real_sensors_page2.json` (16-entry bare arrays each) and become the committed fixtures.
There were **no** open NEEDS CLARIFICATION items in the spec; this document records the
decisions that fix each defect.

---

## D1 — Canonical payload shape: a bare JSON array per page

**Decision**: Treat each `GET {baseUrl}/get_sensors_info?page=N` response body as a **bare
JSON array** of flat sensor objects. There is **no** `command`/`sensor` wrapper.

**Canonical capture (de-identified, radio hex ids only — no PII):**

```jsonc
// GET http://<gateway>/get_sensors_info?page=1   → 16-element array
[
  {"img":"wh85","type":"49","name":"Wind & Rain","id":"FFFFFFFF","batt":"9","rssi":"--","signal":"--","idst":"1"},
  {"img":"wh90","type":"48","name":"Temp & Humidity & Solar & Wind & Rain","version":"160","id":"1242D","batt":"5","rssi":"-76","signal":"4","idst":"1"},
  {"img":"wh69","type":"0","name":"…","id":"FFFFFFFF","batt":"9","rssi":"--","signal":"--","idst":"1"}
  // … 13 more placeholder rows (FFFFFFFF/FFFFFFFE, rssi/signal "--") …
]
```

```jsonc
// GET http://<gateway>/get_sensors_info?page=2   → 16-element array
[
  {"img":"wh31","type":"7","name":"Temp & Humidity CH2","id":"A0","batt":"0","rssi":"-94","signal":"4","idst":"1"},
  // … 15 placeholder rows (FFFFFFFF, rssi/signal "--") …
]
```

Every value is a JSON **string** (Ecowitt convention). Confirmed programmatically: page 1 has
16 entries, the sole registered row is `('wh90','48','1242D')`; page 2 has 16 entries, the sole
registered row is `('wh31','7','A0')`.

**Rationale**: 007's `fetchSensorsPage` does `body.command[0]!.sensor`, which throws
`Cannot read properties of undefined (reading '0')` on every poll because `body` is an array,
not `{command}`. `normalizeSensorHealth`'s `extractSensorArray` walks the same non-existent
wrapper and returns `[]`. The device shape is the source of truth; the code must match it.

**Alternatives considered**:
- *Support both shapes (wrapper OR bare array).* Rejected — YAGNI/Simplicity. The hardware
  emits exactly one shape; a dual parser adds an untested branch for a payload the device never
  produces. A future firmware re-adding the wrapper is explicitly out of scope (spec Edge Cases).
- *Validate with a strict Zod array schema up front.* Rejected for the fetch path — the poller
  must **skip** a garbage page, not reject the whole call; loose per-entry salvage (already in
  `normalizeSensorHealth`) is the right layer for validation.

---

## D2 — "Registered" is keyed on `id`, never `idst`

**Decision**: A sensor is **registered** iff its `id` is a non-empty string **not** in
`{"FFFFFFFF", "FFFFFFFE"}`. Drop the `idst === "1"` gate entirely.

**Rationale**: On the real device every placeholder/unpaired slot (e.g. the `wh85`, `wh69`,
`wh55` leak channels) carries `idst:"1"` **and** `id:"FFFFFFFF"`. Keying on `idst` admits all
16 placeholder rows per page as "registered," which is exactly the bug. The `id` sentinel
(`FFFFFFFF`/`FFFFFFFE`) is the device's real "no sensor paired here" marker. The shared schema
already exports `PLACEHOLDER_IDS = new Set(["FFFFFFFF","FFFFFFFE"])` and already excludes those
ids — the fix is to make that the **only** registration test and remove the `idst` line.

**Alternatives considered**:
- *Key on `rssi`/`signal !== "--"`.* Rejected — indirect proxy; `id` is the device's explicit,
  documented pairing marker and is unambiguous.
- *Whitelist known ids (`1242D`, `A0`).* Rejected — brittle; a newly paired sensor would be
  silently dropped. The placeholder-exclusion rule generalizes correctly.

---

## D3 — Non-numeric `rssi`/`signal` (`"--"`) coerces to `null`

**Decision**: `rssi` and `signal` of `"--"` (or any non-numeric string) MUST coerce to
`null` — never `NaN`, never `0`. The existing `coerceFinite`/`coerceBars` helpers already do
this (`Number("--")` is `NaN` → `Number.isFinite` false → `null`); the fix ensures the path is
**exercised** by a real placeholder fixture and that no upstream step turns `"--"` into `0`.

**Rationale**: A `0` would render as a dead/lost radio; `NaN` would violate the finite schema.
`null` is the honest "no reading" value the `SensorHealthEntry` schema already accepts
(`signalBars: int 0–4 | null`, `rssiDbm: finite | null`). Because registered rows never carry
`"--"` on this device, this rule is primarily a *guard* — but the re-captured placeholder-heavy
fixtures make the branch reachable and keep 100% coverage honest.

**Alternatives considered**: Treating `"--"` as `0`. Rejected — misreports a healthy-but-absent
radio as a failing one; contradicts 007's honest-degradation guarantee.

---

## D4 — Indoor/baro cards get **no** radio indicator (honest absence)

**Decision**: The corrected `sensorCardMap` binds **only** outdoor/solar/rain → the real WS90
id `1242D`. Indoor and baro are **removed from the map entirely** — they have no backing
`get_sensors_info` record, so they render **no** radio/battery indicator at all (not an
invented `N/A`, not a fabricated `wh25`/`C7` row). `attachCardIndicators` naturally skips any
card not present in the map, so absence is the honest render.

**Rationale**: 007 fabricated a wired `wh25` sensor (id `C7`, type 4 → `N/A` battery) and bound
indoor+baro to it. No `get_sensors_info` record backs that id — it was invented to give those
cards *something*. The real `wh25` is **wired to the console** and reported only in
`get_livedata_info`'s `wh25[]` block, which is out of scope here. The honest behavior for a card
with no radio sensor is to show nothing, not a made-up indicator. This also removes the type-4
`N/A` battery rule's only consumer path from the card map (the rule may stay in the schema as
dead-but-covered or be removed per the tasks step — decided during implementation to keep 100%
coverage without dead code).

**Alternatives considered**:
- *Keep an `N/A`/no-radio indicator on indoor/baro.* Rejected — an `N/A` badge still asserts
  "there is a sensor here whose battery is not applicable," which is dishonest; there is simply
  no radio. Absence is the truthful UI.
- *Surface indoor/baro battery from `get_livedata_info` `wh25[]` now.* Rejected — explicitly out
  of scope (a future enhancement, per spec Assumptions).

---

## D5 — Corrected WS90 id (`12FAD` → `1242D`) everywhere

**Decision**: Replace every stale WS90 id reference `12FAD` with the real `1242D` across code
(`sensorCardMap`), fixtures (poller `page1.json`, shared `merged.json`), and web e2e fixtures.

**Rationale**: The committed 007 fixtures used a fabricated/stale id (`12FAD`). The live device
reports `1242D`. Card-to-sensor binding by id fails silently if the id is wrong (the outdoor
card would find no matching sensor and degrade to `Unknown`), so the id must be exact.

---

## D6 — Fetch-path defensiveness: skip a garbage page, never throw

**Decision**: `fetchSensorsInfo` treats each page body as a bare array. If a page body is not an
array (empty, missing, or garbage), that page contributes **zero** sensors and is skipped;
page 1 failure still fails the whole call, page 2 remains best-effort (unchanged from 007). The
merged result is deduped by `id`. The function never throws (mirrors `fetchLivedata`).

**Rationale**: FR-002 requires tolerating an empty/garbage/non-array page. The current code
assumes `body.command[0]!.sensor` exists — a non-array body throws. Guarding with
`Array.isArray(body)` before use makes the skip explicit. The `RawSensorsInfo` type changes from
`{ command: Array<{ sensor: unknown[] }> }` to a **bare array** shape (`unknown[]`, or a named
`RawSensorsInfo = unknown[]`), and `normalizeSensorHealth` consumes that array directly.

**Alternatives considered**: Throwing on a bad page and catching upstream. Rejected — the
established pattern in this codebase is typed `GatewayResult`, never exceptions across the
gateway boundary.

---

## Cross-cutting: what does **not** change

- The `/api/v1/latest` `sensorHealth` envelope (`available`/`stale`/`capturedAtUtc`/`sensors[]`)
  and the `SensorHealthEntry` schema are **unchanged**. Only the *input* parsing, the
  registration key, the coercion guard's reachability, the fixtures, and the card map change.
- Per-type battery rules are unchanged: WS90 (type 48) level 0–5 with `≤1 ⇒ Low` else `OK`;
  wh31 (type 7) flag `0 ⇒ OK` / `1 ⇒ Low`; unknown type ⇒ `Unknown`.
- 007 US4 honest degradation: any `get_sensors_info` fetch/parse/normalize failure must never
  disturb the readings write path.
- The poller remains the sole cross-VLAN consumer; no new firewall pinhole.
