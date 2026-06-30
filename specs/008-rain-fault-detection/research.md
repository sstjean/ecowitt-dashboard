# Phase 0 Research: Rain-Gauge "Not Measuring" Fault Detection (008)

**Branch**: `008-rain-fault-detection` | **Date**: 2026-06-29

This document resolves the four Open Questions (OQ-1..OQ-4) from [spec.md](./spec.md).
**Every threshold below is empirically derived** from the production SQLite store, not
invented. The chosen values are **tunable defaults** that will ship as named constants
(`RAIN_FAULT_DEFAULTS`) in `apps/api/src/rainFault.ts`.

## Method & Provenance

- **Dataset**: production `readings` table copied read-only off the LAN host via
  `docker cp` (no `sqlite3` available in the API container or on the host; analysis used
  `python3` stdlib `sqlite3`). **8,057 readings**, 2026-06-26 00:00Z → 2026-06-29 ~14:00Z,
  ~30 s poll cadence (~180 readings / 90 min).
- **Analysis scripts** (retained as research provenance):
  [scripts/analyze-rain-fault.py](../../scripts/analyze-rain-fault.py),
  [scripts/analyze-rain-fault-2.py](../../scripts/analyze-rain-fault-2.py),
  [scripts/analyze-rain-fault-3.py](../../scripts/analyze-rain-fault-3.py),
  [scripts/analyze-rain-fault-quorum.py](../../scripts/analyze-rain-fault-quorum.py)
  (the quorum sweep that fixed `MIN_PROXIES`, run 2026-06-29).
- **Data hygiene**: the extracted DB and ad-hoc scripts were removed from the production
  host after analysis. CI/test fixtures are **committed STATIC CAPTURES** — trimmed,
  de-identified extracts of the ACTUAL stored `metrics_json` rows for each window (a
  uniform timestamp shift is allowed), saved as deterministic JSON. This app stores no
  PII, so committing a static capture of real values is acceptable; the Constitution
  "Test Data Separation / never live data" rule means tests **NEVER read the live
  production DB at test time** (runs stay deterministic) — it does not forbid a committed
  static capture of real readings.
- **Three labelled windows** anchor the tuning, plus a **full-dataset sweep** to confirm
  no nightly false positives:

| Label | Window (UTC) | Ground truth |
|-------|--------------|--------------|
| **STORM** | 06-28 20:30 → 23:30 | Real storm, gauge read `0.00` throughout → **should flag** |
| **DEW** | 06-28 01:00 → 09:00 | Calm overnight saturation/dew → **must NOT flag** (FR-006, SC-004) |
| **RAIN** | 06-27 09:59 → 12:08 | Light drizzle the gauge **did** measure (0.02 in/hr) → **must NOT flag** (SC-003) |

> **Analysis window vs signature window** (stated once): the **analysis window** is the
> wide span loaded to characterize each event; the **signature window** is the narrower
> span where the storm signature actually lands. For STORM the analysis window is
> 06-28 20:30–23:30 (a wide 3 h span) while the signature window is ≈21:30–22:30. For
> RAIN the loader characterized over 06-27 09:59–12:08 while the measured-drizzle
> signature is ≈10:58–11:07. Both roles are intentional — the wide window supplies the
> pre-event baseline for the deltas; the narrow window is where the proxies fire.

All signals are evaluated over a **rolling 30-minute trend span** inside the 90-minute
detection window unless noted (gust uses the window max).

---

## OQ-1 — Per-signal thresholds

**Decision**: Pin the following tunable defaults (`RAIN_FAULT_DEFAULTS`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `TEMP_DROP_F` | `6.0` | °F temperature drop over the 30-min trend span (proxy) |
| `HUMIDITY_SURGE_PCT` | `10.0` | percentage-points RH rise over the 30-min span (proxy) |
| `GUST_SPIKE_MPH` | `8.0` | window-max wind gust (proxy) |
| `PRESSURE_DIP_HPA` | `0.8` | hPa pressure drop over the 30-min span (proxy) |
| `SOLAR_COLLAPSE_FRAC` | `0.5` | fractional drop from the window solar peak over 30 min (proxy, daytime) |
| `SOLAR_DAY_MIN_WM2` | `50.0` | solar peak ≥ this ⇒ daytime cross-check for the solar proxy |
| `PIEZO_RATE_EPS` | `0.01` | in/hr — piezo rain rate "near zero" (gate) |
| `PIEZO_EVENT_EPS` | `0.01` | in — piezo event-accumulation rise over 30 min "near zero" (gate) |
| `TREND_MIN` | `30` | rolling trend span (minutes) for delta-based signals |
| `MIN_READINGS` | `4` | minimum window rows to evaluate (else graceful no-fault) |
| `MIN_PROXIES` | `4` | minimum proxies that must concur for a fault (quorum) |

**Observed per-window values** (the justification):

| Signal | STORM (flag) | DEW (no) | RAIN (no) | Threshold | Separates? |
|--------|-------------:|---------:|----------:|----------:|:----------:|
| Temp drop (°F / 30 min) | **13.5** | 1.5 | 0.7 | ≥ 6.0 | ✅ storm ≫ dew/rain |
| Humidity surge (%pts / 30 min) | **21** | 4 | 1 | ≥ 10.0 | ✅ |
| Gust max (mph) | **17.2** | 3.1 | 2.9 | ≥ 8.0 | ✅ |
| Pressure dip (hPa / 30 min) | **1.35** | 1.02¹ | ~0 | ≥ 0.8 | ⚠ proxy (see note) |
| Solar collapse (frac of peak) | **0.78** (712→…) | 0 (night) | — | ≥ 0.5 | day-only proxy |
| Piezo rate max (in/hr) | **0.0** | 0.19 | **0.02** | ≤ 0.01 | gate (storm passes, dew/rain fail) |
| Piezo event rise (in / 30 min) | **0.0** | 0.01 | — | ≤ 0.01 | gate |

¹ DEW's 1.02 hPa is an **8-hour drift**, not a 30-min dip — see OQ-2 for why we switched
to a rolling 30-min span. Over any rolling 30 min, DEW's pressure change stays below 0.8.

**Rationale**: Each threshold sits in the gap between the storm value and the
dew/rain value with comfortable margin. The dynamics proxies (temp/humidity/gust) show
a 3–9× separation between storm and the negatives — the cleanest discriminators. The
piezo channel is the **gate**: the STORM window read literally `0.00` while RAIN
genuinely measured `0.02 in/hr`, so a near-zero piezo cleanly separates "gauge silent
during weather" from "gauge working." The 5 proxies are weighed symmetrically; the
quorum (OQ-4) decides how many must concur.

**Alternatives considered**:
- *Saturation thresholds (absolute RH ≥ 99 %)*: rejected — dew saturates too, so absolute
  humidity cannot discriminate. Dynamics (the **rise**) is the discriminator.
- *Whole-window pressure dip as a primary signal*: rejected — DEW's slow 8 h barometric
  drift (2.71 hPa) actually exceeded STORM's whole-window dip (2.37 hPa), so a whole-window
  pressure rule false-positives on dew. Kept as a 30-min rolling proxy instead.

---

## OQ-2 — Window length & aggregation

**Decision**:
- **Detection window = 90 minutes** rolling (fetch via `store.getWindow(now − 90 min, now)`).
- **Trend span = 30 minutes** (`TREND_MIN`) for delta signals: temp drop, humidity surge,
  pressure dip, solar collapse are the **max adverse delta** found within any 30-min
  sub-span of the window.
- **Gust** = window **max** (a single downburst gust is the signal; no smoothing).
- **Piezo near-zero** = window-max rain **rate** ≤ `PIEZO_RATE_EPS` **and** max rolling
  30-min **event-accumulation** rise ≤ `PIEZO_EVENT_EPS`.
- **Graceful degradation** (FR-013): require the window to span ≥ `TREND_MIN` minutes and
  contain ≥ `MIN_READINGS` rows (`MIN_READINGS = 4`); otherwise return
  `{ rainSensorSuspect: false, rainSensorReason: null }` (insufficient data ⇒ not suspect).

**Observed support**: At ~30 s cadence a 90-min window holds ~180 readings — far more than
the ~4-reading floor — so the degradation guard only trips on genuine data gaps. The storm
signature (temp crash + gust + humidity surge) fully develops inside 20–30 min in the STORM
window, so a 30-min trend span captures the downburst without diluting it across the
quieter pre/post-storm minutes that a full-90-min delta would average away.

**Rationale**: 90 min is long enough to retain the pre-storm baseline for the delta but
short enough to stay "current" for a wall kiosk. The 30-min trend span matches the
physical timescale of a downburst cold-pool passage observed in the data.

**Alternatives considered**:
- *60-min window with 60-min deltas*: rejected — too coarse; dew's slow drift starts to
  look like a dip, and the storm's sharp 30-min crash gets averaged down.
- *Per-reading instantaneous deltas*: rejected — noisy; a single jittery sample would
  trip signals. Rolling max-delta over a span is robust.

---

## OQ-3 — Day/night solar gating

**Decision**: The **solar-collapse** proxy fires **daytime only**. Daylight is
determined by `isDaytime(now, sunriseUtc, sunsetUtc)` (existing `apps/api/src/nws.ts`
helper, fed by the astro block) — **computed by the caller** (`buildLatestSnapshot`) and
passed into the detector as an `isDay: boolean`, keeping the detector dependency-light.
A solar **peak ≥ `SOLAR_DAY_MIN_WM2` (50 W/m²)** is required as a secondary cross-check so
twilight noise can't qualify. At night, the solar proxy can't fire so the proxy pool
reduces to the 4 dynamics proxies `{ temp_crash, humidity_surge, gust_spike,
pressure_dip }` — reaching the quorum of 4 then means **all four concur**.

**Observed support**: STORM (daytime) solar fell 712 → ~157 W/m² (0.78 collapse) — a
textbook storm-cloud shadow. DEW (overnight) solar was 0 throughout, so the solar
proxy is structurally unavailable and cannot contribute to a false positive. This
is exactly why SC-004 (zero nightly false positives) holds: at night the proxy pool is
only the 4 dynamics proxies, and dew fires none of them — nowhere near the quorum of 4.

**Rationale**: Solar collapse is a strong daytime proxy but meaningless at night;
gating it by daylight (and a peak floor) prevents both missed-daytime-confirmation and
spurious-nighttime contribution to the quorum.

**Alternatives considered**:
- *Make the detector compute daylight itself from `now` + lat/long*: rejected — duplicates
  the astro computation the caller already has; passing `isDay` keeps the detector pure and
  trivially testable.

---

## OQ-4 — Concurrence rule

**Decision** — a **count-based quorum** over 5 symmetric proxies (no mandatory/corroborator
roles; piezo is the gate):

```
GATE (mandatory):   piezoNearZero
                    (max rate ≤ PIEZO_RATE_EPS AND max 30-min event rise ≤ PIEZO_EVENT_EPS)
                    else → { rainSensorSuspect: false, rainSensorReason: null }

PROXIES (5, symmetric):  tempCrash, humiditySurge, gustSpike, pressureDip,
                         solarCollapse  (solarCollapse is isDay-gated:
                         isDay AND solar peak ≥ SOLAR_DAY_MIN_WM2 AND drop ≥ SOLAR_COLLAPSE_FRAC)

FAULT:  rainSensorSuspect = piezoNearZero AND (count of fired proxies ≥ MIN_PROXIES)
        MIN_PROXIES default = 4
```

Each WS90 channel is a **proxy** for "a rainstorm is occurring": because the rain gauge
itself is the suspect, we triangulate from the other channels. At least `MIN_PROXIES` (4)
proxies must concur; the more that fire, the higher the confidence the gauge is missing
real rain. At **night** the solar proxy cannot fire, so the pool is the 4 dynamics proxies
`{temp, humidity, gust, pressure}` and reaching 4 means all four concur.

`rainSensorReason` is a human-readable summary of the proxies that fired, e.g.
`"storm signature: temp −13.5°F, humidity +21%, gust 17 mph, pressure −1.35 hPa, solar −78% — gauge at 0.00"`.

**Validation across all labelled windows** (under the quorum rule):

| Window | piezo gate | proxies fired | **Result** | Expected |
|--------|:----------:|:-------------:|:----------:|:--------:|
| STORM 06-28 | holds (0.00) | 5 (temp, humidity, gust, pressure, solar) | **TRUE** | TRUE ✅ |
| DEW 06-28 | ✗ gate excludes (piezo 0.19) | (1 at most anyway) | **FALSE** | FALSE ✅ |
| RAIN 06-27 | ✗ gate excludes (piezo 0.02) | 0 | **FALSE** | FALSE ✅ |

**Empirical evidence** — full **8,057-row** sweep, **136 rolling 90-min windows**, run
2026-06-29 via [scripts/analyze-rain-fault-quorum.py](../../scripts/analyze-rain-fault-quorum.py):

- **`MIN_PROXIES = 4` → exactly 6 windows flag**: **3** clustered on the 06-28 target storm
  **AND 3** on an **independent 06-26 16:36–19:06Z dead-gauge storm** (temp −12.8 °F,
  humidity +28 %, gust 19.9 mph, solar −84 %, rain `0.00`) that the detector was **NOT**
  tuned against → proves generalization. **ZERO** nightly/dew false positives (satisfies
  SC-004).
- **`MIN_PROXIES = 3` was REJECTED**: it produced **18** flags — **12 of them spurious**
  dry, breezy, partly-cloudy afternoons that trip `{gust + pressure + solar}` **without**
  any temp-crash or humidity-surge (e.g. 06-26 19:06–20:36 gust 17 / pressure dip / solar
  dip but temp drop only 2.2 °F, humidity +5 %; 06-27 18:06–20:36 three windows of the same
  breezy-cloudy signature). A real downburst always brings the temp-crash **and**
  humidity-surge those afternoons lack, so the **4th concurring proxy is the discriminator**.
- **Labelled windows under the quorum rule**: STORM 06-28 (5 proxies fire) → **TRUE**;
  DEW 06-28 (piezo 0.19 fails the gate; only 1 proxy would fire anyway) → **FALSE**;
  RAIN 06-27 (piezo 0.02 fails the gate; 0 proxies) → **FALSE**.

**Rationale**: A coherent cold-pool downburst stamps several channels at once — a sharp
temperature crash, a humidity surge, a gust front, a pressure dip, and (in daylight) a
solar collapse. Calm dew moves at most one. Requiring **4 of 5** proxies makes the
temp-crash + humidity-surge effectively required in practice (a breezy-cloudy afternoon
reaches only 3 from `{gust, pressure, solar}`), which is exactly what the sweep confirmed.
The piezo gate ensures we only ever flag when the gauge is actually silent.

**Alternatives considered**:
- *`MIN_PROXIES = 3` (any 3 of 5)*: rejected — 18 flags, 12 spurious breezy-cloudy
  afternoons (gust + pressure + solar without temp/humidity). The 4th proxy is the
  discriminator that removes them.
- *Mandatory-trio + ≥1-corroborator rule (the earlier design)*: superseded — the
  count-based quorum is simpler, treats all proxies symmetrically, and the 8,057-row sweep
  showed `MIN_PROXIES = 4` is operationally equivalent on this data while being easier to
  reason about and tune.
- *Single mega-score with weights*: rejected (YAGNI) — a weighted score needs its own
  tuning/justification and is opaque on the kiosk; explicit named proxies are auditable
  and each maps to an observed value above.

---

## Summary of pinned answers

| OQ | Resolution |
|----|-----------|
| **OQ-1** | Thresholds pinned (table above), all in the storm-vs-negative gap with margin. |
| **OQ-2** | 90-min rolling window; 30-min trend span for deltas; gust = window max; degrade gracefully below 30 min / 4 readings. |
| **OQ-3** | Solar collapse = daytime-only proxy, gated by `isDaytime()` + 50 W/m² peak floor; at night the proxy pool is the 4 dynamics proxies. |
| **OQ-4** | `piezoNearZero` gate AND a **count-based quorum** of ≥ `MIN_PROXIES` (4) of the 5 symmetric proxies {temp, humidity, gust, pressure, daytime solar}. Verified on 8,057 rows: 4 → 6 real flags / 0 nightly FPs; 3 rejected (12 breezy-afternoon FPs). |

All values land in `RAIN_FAULT_DEFAULTS` as tunable named constants. No magic numbers in
the detector body.
