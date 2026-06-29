# Feature Specification: Rain-Gauge "Not Measuring" Fault Detection (008)

**Feature Branch**: `008-rain-fault-detection`

**Created**: 2026-06-29

**Status**: Planned (design complete; ready for implementation)

**Input**: User description: "Detect and visibly flag when the WS90 piezo rain gauge is failing to measure — reporting a valid-looking 0.00 while rain is actually falling — and distinguish that from a genuine dry reading. Surface it as a 'rain sensor may not be reporting' indicator on the rainfall card, distinct from a normal dry 0.00."

## Source of Truth

> **GitHub Issues are the source of truth for this feature. This markdown is a
> derived implementation tool. If they ever disagree, the Issues win.**

- **Parent Feature**: [#26 — Rain-Gauge "Not Measuring" Fault Detection (008)](https://github.com/sstjean/ecowitt-dashboard/issues/26) (including the 2026-06-29 addendum comment about Ambient Weather ghost-sensor removal)
- **US1**: [#28 — Flag suspected rain-gauge fault on storm-signature + zero rain](https://github.com/sstjean/ecowitt-dashboard/issues/28)
- **US2**: [#29 — Nightly dewpoint convergence does NOT raise a fault](https://github.com/sstjean/ecowitt-dashboard/issues/29)
- **US3**: [#30 — Rainfall card shows "not measuring" indicator distinct from dry 0.00](https://github.com/sstjean/ecowitt-dashboard/issues/30)

## Background — why this feature exists

On **2026-06-28** a convective storm dropped roughly 2 in/hr for about 45 minutes
directly on the sensor, yet the WS90 piezo rain gauge reported **0.00 rain rate /
0.01 in daily** for the entire event. The data pipeline was fully healthy that day
(2,840 readings, max gap 1.0 min, faithful store + serve), and the prior **2026-06-27**
event recorded perfectly end-to-end. The chain works when the gauge measures; on
06-28 the gauge simply did not register the rain while still emitting valid-looking
zeros. The dashboard correctly showed "dry" because that is what the hardware
reported. This feature exists to catch a powered, linked sensor that is **measuring
wrong** — distinct from Feature 007, which catches power/link faults (battery low,
sensor offline).

Detection MUST be **local**, derived only from our own WS90 sensor array. An
NWS/airport precipitation cross-check is **explicitly out of scope**: the
Central-Florida microclimate means the MCO station can be in a downpour while the
house stays dry, which would generate false positives.

The hard constraint is to **never false-positive on nightly dew**. The house
regularly cools to the dewpoint overnight (humidity ~99%, temp−dewpoint spread
~0.1 °F) but conditions are **calm** (gust 1–3 mph, no temperature crash, stable
pressure, solar 0). Saturation alone is not rain; the discriminator is a **quorum of
concurring storm proxies** (a calm night fires at most one), not saturation.

### Triangulation framing — why a quorum of proxies

When the rain gauge is the suspect, we cannot trust the gauge to tell us whether it is
raining. So we **triangulate**: each of the other WS90 channels is treated as a
**proxy** for "a rainstorm is occurring." A real downburst stamps a coherent signature
across several channels at once, while quiet nightly dew moves at most one. The detector
flags a fault only when the piezo **gate** confirms the gauge is silent **and** at least
`MIN_PROXIES` (default **4**) of the 5 proxies concur — the more proxies that fire, the
higher the confidence the gauge is missing real rain.

### The separable storm signature (research captured 2026-06-29, from stored readings)

The 06-28 downpour left an unmistakable signature on the *other* WS90 channels that
quiet nightly dew does not:

| Signal | Storm (06-28 ≈21:30–22:30 UTC) | Nightly dew (≈01:00–09:00 UTC) |
|--------|--------------------------------|--------------------------------|
| Temperature | rapid crash (~22 °F drop) | no crash |
| Wind gust | spike (to ~17 mph) | calm (1–3 mph) |
| Pressure | dip (~1.4 hPa) | stable |
| Humidity | surge (57 → 93 %) | already ~99 % (saturated) |
| Solar (daytime) | collapse (809 → 24 W/m²) | 0 (night) |
| Piezo rain rate/event | flatlined at 0 | 0 |

The fault is suspected only when the piezo **gate** holds (rain rate/event stay at 0)
**AND** a **quorum of ≥ `MIN_PROXIES` (4) of the 5 proxies** concur. Nightly dew never
trips it because calm saturation fires at most one proxy — far below the quorum.

### Rain source — piezo only (Ambient ghost sensors removed)

Per the #26 addendum, a previous Ambient Weather WS2000 system's sensors (`wh40`
tipping-bucket rain id `17441`, `wh80` id `431E`, `wh31 CH2` id `A0`) had been
emitting ghost telemetry into the Ecowitt GW2000B. They have been **physically
removed** (batteries pulled, sensors discarded). Going forward:

- Rain comes from the **WS90 piezo only** (`rainRateInHr` / `rainEventIn`).
- The Ambient tipping-bucket `rain_0x*` history fields are artifacts of the removed
  gauge and MUST NOT be treated as a corroborating rain source.
- The 06-28 storm fixture predates removal, so its `rain_0x*` series may still exist
  in stored readings; the detector MUST ignore it and rely on the WS90 piezo plus the
  other WS90 storm-signature channels.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flag suspected rain-gauge fault on storm signature + zero rain (Priority: P1)

Maps to [#28](https://github.com/sstjean/ecowitt-dashboard/issues/28).

As the household, I want the dashboard to flag a suspected rain-gauge fault when a
rainstorm's signature is present on the WS90 array but the piezo rain channel reads
zero, so a dead/mis-measuring gauge is caught instead of silently showing "dry."

**Why this priority**: This is the core detection capability — without it the 06-28
failure mode goes unnoticed. It is the foundation the other stories build on.

**Independent Test**: Replay a window of stored readings containing the WS90 storm
signature with the piezo at 0 through the detection logic and confirm it emits
`rainSensorSuspect = true` with a human-readable reason. Replay the 06-27 normal
event and confirm `false`.

**Acceptance Scenarios**:

1. **Given** a rolling window of stored readings in which at least `MIN_PROXIES` (4) of the 5 WS90 storm proxies fire (temp crash, humidity surge, gust spike, pressure dip, daytime solar collapse) **and** the piezo rain rate/event total stay at 0 (the gate holds), **When** detection runs over that window, **Then** it emits `rainSensorSuspect = true` with a human-readable reason listing the proxies that fired.
2. **Given** the 2026-06-28 storm window (≈21:30–22:30 UTC) as a fixture, **When** detection runs, **Then** it returns `rainSensorSuspect = true`.
3. **Given** a normal rain event where the piezo registers rain alongside the signature (e.g. the 2026-06-27 event), **When** detection runs, **Then** it returns `rainSensorSuspect = false` (real measurement ⇒ no fault).
4. **Given** stored readings that still contain Ambient `rain_0x*` tipping-bucket values, **When** detection runs, **Then** those fields are ignored and detection keys only off the WS90 piezo rain channel.

---

### User Story 2 - Nightly dewpoint convergence does NOT raise a fault (Priority: P1)

Maps to [#29](https://github.com/sstjean/ecowitt-dashboard/issues/29).

As the household, I want nightly cooling to the dewpoint (calm saturation) to never
raise a rain-gauge fault, so the indicator stays trustworthy and does not cry wolf
every night. This must hold via **both** exclusion paths: the piezo **gate** (the real
06-28 dew window had the WS90 piezo reading 0.19 in/hr, so the gate excludes it outright)
**and** the **quorum** (a calm-saturation window with the piezo at 0 still fails to reach
`MIN_PROXIES` proxies, so it is excluded even when the gate would pass).

**Why this priority**: A detector that fires every night is worse than no detector —
it trains the household to ignore the indicator. Suppressing calm-saturation false
positives is as critical as catching the real fault.

**Independent Test**: Replay a calm-saturation window (humidity ≈99 %, temp−dewpoint
spread near 0, no gust spike, no temp crash, stable pressure, solar ~0) and confirm
`rainSensorSuspect = false` via the quorum path; and replay the real 06-28 dew window
(piezo 0.19) and confirm `false` via the gate path.

**Acceptance Scenarios**:

1. **Given** a window of stored readings showing humidity ≈99 % and a temperature−dewpoint spread near 0 °F but calm conditions (no gust spike, no rapid temp crash, stable pressure, solar at/near 0) with the piezo at 0, **When** detection runs, **Then** it returns `rainSensorSuspect = false` because fewer than `MIN_PROXIES` (4) proxies fire (the quorum path).
2. **Given** the real 2026-06-28 nightly-dew window (≈01:00–09:00 UTC) as a fixture, in which the WS90 piezo actually read 0.19 in/hr, **When** detection runs, **Then** it returns `rainSensorSuspect = false` because the piezo gate excludes it (the gate path).
3. **Given** saturation alone (high humidity / small temp−dewpoint spread) without the dynamic storm proxies, **When** detection runs, **Then** the fault never trips — a calm night fires at most one proxy, far below the `MIN_PROXIES` (4) quorum.

---

### User Story 3 - Rainfall card shows "not measuring" indicator distinct from dry 0.00 (Priority: P1)

Maps to [#30](https://github.com/sstjean/ecowitt-dashboard/issues/30).

As the household looking at the wall kiosk, I want the rainfall card to show a clear
"sensor may not be reporting" indicator when a fault is suspected, visually distinct
from a genuine dry 0.00, so I can tell "it's dry" apart from "the gauge is broken."

**Why this priority**: Detection is only useful if a human sees it. The distinct
indicator is what closes the loop from heuristic to household action.

**Independent Test**: Serve a `latest` envelope with `rainSensorSuspect = true` and
confirm the rainfall card renders a distinct fault indicator plus the reason; serve
`false` with 0.00 rain and confirm the normal dry state with no indicator.

**Acceptance Scenarios**:

1. **Given** the API `latest` envelope reports `rainSensorSuspect = true`, **When** the rainfall card renders, **Then** it shows a distinct fault indicator (e.g. warning badge / styling) plus the suspect reason, clearly different from the normal dry-0.00 presentation.
2. **Given** `rainSensorSuspect = false` with 0.00 rain, **When** the rainfall card renders, **Then** it shows the normal dry state with no fault indicator.
3. **Given** the fault indicator is displayed on the wall kiosk, **When** viewed at kiosk distance, **Then** it is legible (respecting Feature 004 legibility conventions) and any timestamps are pinned to Eastern time.
4. **Given** the suspect state must reach the web client, **When** the web reads it, **Then** it is plumbed through the existing `/api/v1/latest` envelope (no new endpoint).

---

### Edge Cases

- **Partial signature**: Some storm proxies fire but not all. The quorum rule requires at least `MIN_PROXIES` (4) of the 5 proxies to concur; fewer than the quorum never fires (the detector must not fire on saturation or a lone proxy).
- **Daytime vs nighttime storm**: Solar collapse is only meaningful in daylight; at night the solar proxy cannot fire, so the pool reduces to the 4 dynamics proxies {temp, humidity, gust, pressure} — reaching the quorum of 4 then means all four concur.
- **Sparse / missing readings in the window**: If the rolling window has gaps or missing channels, detection must degrade gracefully rather than throw or emit a spurious fault.
- **Piezo registers a trickle (not exactly 0)**: A near-zero but nonzero piezo reading during a clear storm signature — treated as measuring (no fault) vs. still suspect — depends on the zero/near-zero threshold (deferred).
- **Storm passes nearby but misses the house**: Local microclimate means the signature may be weak/partial; thresholds must be tuned to the on-sensor signature, not regional weather.
- **Lingering Ambient `rain_0x*` data in historical fixtures**: Must be ignored, never used as corroboration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST evaluate a rolling window of stored WS90 readings and determine which of the 5 storm proxies fire (temperature crash, humidity surge, gust spike, pressure dip; daytime solar collapse when applicable).
- **FR-002**: System MUST derive the rain state from the WS90 **piezo channel only** (`rainRateInHr` / `rainEventIn`) and MUST ignore the removed Ambient tipping-bucket `rain_0x*` fields entirely.
- **FR-003**: System MUST emit a `rainSensorSuspect` boolean state together with a human-readable reason describing the storm-signature-vs-zero-rain divergence.
- **FR-004**: System MUST set `rainSensorSuspect = true` only when the piezo gate holds (rain rate/event total stay at/near zero across the window) AND at least `MIN_PROXIES` (default 4) of the 5 storm proxies concur.
- **FR-005**: System MUST set `rainSensorSuspect = false` for genuine rain events where the piezo registers rain alongside the signature (real measurement ⇒ no fault).
- **FR-006**: System MUST NOT raise a fault for calm nightly saturation (high humidity / small temp−dewpoint spread without gust spike, temp crash, or pressure dip); saturation alone fires at most one proxy, far below the `MIN_PROXIES` quorum, so it MUST never trip the fault.
- **FR-007**: System MUST return `rainSensorSuspect = true` for the 2026-06-28 storm window fixture (≈21:30–22:30 UTC) and `rainSensorSuspect = false` for the nightly-dew exclusion fixtures via **both** paths: the real 06-28 dew window (≈01:00–09:00 UTC, piezo 0.19) excluded by the gate, and a calm-saturation window (piezo 0) excluded by the quorum.
- **FR-008**: API MUST expose `rainSensorSuspect` (and its reason) on the existing `/api/v1/latest` envelope; no new endpoint is introduced.
- **FR-009**: Web MUST render a distinct "sensor may not be reporting" indicator on the rainfall card when `rainSensorSuspect = true`, including the suspect reason, visually distinct from the normal dry-0.00 presentation.
- **FR-010**: Web MUST show the normal dry state with no fault indicator when `rainSensorSuspect = false` and rain is 0.00.
- **FR-011**: The fault indicator MUST be legible at kiosk distance per Feature 004 legibility conventions, and any timestamps it displays MUST be rendered in America/New_York (Eastern) time.
- **FR-012**: Detection MUST rely only on the local WS90 sensor array; no NWS/airport precipitation cross-check is permitted.
- **FR-013**: Detection MUST degrade gracefully when the rolling window has gaps or missing channels (no exceptions, no spurious faults).

### Key Entities *(include if feature involves data)*

- **Reading (stored)**: A single timestamped WS90 sample including temperature, wind gust, barometric pressure, humidity, dewpoint, solar irradiance, and piezo rain rate/event. May also still contain legacy Ambient `rain_0x*` fields that the detector ignores.
- **Detection window**: A rolling, time-bounded sequence of recent stored Readings over which the storm signature and rain state are jointly evaluated.
- **Rain-suspect state**: The detector output attached to the `latest` envelope — a `rainSensorSuspect` boolean plus a human-readable reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying the 2026-06-28 storm window fixture yields `rainSensorSuspect = true`.
- **SC-002**: Replaying the nightly-dew exclusion fixtures yields `rainSensorSuspect = false` via both paths — the real 06-28 dew window (piezo 0.19) excluded by the gate, and the calm-saturation window (piezo 0) excluded by the quorum.
- **SC-003**: Replaying the 2026-06-27 normal rain event (piezo registered rain) yields `rainSensorSuspect = false`.
- **SC-004**: Across a representative span of stored nightly-dew windows, the detector raises zero faults (no nightly false positives).
- **SC-005**: When `rainSensorSuspect = true`, a household member viewing the kiosk can distinguish "gauge may be broken" from a genuine dry 0.00 without additional explanation.
- **SC-006**: The suspect state is available to the web client through the existing `/api/v1/latest` response with no additional API call.

## Open Questions *(deferred to /speckit.clarify and /speckit.plan)*

These are intentionally left unpinned at the spec stage; precise numbers will be
fixed during clarify/plan against the stored fixtures. The Issues (#26/#28/#29/#30)
remain the source of truth for any values chosen.

- **OQ-1 — Thresholds**: The exact magnitudes/rates that define each storm signal (temperature-drop rate, gust-spike level, pressure-dip magnitude, humidity-surge delta, solar-collapse drop) and the "at/near zero" piezo threshold. [NEEDS CLARIFICATION: signal thresholds not yet specified — to be tuned against the 06-27/06-28 fixtures]
- **OQ-2 — Corroboration window length**: The duration/size of the rolling detection window and how the signals are aggregated within it (instantaneous vs. trend over N minutes). [NEEDS CLARIFICATION: window length and aggregation method not yet specified]
- **OQ-3 — Day/night solar handling**: How solar collapse participates in the rule for daytime storms vs. being excluded at night, and how "daylight" is determined. [NEEDS CLARIFICATION: day/night solar gating not yet specified]
- **OQ-4 — Concurrence rule** *(resolved in [research.md](./research.md) OQ-4)*: Resolved to a **count-based quorum** — the piezo **gate** (near-zero) must hold AND at least `MIN_PROXIES` (default 4) of the 5 symmetric proxies {temp crash, humidity surge, gust spike, pressure dip, daytime solar collapse} must concur. No proxy is individually mandatory; more concurring proxies = higher confidence. Verified against the full 8,057-row production dataset (MIN_PROXIES=4 → 6 real flags, 0 nightly false positives; ≥3 rejected for 12 breezy-afternoon false positives).

## Assumptions

- The existing storage layer already persists the WS90 channels needed for the storm signature (temperature, gust, pressure, humidity, dewpoint, solar) and the piezo rain channel at a cadence dense enough for a rolling window.
- The detection logic runs server-side (API or shared package) and its result is attached to the existing `latest` envelope; the web is a presentation-only consumer of `rainSensorSuspect`.
- Feature 007 (power/link fault detection) is complementary and out of scope here; this feature only addresses a powered, linked sensor that mis-measures rain.
- Feature 004 legibility conventions and the project's Eastern-time display rule apply to the new indicator without redefinition here.
- Stored readings remain in UTC; any displayed timestamp is converted to America/New_York at render time.
