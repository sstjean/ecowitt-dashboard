# Contract: Rain-Fault Detector Amendment (`apps/api/src/rainFault.ts`)

**Branch**: `014-rain-fault-leading-edge` | **Date**: 2026-07-06

This **amends** the Feature 008 detector contract
([specs/008-rain-fault-detection/contracts/rain-fault-detector.md](../../008-rain-fault-detection/contracts/rain-fault-detector.md)).
Only the **delta** is specified here; everything not mentioned is unchanged from 008. The
module stays **pure** (no I/O, no clock, no astro) and the public function signature is
**unchanged**.

## Public surface — delta only

```ts
export interface RainFaultThresholds {
  // ... all 008 fields unchanged ...
  SUSTAIN_MIN: number;   // NEW — sustained gate span (minutes); the signature must also
                         //       hold over the sub-window ending now - SUSTAIN_MIN
}

export const RAIN_FAULT_DEFAULTS: RainFaultThresholds = {
  // ... all 008 defaults unchanged ...
  SUSTAIN_MIN: 45,       // NEW — calibrated (FR-014); see research.md
};

// UNCHANGED signature — no new parameter, no new field on the return type:
export function detectRainFault(
  readings: StoredReading[],
  now: Date,
  isDay: boolean,
  thresholds?: RainFaultThresholds, // defaults to RAIN_FAULT_DEFAULTS
): RainFaultState;                   // { rainSensorSuspect, rainSensorReason } — unchanged
```

## New extracted helper (SRP + DRY)

The 008 readiness + gate + quorum logic is factored out of `detectRainFault` so it can be
applied to two windows without duplication.

```ts
/** Evaluate the 008 storm signature over `samples` whose upper bound is `end`.
 *  Returns the fired-proxy list when the sub-window is assessable AND the piezo gate
 *  holds AND >= MIN_PROXIES proxies concur; otherwise null (not assessable / gate fails /
 *  quorum not met). Pure. */
function signatureFired(
  samples: Sample[],  // already filtered to t <= end
  end: number,        // upper-bound epoch ms (anchors the span/readiness check)
  isDay: boolean,
  th: RainFaultThresholds,
): Array<[string, boolean]> | null;
```

`detectRainFault` then composes it twice:

```
all         = parseWindow(readings).filter(t <= now)
nowFired     = signatureFired(all, now, isDay, th)                       // 008 verdict
if nowFired === null                              → NOT_SUSPECT
earlier      = all.filter(t <= now - SUSTAIN_MIN*60_000)
earlierFired = signatureFired(earlier, now - SUSTAIN_MIN*60_000, isDay, th) // 014 gate
if earlierFired === null                          → NOT_SUSPECT
                                                  → { true, <sustained reason> }
```

## Updated behaviour contract (008 rows C1–C7 stand; new/changed rows below)

| # | Given | Then |
|---|-------|------|
| C1–C7 | *(unchanged from 008 — full-window readiness, gate, quorum, night, dew)* | *(unchanged)* — but a `true` is now subject to the C8 gate below |
| **C8** | signature holds at `now` **AND** also holds over the sub-window ending `now − SUSTAIN_MIN` (both gate + quorum) | `{ true, <reason noting the signature was sustained> }` — the sustained fault (SC-002, FR-003/FR-005) |
| **C9** | signature holds at `now` but **NOT** over the `now − SUSTAIN_MIN` sub-window (leading edge — signature only recently appeared) | `{ false, null }` — newly suppressed (SC-001, FR-001/FR-006) |
| **C10** | the earlier sub-window is too short (< `TREND_MIN`) or too sparse (< `MIN_READINGS`) to assess | `{ false, null }` — graceful degradation (FR-013); persistence unconfirmed ⇒ do not raise |

**Monotonicity**: `suspect₀₁₄ = suspect₀₀₈ ∧ (earlierFired ≠ null)`. The gate can only turn
`true` → `false`. No 008 negative can become positive (guarantees FR-004, FR-007).

## Reason string (FR-012)

When suspect, the reason is composed from the **full-window** fired proxies (via the
existing `buildReason`) and MUST reflect that the signature was **sustained**, so a genuine
fault reads distinctly from a merely-approaching storm — e.g.
`Storm signature sustained with no rain measured (temperature crash, humidity surge, gust spike, solar collapse)`.
Type unchanged (`string | null`); `null` **iff** not suspect.

## Invariants (all 008 invariants preserved)

- **Ambient `rain_0x*` fields never read** (FR-008 / 008 FR-002) — WS90 piezo only.
- No mutation of input `readings`; no new fetch (the sub-window is a filter of the parsed
  window already in hand).
- **Pure / deterministic** — same input ⇒ same output; no `Date.now()`, no randomness, no
  persisted latch (FR-009). `isDay` is reused for both evaluations (research.md Decision 6).
- Local-only — no NWS / precipitation cross-check (FR-008).
- The public function signature and `RainFaultState` shape are **unchanged**; the only new
  export surface is the `SUSTAIN_MIN` field on the thresholds interface/defaults.

## Call site — UNCHANGED

[apps/api/src/routes/v1/latest.ts](../../../apps/api/src/routes/v1/latest.ts) continues to
call `detectRainFault(store.getWindow(rainSince), now, isDay)` with defaults, and
`RAIN_FAULT_WINDOW_MIN` stays `90` (research.md Decision 4). No route change.
