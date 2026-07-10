# Phase 0 Research: Rain-Fault Leading-Edge False Positive Fix (014)

**Branch**: `014-rain-fault-leading-edge` | **Date**: 2026-07-06

All decisions below are pinned in the spec (FR-014, FR-015, Resolved Decisions) and in
GitHub Issues [#60](https://github.com/sstjean/ecowitt-dashboard/issues/60)/[#61](https://github.com/sstjean/ecowitt-dashboard/issues/61)/[#62](https://github.com/sstjean/ecowitt-dashboard/issues/62)
(the source of truth). This file records the evidence and rationale.

## Provenance of the calibration data

A read-only copy of the production store was captured **off-host** to
`/tmp/ecowitt-014capture.sqlite` (28,758 rows through `2026-07-06T21:27Z`). It was read
**once** to derive and validate the threshold — it is **never** read at test time
(Constitution: Test Data Separation). Analysis scripts:

- [scripts/analyze-014-leading-edge.py](../../scripts/analyze-014-leading-edge.py) — tabulates the raw 07-06 window (~5-min cadence).
- `/tmp/verify-014-subwindow.py` (throwaway) — evaluates the 008 signature over the full 90-min window AND the `now − 45 min` sub-window for both fixtures (results below).

> **Durable vs transient artifacts**: the committed regression fixtures
> (`apps/api/tests/fixtures/rainFault/leading-edge-07-06.json` and the existing
> `storm-06-28.json`) are the **durable** record and are what CI replays. The
> `/tmp/ecowitt-014capture.sqlite` capture and the throwaway `verify-014-subwindow.py`
> are **not committed** and may be lost if `/tmp` is cleared; the sub-window self-verify
> logic is therefore folded into [scripts/gen-rain-fault-fixtures.py](../../scripts/gen-rain-fault-fixtures.py)
> (which is committed) so fixture provenance stays reproducible from any fresh capture.

The committed regression fixtures are trimmed, deterministic captures generated from this
DB by the extended [scripts/gen-rain-fault-fixtures.py](../../scripts/gen-rain-fault-fixtures.py),
which self-verifies each window's expected verdict before writing.

## The defect (root cause)

Feature 008's detector (`apps/api/src/rainFault.ts`) raises a fault when, over a 90-min
rolling window, the **piezo gate** holds (`rainRateInHr` max ≤ `PIEZO_RATE_EPS` 0.01 AND
`rainEventIn` rise ≤ `PIEZO_EVENT_EPS` 0.01) **AND** a **quorum** of ≥ `MIN_PROXIES` (4)
of 5 storm proxies concur (temp crash ≥ 6 °F, humidity surge ≥ 10 %pts, gust spike
≥ 8 mph, pressure dip ≥ 0.8 hPa, daytime solar collapse ≥ 50 % of window peak).

On a storm's **leading edge** the proxies all fire in the 30–90 min *before* rain arrives.
During that window the gauge *correctly* reads zero — it has not rained yet. "Storm
signature + zero rain" on the leading edge is byte-for-byte the pattern 008 hunts for, so
it trips prematurely on essentially every approaching storm (observed 2026-07-06).

## Decision 1 — Fix strategy: pure **sustained-duration** gate

**Decision**: Require the storm signature (008 gate + quorum) to have **already held
`SUSTAIN_MIN` minutes before `now`**, in addition to holding over the full window. Raise a
fault only when **both** the full-window evaluation and the `now − SUSTAIN_MIN` sub-window
evaluation pass.

**Rationale**:
- A **real gauge fault** during a downpour shows the storm signature + zero rain sustained
  through the whole storm core — it was already present 45 min ago.
- The **leading-edge false positive** shows a signature that has only *just* appeared;
  45 min ago it was not yet there (temp had not crashed, gust had not spiked). The earlier
  sub-window fails the quorum → suppressed.

**Alternatives considered**:
- *Pressure-bottomed / recovery criterion* — **rejected** (see Decision 3).
- *Rolling latch / hysteresis (state across requests)* — **rejected**: violates the 008
  purity constraint (FR-009); the sustained sub-window achieves the same "has it persisted"
  question statelessly from the window already in hand.
- *Widening the quorum (require 5/5)* — **rejected**: the leading edge frequently reaches
  5/5 (07-06 hit 4/4 by 17:12 EDT); raising the count would also lose true positives at
  night (solar can't fire) — it does not separate the two cases.

## Decision 2 — `SUSTAIN_MIN = 45 minutes`

**Decision**: `SUSTAIN_MIN = 45`, added as a named tunable in `RAIN_FAULT_DEFAULTS` (no
magic literal in control flow, per FR-014).

**Evidence** (from `/tmp/verify-014-subwindow.py`, evaluating the real captures):

| Scenario | `now` | Full window @ `now` | Sub-window @ `now − 45` | 008 verdict | 014 verdict |
|----------|-------|---------------------|-------------------------|-------------|-------------|
| **07-06 leading edge** (rain onset 17:15 EDT / 21:15Z) | 17:12 EDT (21:12Z) | gate holds, **4** proxies (temp, hum, gust, solar) → HELD | gate holds, **3** proxies (hum, gust, solar) → **NOT held** (temp had not crashed yet) | **TRUE** (false positive) | **FALSE** ✅ suppressed |
| **06-28 dead gauge** (rain flatlined 0.0 for hours) | 19:25 EDT (23:25Z, = `storm-06-28.json` last reading) | gate holds, **5** proxies → HELD | gate holds (sub-window ends 22:40Z), **4** proxies (temp, hum, gust, solar) → **HELD** | **TRUE** | **TRUE** ✅ still flagged |

The discriminator is concrete: 45 min before the 07-06 onset the temperature crash had not
yet developed, dropping the sub-window to 3 proxies (below the quorum of 4); 45 min into
the 06-28 downpour the full storm signature was already established (4 proxies at the
sub-window). Raw timelines:

- **07-06 leading edge** — signature ramped **16:50–17:15 EDT** (temp 90→79 °F, humidity
  55→78 %, gust 12.75 mph, solar 900→4 W/m²); rain onset **17:15 EDT** (rate
  0.19→0.94→1.68 in/hr — **the gauge worked**). Signature + zero-rain lasted only
  **~25–40 min** before the gate opened. `25–40 < 45` → correctly suppressed.
- **06-28 dead gauge** — storm core **~18:00–18:30 EDT** (temp 86→74 °F, gust 16.11 mph,
  humidity →86 %, solar collapsed); rain flatlined **0.0 for hours** (18:15 → 20:25+ EDT).
  Signature + zero-rain sustained **hours ≫ 45 min** → correctly flagged.

`SUSTAIN_MIN = 45` sits cleanly between the two populations (upper bound of the leading-edge
lead ~40 min; true-positive persistence measured in hours).

**Accepted tradeoff** (spec "Accepted tradeoff"): a genuinely dead gauge is flagged only
after the signature has persisted ~45 min — detection is deliberately delayed versus 008's
over-eager firing. This is consistent with 008's purpose: catching a **sustained**
measurement fault, not a momentary one.

## Decision 3 — **No** pressure-bottomed / recovery criterion

**Decision**: Pure sustained-duration only; **no** pressure-recovery gate (FR-015).

**Rationale**: The 07-06 capture shows barometric pressure **rising** at rain onset — a
gust-front pressure jump (≈ 1013 → 1015.6 hPa) — *not* falling. "Pressure still actively
falling" is therefore **not** a reliable leading-edge signal, and "pressure has bottomed /
recovered" would misfire. Pure duration cleanly separates both fixtures (Decision 2)
without any pressure heuristic. The 008 pressure-dip proxy remains one of the 5 quorum
proxies, unchanged.

## Decision 4 — Rolling window stays 90 minutes

**Decision**: `RAIN_FAULT_WINDOW_MIN` stays `90` in
[apps/api/src/routes/v1/latest.ts](../../apps/api/src/routes/v1/latest.ts) — **no change**.

**Rationale**: The earlier sub-window ends at `now − SUSTAIN_MIN` = `now − 45 min`. With a
90-min window it spans from the window start to `now − 45`, i.e. up to `90 − 45 = 45`
minutes — which is ≥ `TREND_MIN` (30), the minimum span needed to assess the 30-min-delta
proxies. The sub-window is therefore assessable without widening the window. Extending the
window was considered and **rejected** (YAGNI): it is unnecessary and would pull in older,
less-relevant readings.

## Decision 5 — Graceful degradation of the sub-window (FR-013)

**Decision**: If the earlier sub-window is too short (< `TREND_MIN`) or too sparse
(< `MIN_READINGS`) to assess, the detector returns `NOT_SUSPECT` (no exception, no spurious
fault) — the same degradation contract 008 applies to the full window.

**Rationale**: Consistent with 008 FR-013 and the spec edge case "Window too short / sparse
to judge persistence." Because the sustained gate is an *additional* requirement, an
un-assessable earlier sub-window means "cannot confirm persistence" ⇒ do **not** raise.
The extracted `signatureFired` helper returns `null` for both "not assessable" and "not
held", and `detectRainFault` treats `null` from either evaluation as `NOT_SUSPECT`.

## Decision 6 — `isDay` reused for both evaluations

**Decision**: The caller's single `isDay` (computed at `now`) is reused for the earlier
sub-window's solar proxy; astro is **not** recomputed per sub-window.

**Rationale**: Simplicity/YAGNI. A 45-min earlier bound almost never crosses the day/night
boundary meaningfully, and the solar proxy is independently gated by
`peak ≥ SOLAR_DAY_MIN_WM2`. Recomputing SunCalc for the sub-window adds a dependency on the
detector doing astro (it currently takes `isDay` as a pure input, per the 008 detector
contract) for no measurable benefit. Keeps the detector pure and its signature unchanged.

## Monotonicity guarantee (no 008 regression)

The sustained gate is a **logical AND** layered on top of the existing verdict:
`suspect₀₁₄ = suspect₀₀₈ ∧ signatureHeld(sub-window)`. It can only turn a `true` into
`false`, never a `false` into `true`. Therefore:

- **Every existing 008 negative fixture stays negative** — `dew-06-28-gate.json` (gate
  path), `dew-06-28-calm.json` (quorum path), `rain-06-27.json` (measured rain, gate
  fails) are all already `false` and cannot flip (FR-007, SC-003, SC-004).
- **The single 008 positive *fixture* stays positive** — `storm-06-28.json` stays `true`
  because its signature is sustained for hours (verified: sub-window @ `now − 45` = 4
  proxies, quorum met) (FR-005, SC-002).
- **The 008 positive *builder* tests must be re-anchored** — this is the one place
  monotonicity does **not** hold automatically. `stormWindow`, `nightStormWindow`,
  `threeProxyWindow` and their boundary tests use short synthetic windows
  (`spanMin = TREND_MIN = 30`), so the `now − SUSTAIN_MIN` sub-window is empty and
  un-assessable → they would flip to `false`. The builders are redesigned to emit
  *sustained* windows (each configured drop/rise expressed as a per-`TREND_MIN` rate over a
  span ≥ `SUSTAIN_MIN + TREND_MIN`) so the positives keep firing while the boundary/negative
  semantics are preserved. See tasks T018.

## Scope confirmation

The change is confined to the **API detector layer**:

- **Changed**: `apps/api/src/rainFault.ts` (+ `SUSTAIN_MIN`, extracted helper, sustained
  gate), its test `apps/api/tests/rainFault.test.ts`, one new fixture
  `apps/api/tests/fixtures/rainFault/leading-edge-07-06.json`, and the fixture generator
  `scripts/gen-rain-fault-fixtures.py`.
- **Unchanged (confirmed)**: `packages/shared` (`RainFaultState` shape identical),
  `apps/api/src/routes/v1/latest.ts` (still calls `detectRainFault(window, now, isDay)`
  with defaults; `RAIN_FAULT_WINDOW_MIN` stays 90), `apps/web` (presentation-only), and
  `apps/poller`. The `/api/v1/latest` envelope is byte-for-byte unchanged (SC-006).
