# Data Model: Rain-Gauge "Not Measuring" Fault Detection (008)

**Branch**: `008-rain-fault-detection` | **Date**: 2026-06-29

This feature adds **no new persisted storage**. It derives a transient fault state from
the existing rolling reading window and surfaces it on the existing `/api/v1/latest`
envelope. The "entities" below are in-memory analysis structures plus the two new envelope
fields.

## Entities

### 1. DetectionWindow (input, transient)

The slice of stored readings the detector reasons over.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `readings` | `StoredReading[]` | `store.getWindow(now − 90 min, now)` | UTC-ordered; `metrics_json` parsed |
| `now` | `Date` | request time | window upper bound |
| `isDay` | `boolean` | `isDaytime(now, sunriseUtc, sunsetUtc)` (caller) | gates the solar proxy (OQ-3) |

**Validation / graceful degradation (FR-013, OQ-2)**:
- Window must span ≥ `TREND_MIN` (30) minutes **and** contain ≥ `MIN_READINGS` (4) rows.
- Otherwise the detector returns `{ rainSensorSuspect: false, rainSensorReason: null }`
  (insufficient data ⇒ not suspect).

Each `StoredReading.metrics_json` contributes (per OQ-1; **Ambient `rain_0x*` ignored**, FR-002):

| Metric | Used for |
|--------|----------|
| outdoor temperature (°F) | `temp_crash` (max 30-min drop) |
| outdoor humidity (%) | `humidity_surge` (max 30-min rise) |
| wind gust (mph) | `gust_spike` (window max) |
| barometric pressure (hPa) | `pressure_dip` (max 30-min drop, proxy) |
| solar radiation (W/m²) | `solar_collapse` (fractional drop from window peak; daytime) |
| WS90 piezo rain rate (in/hr) | `piezo_near_zero` gate |
| WS90 piezo event accumulation (in) | `piezo_near_zero` gate |

### 2. Signal evaluators (pure, internal)

Each is a pure helper over `DetectionWindow` returning a `boolean` (SRP — one signal each).
Thresholds come from `RAIN_FAULT_DEFAULTS` (no magic numbers).

| Signal | Helper | Fires when | Role |
|--------|--------|-----------|------|
| Temperature crash | `tempCrash` | max 30-min drop ≥ `TEMP_DROP_F` (6.0) | proxy |
| Humidity surge | `humiditySurge` | max 30-min rise ≥ `HUMIDITY_SURGE_PCT` (10.0) | proxy |
| Gust spike | `gustSpike` | window-max gust ≥ `GUST_SPIKE_MPH` (8.0) | proxy |
| Pressure dip | `pressureDip` | max 30-min drop ≥ `PRESSURE_DIP_HPA` (0.8) | proxy |
| Solar collapse | `solarCollapse` | `isDay` AND peak ≥ `SOLAR_DAY_MIN_WM2` (50) AND drop ≥ `SOLAR_COLLAPSE_FRAC` (0.5) of peak | proxy (day only) |
| Piezo near-zero | `piezoNearZero` | max rate ≤ `PIEZO_RATE_EPS` (0.01) AND max 30-min event rise ≤ `PIEZO_EVENT_EPS` (0.01) | **gate** |

The 5 proxies are weighed symmetrically; a fault requires the gate to hold AND at least
`MIN_PROXIES` (4) proxies to fire (the quorum — see RainFaultState below).

### 3. RainFaultState (output, transient)

The detector's return value, merged onto the envelope. **Single-sourced**: this type is
defined ONCE in `packages/shared/src/schema.ts` (`export type RainFaultState`) and
**imported** by the detector (`apps/api/src/rainFault.ts` does
`import type { RainFaultState } from "@ecowitt/shared"`) — no duplicate declaration.

| Field | Type | Meaning |
|-------|------|---------|
| `rainSensorSuspect` | `boolean` | `true` ⇒ piezo gate holds AND ≥ `MIN_PROXIES` proxies concur |
| `rainSensorReason` | `string \| null` | human-readable summary of fired proxies when suspect; `null` otherwise |

**Concurrence rule — count-based quorum (OQ-4)**:

```
rainSensorSuspect =
    piezoNearZero                              // GATE (mandatory)
    AND (count of fired proxies ≥ MIN_PROXIES) // quorum, MIN_PROXIES = 4

// proxies (symmetric): tempCrash, humiditySurge, gustSpike, pressureDip,
//                       solarCollapse (isDay-gated)
// at night solarCollapse can't fire → reaching 4 means all 4 dynamics proxies concur
```

## Envelope additions (`latestSnapshotSchema`, `@ecowitt/shared`)

The shared `latestSnapshotSchema` (a `z.strictObject`) gains two fields. Both branches of
`buildLatestSnapshot` (the `ok` data branch and the `no-data` branch) must populate them.

| Field | Zod | Default in `no-data` branch |
|-------|-----|-----------------------------|
| `rainSensorSuspect` | `z.boolean()` | `false` |
| `rainSensorReason` | `z.union([z.string(), z.null()])` | `null` |

Exported type (single-sourced in `@ecowitt/shared`, imported by the detector):
`RainFaultState = { rainSensorSuspect: boolean; rainSensorReason: string | null }`.

## State transitions

`rainSensorSuspect` is **stateless / recomputed every request** — there is no persistence
or hysteresis. It is purely a function of the current 90-min window:

```
not-suspect ──(window matches concurrence rule)──▶ suspect
suspect ──(window no longer matches)──▶ not-suspect
```

A storm ending (or the gauge resuming) naturally clears the flag on the next poll because
the dynamics deltas fall back below threshold. No timers, no decay — YAGNI.

## Relationship to existing model

```
StoredReading[] (existing) ──getWindow──▶ DetectionWindow
                                              │
                          isDay (caller, isDaytime) ┘
                                              ▼
                                    detectRainFault()
                                              ▼
                                     RainFaultState
                                              ▼
                           buildLatestSnapshot ── merges 2 fields ──▶ LatestSnapshot
                                              ▼
                              apps/web renderRainfall (indicator)
```
