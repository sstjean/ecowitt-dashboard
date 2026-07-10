# Feature Specification: Rain-Fault Leading-Edge False Positive Fix (014)

**Feature Branch**: `014-rain-fault-leading-edge`

**Created**: 2026-07-06

**Status**: Draft

**Input**: Amend Feature 008 so an approaching storm's leading edge (storm signature present, rain not yet fallen) does not raise a rain-gauge "not measuring" fault, while a genuinely dead gauge during a sustained downpour still does.

## Source of Truth

> **GitHub Issues are the source of truth for this feature. This markdown is a
> derived implementation tool. If they ever disagree, the Issues win.**

- **Parent Feature**: [#60 — Rain-Fault Leading-Edge False Positive Fix (014)](https://github.com/sstjean/ecowitt-dashboard/issues/60)
- **US1**: [#61 — Leading-edge approaching storm does NOT raise rain-gauge fault](https://github.com/sstjean/ecowitt-dashboard/issues/61)
- **US2**: [#62 — Sustained real downpour with dead gauge STILL raises fault (no 008 regression)](https://github.com/sstjean/ecowitt-dashboard/issues/62)

This feature **amends Feature 008** ([#26](https://github.com/sstjean/ecowitt-dashboard/issues/26), `specs/008-rain-fault-detection/`). It changes the detection heuristic **only** — the UI (Feature 010 rainfall overlay) and the API envelope are unchanged.

## Background — why this feature exists

Feature 008 added a rain-gauge "not measuring" fault detector in `apps/api/src/rainFault.ts`. Over a rolling window it raises `rainSensorSuspect = true` when **both** hold:

1. **Piezo gate** — the WS90 piezo channel is effectively silent: rain rate ≤ 0.01 in/hr AND event-accumulation rise ≤ 0.01 in (the gauge reports essentially **zero rain**).
2. **Quorum** — at least 4 of 5 storm proxies concur: temperature crash (≥6 °F), humidity surge (≥10 %pts), gust spike (≥8 mph), pressure dip (≥0.8 hPa), and daytime solar collapse (≥50 % of the window peak).

**The bug (observed 2026-07-06):** On a storm's **leading edge**, the precursors (falling temp, rising humidity, gusts, dropping pressure, collapsing solar) all fire in the 30–90 minutes **before** the rain arrives. During that window the gauge *correctly* reads zero because it has not rained yet. "Storm signature + zero rain" on the leading edge is indistinguishable from the fault the 008 detector hunts for, so it trips prematurely — a false positive on essentially every approaching storm. The dashboard showed "Sensor may not be reporting" while the gauge was healthy.

### The chosen fix — a sustained / persistent storm-signature gate

Only suspect a fault when the storm signature (with zero rain) has **persisted well past when rain should already have begun**, rather than firing on the falling edge. Intuition:

- A **real gauge fault** during rain shows the storm signature **AND** zero rain sustained through the *whole* storm core.
- The **leading-edge false positive** shows a storm signature that has only *just appeared*, with pressure still actively falling (rain onset imminent).

Distinguish them by requiring the storm signature (with zero rain) to hold for a **minimum sustained duration past the typical precursor-to-onset lead**. (A pressure-bottomed / recovery criterion was considered and **rejected** — see FR-015 — because barometric pressure is not a reliable leading-edge discriminator.)

### Constraints (inherited from 008)

- **Local-only.** No NWS / airport precipitation cross-check (008 FR-012 stands).
- **Must not regress** the 008 true positive: the 2026-06-28 sustained downpour (~2 in/hr for ~45 min directly on the sensor, gauge flatlined at 0.00) with a dead gauge MUST still be flagged.
- **Must not regress** the 008 nightly-dew suppression (008 US2 — calm saturation never raises a fault).
- Detector remains **pure** and computed per-request from the rolling window (no persisted latch, no state carried between requests).
- **UI and API envelope unchanged** — `rainSensorSuspect` (and its reason) continue to flow through the existing `/api/v1/latest` envelope, rendered by the existing rainfall card / Feature 010 overlay.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leading-edge approaching storm does NOT raise a rain-gauge fault (Priority: P1)

Maps to [#61](https://github.com/sstjean/ecowitt-dashboard/issues/61).

As someone glancing at the wall kiosk while a storm is approaching, I want the rainfall card to NOT show "Sensor may not be reporting" while rain simply has not started yet, so that I trust the fault indicator and it only appears for a genuine gauge fault.

**Why this priority**: This is the core defect. Until the leading-edge case is suppressed, the fault indicator cries wolf on every approaching storm, which trains the household to ignore it — defeating the entire purpose of Feature 008.

**Independent Test**: Replay a rolling window captured from the 2026-07-06 leading-edge scenario (storm signature only recently appeared, pressure still actively falling, signature not yet sustained past the precursor-to-onset lead, rain rate/event at zero) through the detector and confirm it emits `rainSensorSuspect = false`.

**Acceptance Scenarios**:

1. **Given** a rolling window in which the storm signature has only *recently* appeared (rain onset imminent — pressure still actively falling / signature not yet sustained past the precursor-to-onset lead) and rain rate/event are zero, **When** the detector runs, **Then** `rainSensorSuspect = false`.
2. **Given** the 2026-07-06 leading-edge false-positive scenario as a fixture, **When** the detector runs, **Then** it returns `rainSensorSuspect = false`.
3. **Given** the 008 nightly-dew calm-saturation window, **When** the detector runs, **Then** it remains `rainSensorSuspect = false` (no regression of 008 US2).
4. **Given** the detector runs at all, **Then** it stays local-only (no NWS cross-check) and pure (computed per-request from the rolling window, no persisted latch).

---

### User Story 2 - Sustained real downpour with dead gauge STILL raises the fault (Priority: P1)

Maps to [#62](https://github.com/sstjean/ecowitt-dashboard/issues/62).

As the household relying on the fault indicator, I want a genuinely dead gauge during a real, sustained downpour to STILL be flagged, so that the leading-edge fix does not blind us to the actual fault Feature 008 exists to catch.

**Why this priority**: The US1 fix must not over-correct. A detector that suppresses the false positive by also suppressing the true positive is a regression, not a fix. The 008 true positive is the reason the detector exists.

**Independent Test**: Replay the 2026-06-28 sustained-downpour capture (storm signature persisting through the storm core with rain rate/event flatlined at zero) through the amended detector and confirm it still emits `rainSensorSuspect = true` with a reason.

**Acceptance Scenarios**:

1. **Given** the 2026-06-28 sustained-downpour capture (storm signature persisting through the storm core with rain rate/event flatlined at zero), **When** the detector runs, **Then** `rainSensorSuspect = true` with a human-readable reason.
2. **Given** any window where the storm signature is *sustained* past the onset lead and rain stays zero, **When** the detector runs, **Then** the fault is raised.
3. **Given** the amended detector, **When** it evaluates any window, **Then** the 008 quorum + piezo-gate semantics remain intact; only the leading-edge case is newly suppressed.

---

### Edge Cases

- **Signature appears then dissipates without rain** (storm skirted the house): the signature was never sustained through a core and rain stayed zero — this should behave like the leading edge (no fault), not a dead-gauge downpour.
- **Rolling window straddles the leading edge into onset**: as the window ages and the signature persists past the onset lead with rain still zero, the detector transitions from suppressed (US1) to raised (US2). The sustained-duration criterion (`SUSTAIN_MIN`) defines exactly where that transition occurs.
- **Window too short / sparse to judge persistence**: if the rolling window does not span enough time to assess whether the signature is sustained, the detector must degrade gracefully (no exception, and no spurious fault) — consistent with 008 FR-013.
- **Storm core with a brief real trickle then flatline**: a near-zero-but-nonzero piezo reading is still governed by the 008 piezo gate; this feature does not change the gate, only when a held gate + signature is trusted as a fault.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The detector MUST NOT raise a fault (`rainSensorSuspect = false`) when the storm signature (with the piezo gate holding at zero rain) has only *recently* appeared — i.e. the signature has not persisted past the precursor-to-onset lead — even when the 008 quorum of proxies is otherwise met.
- **FR-002**: The detector MUST NOT raise a fault on the leading edge (a storm signature that has only recently appeared with rain onset imminent) even when the quorum is met and the gate is holding. Pressure behaviour is **not** used as a discriminator (see FR-015); the leading edge is identified solely by the sustained-duration criterion of FR-001/FR-003, not by any pressure-falling test.
- **FR-003**: The detector MUST raise a fault (`rainSensorSuspect = true`) when the storm signature (with the piezo gate holding at zero rain) is **sustained** past the precursor-to-onset lead — expressed as the signature persisting for at least a minimum sustained duration and/or pressure having already bottomed / begun recovering (the storm core has passed).
- **FR-004**: The amended detector MUST preserve the 008 piezo-gate and quorum semantics (piezo gate near-zero AND ≥ `MIN_PROXIES` of the 5 proxies concurring); the sustained/persistence criterion is an **additional** gate layered on top, not a replacement — the only newly-suppressed case is the leading edge.
- **FR-005**: The detector MUST return `rainSensorSuspect = true` for the 2026-06-28 sustained-downpour true-positive fixture (no regression of 008 US1).
- **FR-006**: The detector MUST return `rainSensorSuspect = false` for the 2026-07-06 leading-edge false-positive fixture (the defect this feature fixes).
- **FR-007**: The detector MUST continue to return `rainSensorSuspect = false` for the 008 nightly-dew exclusion fixtures — both the real 06-28 dew window (excluded by the piezo gate) and the calm-saturation window (excluded by the quorum) — with no regression.
- **FR-008**: Detection MUST rely only on the local WS90 sensor array; no NWS/airport precipitation cross-check is permitted (008 FR-012 stands).
- **FR-009**: The detector MUST remain **pure** and computed **per-request** from the rolling window, with no persisted latch or state carried between requests.
- **FR-010**: The API envelope MUST be unchanged — `rainSensorSuspect` and its human-readable reason continue to flow through the existing `/api/v1/latest` response; no new field is required and no new endpoint is introduced.
- **FR-011**: The UI MUST be unchanged — the existing rainfall card / Feature 010 overlay renders the (now more trustworthy) `rainSensorSuspect` state exactly as before; this feature introduces no new presentation.
- **FR-012**: The human-readable reason accompanying a raised fault MUST continue to describe the storm-signature-vs-zero-rain divergence (consistent with 008 FR-003) and SHOULD reflect that the signature was sustained (so a genuine fault reads distinctly from a merely-approaching storm).
- **FR-013**: Detection MUST degrade gracefully when the rolling window is too short or too sparse to assess persistence — no exceptions and no spurious faults (consistent with 008 FR-013).
- **FR-014**: The sustained-duration threshold is **`SUSTAIN_MIN = 45` minutes** (confirmed 2026-07-06, calibrated against both fixtures). The detector MUST require the storm signature (008 quorum met AND piezo gate holding at zero rain) to have **already been established at least `SUSTAIN_MIN` minutes before `now`** — i.e. the quorum + gate must also hold when evaluated over the sub-window ending `SUSTAIN_MIN` minutes before `now`. This lets the 06-28 dead-gauge signature (sustained for hours) through while suppressing the 07-06 leading edge (signature persisted only ~25–40 min before rain onset opened the gate). This threshold lives with the other tunables (no magic literals in control flow).
- **FR-015**: **No pressure-bottomed / recovery criterion is used.** The fix is **pure sustained-duration** (per FR-014). Pressure behaviour near onset is unreliable as a leading-edge signal (the 2026-07-06 capture shows pressure *rising* at rain onset — a gust-front jump, 1013→1015.6 hPa — not falling), so gating on pressure recovery is explicitly rejected. The 008 pressure-dip proxy remains one of the 5 quorum proxies, unchanged.

### Key Entities *(include if feature involves data)*

- **Reading (stored)**: A single timestamped WS90 sample (temperature, wind gust, barometric pressure, humidity, dewpoint, solar irradiance, piezo rain rate/event). Unchanged from Feature 008; legacy Ambient `rain_0x*` fields remain ignored.
- **Detection window**: The rolling, time-bounded sequence of recent stored Readings over which the storm signature, rain state, **and now signature persistence** are jointly evaluated.
- **Rain-suspect state**: The detector output attached to the `latest` envelope — a `rainSensorSuspect` boolean plus a human-readable reason. Shape unchanged from Feature 008.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying the 2026-07-06 leading-edge false-positive fixture yields `rainSensorSuspect = false`.
- **SC-002**: Replaying the 2026-06-28 sustained-downpour true-positive fixture yields `rainSensorSuspect = true`.
- **SC-003**: Replaying the 008 nightly-dew exclusion fixtures yields `rainSensorSuspect = false` via both the gate path (real 06-28 dew window) and the quorum path (calm-saturation window).
- **SC-004**: Replaying the 2026-06-27 normal rain event (piezo registered rain) continues to yield `rainSensorSuspect = false`.
- **SC-005**: Across a representative span of stored approaching-storm windows, the detector raises zero leading-edge false positives while still raising the sustained-downpour true positive.
- **SC-006**: The API envelope and UI are byte-for-byte unchanged in shape — no consumer of `/api/v1/latest` or the rainfall card needs to change to benefit from the fix.

## Assumptions

- The stored WS90 channels persisted for Feature 008 (temperature, gust, pressure, humidity, dewpoint, solar, piezo rain rate/event) are dense enough to assess signature persistence over the rolling window; no new stored fields are required.
- The 2026-06-28 storm capture (008 true positive) and a 2026-07-06 leading-edge capture are both available (or reconstructable from stored readings) to serve as deterministic regression fixtures.
- The rolling-window length may need to be long enough to observe both the precursor-to-onset lead and the sustained storm core; whether the existing 008 window span suffices or must be extended is a plan/research decision, not a spec decision.
- The fix is confined to the detection heuristic in the API/shared layer; the web remains a presentation-only consumer of `rainSensorSuspect`.
- Feature 004 legibility conventions and the project's Eastern-time display rule continue to apply to the (unchanged) indicator without redefinition here.

## Resolved Decisions *(clarified 2026-07-06 against real captures)*

Calibrated against `/tmp/ecowitt-014capture.sqlite` (prod capture through 2026-07-06T21:27Z) via `scripts/analyze-014-leading-edge.py`. Issues #60/#61/#62 remain the source of truth.

- **OQ-1 — Sustained-duration threshold → RESOLVED: `SUSTAIN_MIN = 45` minutes.** The storm signature (quorum + gate) must have been established ≥ 45 min before `now`. Data: 07-06 leading edge sustained only ~25–40 min before rain onset (→ suppressed); 06-28 dead-gauge signature sustained for hours (→ flagged). (See FR-014.)
- **OQ-2 — Pressure-bottomed / recovery criterion → RESOLVED: NOT USED.** Pure sustained-duration. The 07-06 capture shows pressure rising (gust-front jump) at rain onset, making pressure recovery an unreliable leading-edge discriminator. (See FR-015.)
- **OQ-3 — Precursor-to-onset lead value → RESOLVED: implicit in `SUSTAIN_MIN`.** No separate lead-time constant; the 45-minute sustained requirement subsumes the typical precursor-to-onset lead. The threshold is a fixed tunable, not derived from the window.

### Accepted tradeoff

A genuinely dead gauge during a real storm is flagged only after the signature has persisted ~45 min (detection is deliberately delayed vs 008's over-eager behaviour). This is consistent with 008's purpose — catching a *sustained* measurement fault, not a momentary one.
