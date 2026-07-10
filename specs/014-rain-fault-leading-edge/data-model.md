# Data Model: Rain-Fault Leading-Edge False Positive Fix (014)

**Branch**: `014-rain-fault-leading-edge` | **Date**: 2026-07-06

This feature adds **no new persisted storage** and **no new envelope field**. It amends the
Feature 008 detector's in-memory analysis by adding one tunable threshold and one transient
analysis window. The `RainFaultState` output shape and the `/api/v1/latest` envelope are
**unchanged** (only the human-readable reason *string content* changes — its type stays
`string | null`).

## 1. `RainFaultThresholds` — one field added

The existing `RainFaultThresholds` interface in
[apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts) gains a single named tunable
(no magic literal in control flow, per FR-014). All 008 constants are unchanged.

| Field | Type | New? | Meaning |
|-------|------|------|---------|
| `TEMP_DROP_F` | number | 008 | Min temp drop over `TREND_MIN` to fire the temp-crash proxy (°F). |
| `HUMIDITY_SURGE_PCT` | number | 008 | Min humidity rise over `TREND_MIN` to fire the humidity-surge proxy (%pts). |
| `GUST_SPIKE_MPH` | number | 008 | Min window-max gust to fire the gust-spike proxy (mph). |
| `PRESSURE_DIP_HPA` | number | 008 | Min pressure drop over `TREND_MIN` to fire the pressure-dip proxy (hPa). |
| `SOLAR_COLLAPSE_FRAC` | number | 008 | Fraction of window solar peak the solar must drop to fire the collapse proxy. |
| `SOLAR_DAY_MIN_WM2` | number | 008 | Daytime cross-check: window solar peak must reach this (W/m²). |
| `PIEZO_RATE_EPS` | number | 008 | Piezo gate: max rain rate at/below this is "near zero" (in/hr). |
| `PIEZO_EVENT_EPS` | number | 008 | Piezo gate: max event rise over `TREND_MIN` at/below this is "near zero" (in). |
| `TREND_MIN` | number | 008 | Rolling trend span for drop/rise scans; also the minimum window span (min). |
| `MIN_READINGS` | number | 008 | Minimum readings a window must contain to be assessable. |
| `MIN_PROXIES` | number | 008 | Quorum: number of the 5 proxies that must concur. |
| **`SUSTAIN_MIN`** | **number** | **✅ 014** | **Sustained gate: the storm signature (piezo gate + proxy quorum) must ALSO hold when evaluated over the sub-window ending this many minutes before `now` (minutes).** |

### `RAIN_FAULT_DEFAULTS` — one value added

| Constant | Value | Unit | Source |
|----------|------:|------|--------|
| `TEMP_DROP_F` | 6.0 | °F / 30 min | 008 |
| `HUMIDITY_SURGE_PCT` | 10.0 | %pts / 30 min | 008 |
| `GUST_SPIKE_MPH` | 8.0 | mph (window max) | 008 |
| `PRESSURE_DIP_HPA` | 0.8 | hPa / 30 min | 008 |
| `SOLAR_COLLAPSE_FRAC` | 0.5 | fraction of peak | 008 |
| `SOLAR_DAY_MIN_WM2` | 50.0 | W/m² | 008 |
| `PIEZO_RATE_EPS` | 0.01 | in/hr | 008 |
| `PIEZO_EVENT_EPS` | 0.01 | in / 30 min | 008 |
| `TREND_MIN` | 30 | minutes | 008 |
| `MIN_READINGS` | 4 | readings | 008 |
| `MIN_PROXIES` | 4 | proxies | 008 |
| **`SUSTAIN_MIN`** | **45** | **minutes** | **014 (FR-014, calibrated — see research.md)** |

## 2. EarlierSubWindow (input, transient, NEW)

The additional slice the sustained gate evaluates. It is **derived from the same window** —
no new data is fetched.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `samples` | parsed `Sample[]` | `all.filter(s => s.t ≤ now − SUSTAIN_MIN)` | subset of the already-parsed full window |
| `end` | epoch ms | `now.getTime() − SUSTAIN_MIN · 60_000` | the sub-window's upper bound (anchors its span check) |

**Assessability (graceful degradation, FR-013)**: the sub-window is assessable only when it
spans ≥ `TREND_MIN` minutes **and** contains ≥ `MIN_READINGS` rows — the same rule 008
applies to the full window. With a 90-min window it spans up to `90 − 45 = 45` min ≥ 30, so
it is normally assessable; a short/sparse window that cannot confirm persistence yields
`NOT_SUSPECT` (see the `signatureFired` → `null` rule below).

## 3. Signature evaluation (pure, internal, extracted for DRY)

The 008 readiness + gate + quorum logic is extracted from `detectRainFault` into one pure
helper so it can be applied to **both** the full window and the earlier sub-window without
duplication (Constitution SRP + DRY).

```
signatureFired(samples, end, isDay, th) → Array<[label, fired]> | null
    if samples.length < th.MIN_READINGS            → null   // not assessable (FR-013)
    if (end − samples[0].t)/60000 < th.TREND_MIN   → null   // span too short (FR-013)
    if NOT piezoNearZero(samples, th)              → null   // gate fails
    fired = [tempCrash, humiditySurge, gustSpike, pressureDip, solarCollapse]
    if count(fired) < th.MIN_PROXIES               → null   // quorum not met
    else                                           → fired  // signature holds
```

`null` uniformly means "signature does not hold here (or cannot be assessed)". The five
per-signal proxy helpers, `piezoNearZero`, and the shared `maxRollingDelta` scan are
**unchanged** from 008.

## 4. RainFaultState (output, transient) — shape UNCHANGED

The detector's return value is identical to 008; **single-sourced** in
`packages/shared/src/schema.ts` and imported by the detector.

| Field | Type | Meaning |
|-------|------|---------|
| `rainSensorSuspect` | `boolean` | `true` ⇒ signature holds at `now` **AND** at `now − SUSTAIN_MIN` |
| `rainSensorReason` | `string \| null` | human-readable summary when suspect (now mentions the signature was **sustained**, FR-012); `null` otherwise |

**Concurrence rule — 008 quorum + 014 sustained gate**:

```
rainSensorSuspect =
    signatureFired(fullWindow,   now,              isDay, th) ≠ null   // 008: holds now
    AND
    signatureFired(earlierWindow, now − SUSTAIN_MIN, isDay, th) ≠ null // 014: held 45 min ago
```

The reason string is composed from the **full-window** fired proxies (the current
signature) via the existing `buildReason`, prefixed to reflect that the signature was
sustained past onset — e.g. `Storm signature sustained with no rain measured (…)`. The type
remains `string | null`; `rainSensorReason` is `null` **iff** `rainSensorSuspect` is
`false` (008 invariant preserved).

## 5. State transitions — UNCHANGED (stateless)

`rainSensorSuspect` remains **stateless / recomputed every request** — no persistence, no
hysteresis, no latch (FR-009). It is purely a function of the current 90-min window under
the amended rule:

```
not-suspect ──(signature holds now AND held 45 min ago, rain still 0)──▶ suspect
suspect ──(either evaluation stops holding, e.g. rain registers)──▶ not-suspect
```

On a leading edge the detector naturally transitions from suppressed → raised only if the
signature *persists* past the 45-min mark with rain still zero (i.e. a genuine fault
emerges); otherwise rain registers, the gate opens, and it stays suppressed.

## 6. Persisted storage / envelope — NO CHANGE

- **No new SQLite fields**, no migration — the detector reads the same `metrics_json`
  channels 008 already uses.
- **No new envelope field** — `latestSnapshotSchema` is unchanged; both fields
  (`rainSensorSuspect`, `rainSensorReason`) already exist from 008 (SC-006).
- **No web/poller change** — the web is a presentation-only consumer of the (now more
  trustworthy) `rainSensorSuspect`.
