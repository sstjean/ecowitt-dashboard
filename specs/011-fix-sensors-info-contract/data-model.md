# Phase 1 Data Model: Fix Feature 007 `get_sensors_info` Contract

**Branch**: `011-fix-sensors-info-contract` | **Date**: 2026-07-01

> **Scope note**: The served envelope and `SensorHealthEntry` output type are **UNCHANGED**.
> This document records only what changes on the **input** side (raw payload shape, the
> `RawSensorsInfo` type, the registration/coercion rules) and the corrected card→sensor binding.
> No SQLite schema, no migration, no API contract change.

---

## 1. Raw sensor entry (INPUT — real device shape)

One flat JSON object per element of a page array. All values are **strings**.

| Field | Type | Notes |
|-------|------|-------|
| `img` | string | Sensor family icon, e.g. `wh90`, `wh31`, `wh85`. |
| `type` | string (numeric) | Sensor type code, e.g. `"48"` (WS90), `"7"` (wh31). Coerced to int; non-numeric ⇒ entry skipped (per-entry salvage). |
| `name` | string | Human label, e.g. `"Temp & Humidity CH2"`. |
| `id` | string | Radio hex id. **`FFFFFFFF` / `FFFFFFFE` = placeholder/unpaired** ⇒ excluded. |
| `batt` | string (numeric) | Battery raw: WS90 level `0–5`; wh31 flag `0`/`1`. |
| `rssi` | string | dBm as a numeric string, **or `"--"`** on unpaired slots ⇒ `null`. |
| `signal` | string | Bars `0–4` as a numeric string, **or `"--"`** ⇒ `null`. |
| `idst` | string | Present as `"1"` even on placeholders — **NOT used** for registration. |
| `version` | string (optional) | Firmware, e.g. `"160"` on the WS90. Ignored by the projection. |

**Registration rule (corrected)**: `registered ⇔ id ∉ {FFFFFFFF, FFFFFFFE} ∧ id ≠ ""`.

**Placeholder invariant**: on the captured device, placeholders carry `id:"FFFFFFFF"`,
`rssi:"--"`, `signal:"--"`, `batt:"9"`, and `idst:"1"`.

---

## 2. `RawSensorsInfo` type (CHANGED)

| | 007 (wrong) | 011 (corrected) |
|---|-------------|-----------------|
| Shape | `{ command: Array<{ sensor: unknown[] }> }` | **bare array** — `unknown[]` (a named alias `type RawSensorsInfo = unknown[]`) |
| Fetch extract | `body.command[0]!.sensor` (throws on real device) | `Array.isArray(body) ? body : []` (skip non-array) |
| Normalizer extract | walk `command[0].sensor` | consume the merged array directly |

`fetchSensorsInfo` returns `GatewayResult<RawSensorsInfo>` where the payload is the
merged+deduped **array** of raw entries. `GatewayResult` itself is unchanged.

---

## 3. Health projection (OUTPUT — UNCHANGED from 007)

`normalizeSensorHealth(raw, capturedAtUtc): SensorHealthEntry[]` still emits exactly:

| Field | Type | Rule (unchanged) |
|-------|------|------------------|
| `id` | string (min 1) | Verbatim radio id. |
| `img` | string (min 1) | Verbatim `img`. |
| `type` | int | `Math.trunc(Number(type))`. |
| `name` | string (min 1) | Verbatim `name`. |
| `battery` | `"OK"|"Low"|"Unknown"|"N/A"` | Per-type rule (see below). |
| `batteryRaw` | finite \| null | `Number(batt)` or null. |
| `signalBars` | int 0–4 \| null | `coerceBars(signal)` — `"--"` ⇒ `null`. |
| `rssiDbm` | finite \| null | `coerceFinite(rssi)` — `"--"` ⇒ `null`. |
| `registered` | boolean | Always `true` for emitted entries (placeholders are excluded upstream). |
| `lastSeenUtc` | ISO-8601 UTC | `capturedAtUtc` passed in (no clock in the pure fn). |

**Per-type battery rules (unchanged)**:
- type 48 (WS90): `raw === null ⇒ Unknown`; `raw ≤ 1 ⇒ Low`; else `OK`.
- type 7 (wh31): `raw === 1 ⇒ Low`; `raw === 0 ⇒ OK`; else `Unknown`.
- type 4 (wh25): `N/A` — retained in schema only if a covered consumer remains; otherwise
  removed with its card binding (decided at implementation to avoid dead uncovered code).
- unknown type ⇒ `Unknown`.

**Canonical projection from the real captures** (the expected served set):

| Sensor | `img` | `type` | `id` | `batt` | `battery` | `signalBars` | `rssiDbm` |
|--------|-------|--------|------|--------|-----------|--------------|-----------|
| WS90 | `wh90` | 48 | `1242D` | 5 | `OK` | 4 | −76 |
| wh31 CH2 | `wh31` | 7 | `A0` | 0 | `OK` | 4 | −94 |

All other rows (placeholders) are excluded ⇒ served `sensors[]` has exactly these two.

---

## 4. Card → sensor binding (CHANGED)

| Panel | 007 (wrong) | 011 (corrected) |
|-------|-------------|-----------------|
| outdoor | `12FAD`, radio | `1242D`, radio |
| solar | `12FAD`, radio | `1242D`, radio |
| rain | `12FAD`, radio | `1242D`, radio |
| indoor | `C7` (wh25), no radio | **removed** — no binding, no indicator |
| baro | `C7` (wh25), no radio | **removed** — no binding, no indicator |

`attachCardIndicators` iterates the map; a card absent from the map receives **no** indicator.
The `wh31 CH2` (`A0`) has no dashboard card and appears only on the Sensor Health page.

---

## 5. Fixtures (re-captured / rebuilt)

| Fixture | Change |
|---------|--------|
| `apps/poller/tests/fixtures/sensorsInfo/page1.json` | Replace with the real 16-entry **bare array** (WS90 `1242D` registered + 15 placeholders). |
| `apps/poller/tests/fixtures/sensorsInfo/page2.json` | Replace with the real 16-entry **bare array** (wh31 `A0` registered + 15 placeholders). |
| `packages/shared/tests/fixtures/sensorHealth/merged.json` | Rebuild as the merged bare array; registered projection = WS90 `1242D` + wh31 `A0`. |
| `packages/shared/tests/fixtures/sensorHealth/garbage.json` | Keep as the non-array guard fixture (drives the skip/`[]` path). |
| `apps/web/e2e/fixtures.ts` `sensorHealth` blocks | Reflect WS90 (`1242D`) + wh31 (`A0`) only; remove the `C7`/`wh25` health row. |

---

## 6. State / lifecycle

No state machine change. The freshness envelope (`available`/`stale` via
`SENSOR_HEALTH_STALE_SECONDS = 300`) is unchanged. The only behavioral shift: on the **real**
device the projection now yields two registered sensors instead of throwing, so
`available` flips `false → true` and `stale` `true → false` on a fresh snapshot.
