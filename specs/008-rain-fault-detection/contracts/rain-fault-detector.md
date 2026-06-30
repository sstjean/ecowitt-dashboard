# Contract: Rain-Fault Detector (`apps/api/src/rainFault.ts`)

**Branch**: `008-rain-fault-detection` | **Date**: 2026-06-29

Pure module. No I/O, no clock, no astro computation — everything is passed in. This makes
it trivially unit-testable with committed static-capture fixtures (Constitution: TDD, Test
Data Separation — captures are replayed, the live DB is never read at test time).

## Public surface

```ts
import type { RainFaultState } from "@ecowitt/shared"; // single-sourced in shared/src/schema.ts

export interface RainFaultThresholds {
  TEMP_DROP_F: number;
  HUMIDITY_SURGE_PCT: number;
  GUST_SPIKE_MPH: number;
  PRESSURE_DIP_HPA: number;
  SOLAR_COLLAPSE_FRAC: number;
  SOLAR_DAY_MIN_WM2: number;
  PIEZO_RATE_EPS: number;
  PIEZO_EVENT_EPS: number;
  TREND_MIN: number;       // minutes
  MIN_READINGS: number;
  MIN_PROXIES: number;     // quorum: proxies that must concur (default 4)
}

export const RAIN_FAULT_DEFAULTS: RainFaultThresholds; // tunable named constants

// RainFaultState is NOT re-declared here — it is imported from @ecowitt/shared
// (defined once in packages/shared/src/schema.ts): { rainSensorSuspect, rainSensorReason }

export function detectRainFault(
  readings: StoredReading[],   // the ≤90-min window, UTC-ordered
  now: Date,                   // window upper bound — anchors the trend-span scans
  isDay: boolean,              // from isDaytime(now, sunriseUtc, sunsetUtc), computed by caller
  thresholds?: RainFaultThresholds, // defaults to RAIN_FAULT_DEFAULTS
): RainFaultState;
```

> **Role of `now`**: it is the **window upper bound** and anchors the rolling 30-min
> trend-span scans (the most recent edge from which deltas are measured). It is a real
> input, not vestigial — keep it.

### `RAIN_FAULT_DEFAULTS` (empirically derived — see research.md)

| Constant | Value | Unit |
|----------|------:|------|
| `TEMP_DROP_F` | 6.0 | °F drop / 30 min |
| `HUMIDITY_SURGE_PCT` | 10.0 | %pts rise / 30 min |
| `GUST_SPIKE_MPH` | 8.0 | mph (window max) |
| `PRESSURE_DIP_HPA` | 0.8 | hPa drop / 30 min |
| `SOLAR_COLLAPSE_FRAC` | 0.5 | fraction of window solar peak |
| `SOLAR_DAY_MIN_WM2` | 50.0 | W/m² (daytime cross-check) |
| `PIEZO_RATE_EPS` | 0.01 | in/hr |
| `PIEZO_EVENT_EPS` | 0.01 | in / 30 min |
| `TREND_MIN` | 30 | minutes |
| `MIN_READINGS` | 4 | readings |
| `MIN_PROXIES` | 4 | proxies (quorum) |

## Behaviour contract

| # | Given | Then |
|---|-------|------|
| C1 | window spans < `TREND_MIN` min OR < `MIN_READINGS` rows | `{ false, null }` (graceful degradation, FR-013) |
| C2 | piezo NOT near-zero (gauge measured rain) | `{ false, null }` — gate fails, never flag a working gauge (SC-003) |
| C3 | piezo near-zero but fewer than `MIN_PROXIES` proxies fire | `{ false, null }` (quorum not met) |
| C4 | piezo near-zero AND ≥ `MIN_PROXIES` proxies fire | `{ true, <reason string> }` (SC-001) |
| C5 | night (`isDay=false`): solar proxy cannot fire | quorum must be reached from the 4 dynamics proxies {temp, humidity, gust, pressure} |
| C6 | calm overnight dew (no dynamics, piezo 0) | `{ false, null }` — quorum not met regardless of saturation (SC-002, SC-004) |
| C7 | real 06-28 dew window (piezo 0.19) | `{ false, null }` — gate excludes it (SC-002) |

## Internal helpers (SRP, all pure)

Each returns `boolean` over the parsed window; the shared "max rolling delta over
`TREND_MIN`" scan is a single extracted helper (DRY — not duplicated per signal).

- `tempCrash(window, t)` · `humiditySurge(window, t)` · `gustSpike(window, t)`
- `pressureDip(window, t)` · `solarCollapse(window, isDay, t)` · `piezoNearZero(window, t)`
- `maxDropOverSpan(series, spanMin)` / `maxRiseOverSpan(series, spanMin)` — shared delta scan
- `buildReason(fired)` — composes `rainSensorReason`

## Invariants

- **Ambient `rain_0x*` fields are never read** (FR-002) — only WS90 piezo channels.
- No mutation of input `readings`.
- Deterministic: same input ⇒ same output (no `Date.now()`, no randomness).
- `rainSensorReason` is `null` **iff** `rainSensorSuspect` is `false`.
