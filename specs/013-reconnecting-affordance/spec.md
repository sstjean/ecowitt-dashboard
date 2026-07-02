# Feature Specification: Reconnecting Affordance (Visible Outage Cue)

**Feature Branch**: `013-reconnecting-affordance`

**Created**: 2026-07-02

**Status**: Draft

**GitHub Issues**: Feature #56 (parent) · User Story #57 (US1)

**Input**: User description: "Reconnecting affordance (visible US2 outage cue) — deliver the deferred, optional on-screen 'reconnecting' cue that consumes Feature 012's already-shipped, edge-triggered `onReconnectingChange` reconnect hook, so the wall kiosk visibly signals a transient outage instead of silently going stale."

## User Scenarios & Testing *(mandatory)*

Feature 012 (kiosk self-heal) shipped the "never-give-up reconnect" behaviour for the wall kiosk: the dashboard's data-refresh loop keeps retrying forever through a transient outage and recovers automatically once data flows again. As part of that work it exposed an in-memory, edge-triggered "reconnecting" signal (fires once when data-fetches start failing, and once again when they next succeed), fully implemented and tested — but left **unconsumed**: nothing on screen reflects it. Feature 012 explicitly deferred the visible cue (its FR-013 / optional task T018 marked it MAY). This feature delivers exactly that deferred cue as its own user-facing vertical slice, giving the operator a glance-able indication that the display knows it is disconnected and is retrying.

### User Story 1 - Operator sees a subtle "reconnecting" cue during a transient outage (Priority: P3)

As the operator of the wall kiosk, when live-data requests start failing during a transient outage, I want a subtle on-screen "reconnecting" cue — rather than the display silently going stale or blank — so I can tell at a glance that the dashboard knows it is disconnected and is retrying, and I want that cue to disappear on its own once data flows again.

**Why this priority**: The underlying self-healing behaviour already works (Feature 012); the dashboard recovers with or without this cue. This story adds observability, not recovery — it closes the "silent staleness" gap so a human glancing at the wall can distinguish "temporarily reconnecting" from "everything is current." It is P3 because it is a comfort/clarity improvement layered on top of already-correct behaviour, and it is a small, self-contained web-only slice with no data or contract impact.

**Independent Test**: While the kiosk is displaying live data, cause data-fetches to begin failing (simulate a transient outage). Confirm a subtle "reconnecting" cue appears within one poll interval while the last-known values stay on screen. Then restore data and confirm the cue clears on its own within one poll interval, with no manual refresh. Finally, run a session where data only ever succeeds and confirm the cue is never shown.

**Acceptance Scenarios**:

1. **Given** the kiosk is displaying live data, **When** data-fetch requests begin failing during a transient outage, **Then** a subtle "reconnecting" cue appears and the last-known values remain visible on screen (the display is NOT blanked or cleared).
2. **Given** the "reconnecting" cue is showing, **When** data flows again on the next successful fetch, **Then** the cue clears automatically with no manual refresh and no operator interaction.
3. **Given** the kiosk is running normally, **When** data-fetch requests only ever succeed, **Then** the "reconnecting" cue is never shown.
4. **Given** data-fetch requests fail on several consecutive ticks, **When** the outage persists, **Then** the cue appears exactly once and remains steady — it does not flicker, re-trigger, or re-animate per failed tick (the driving signal is already edge-triggered).

---

### Edge Cases

- **Failure exactly at first paint**: If the very first data-fetch fails before any values have ever rendered, the display already shows its own no-data / initial state (owned elsewhere). The reconnecting cue may co-exist with that state but MUST NOT blank or corrupt whatever the display is currently showing.
- **Rapid flap (fail → recover → fail within consecutive ticks)**: Because the driving signal is edge-triggered, each genuine transition shows or clears the cue once; the feature MUST NOT add its own re-trigger on every tick.
- **Prolonged outage**: The cue stays shown for the full duration of the outage without escalating, animating more loudly over time, or ever converting into an error/blank screen.
- **Recovery while operator is not looking**: The cue clears on its own; there is no dismiss button and no requirement for operator acknowledgement.
- **Interaction with existing Fresh/Stale freshness treatment**: The reconnecting cue is additive and MUST NOT interfere with, hide, or override the existing per-panel freshness (Fresh/Stale) presentation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST present a subtle on-screen "reconnecting" cue when live-data requests transition from healthy to failing.
- **FR-002**: The dashboard MUST remove the "reconnecting" cue automatically when live-data requests next succeed, with no operator action and no manual refresh.
- **FR-003**: The "reconnecting" cue MUST NOT appear at any time while live-data requests are succeeding (healthy state).
- **FR-004**: While the "reconnecting" cue is shown, the dashboard MUST continue to display the last-known values already on screen; it MUST NOT blank, clear, overwrite, or corrupt them.
- **FR-005**: The "reconnecting" cue MUST appear exactly once per outage and remain steady for the duration of the outage — it MUST NOT flicker, re-trigger, or re-animate on each subsequent failed tick.
- **FR-006**: The "reconnecting" cue MUST be visually subtle and kiosk-legible, suited to a wall display — a quiet indication (e.g. a small pulsing dot and/or a short "Reconnecting…" label co-located with the existing freshness stamp), NOT a loud, full-width banner or modal.
- **FR-007**: The "reconnecting" cue MUST reuse the existing freshness **visual language** (the `--cp-warning` warning color token) and sit in the **header status area**, co-located with the header clock — NOT literally beside the per-panel Fresh/Stale badges — rather than introducing a competing, unrelated visual treatment.
- **FR-008**: The "reconnecting" state MUST be held in memory only for the duration of the running display session; it MUST NOT be persisted, stored, or survive a reload.
- **FR-009**: The feature MUST NOT introduce any new user-visible timestamp and MUST NOT change existing time-of-day or timezone presentation (America/New_York display rules remain unchanged).
- **FR-010**: The feature MUST consume the existing reconnect signal from the data-refresh loop as the sole driver of the cue; it MUST NOT alter, replace, or duplicate that signal's failure/recovery detection logic.
- **FR-011**: The feature MUST be confined to the web display layer and MUST NOT change any data-serving behaviour, response contracts, stored data, or the reconnect state machine itself.

### Key Entities *(include if feature involves data)*

- **Reconnecting indicator (in-memory display state)**: A transient, boolean on/off condition representing "live-data requests are currently failing and the display is retrying." It is derived entirely from the existing edge-triggered reconnect signal, exists only in the running display session, is never persisted, and drives whether the subtle cue is present or absent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When live-data requests begin failing, the "reconnecting" cue becomes visible within one poll interval of the first failed fetch.
- **SC-002**: When live-data requests recover, the "reconnecting" cue disappears within one poll interval of the first successful fetch, with zero operator interactions.
- **SC-003**: Throughout an outage (from first failure to recovery), 100% of the last-known values that were on screen remain visible — none are blanked, cleared, or replaced by an error state.
- **SC-004**: Across a session in which data-fetch requests only ever succeed, the "reconnecting" cue is shown 0 times.
- **SC-005**: During an outage spanning many consecutive failed ticks, the cue is triggered exactly once (no per-tick flicker or re-animation), observable as a single appearance that persists.

## Assumptions

- The existing edge-triggered reconnect signal from the data-refresh loop (delivered and covered at 100% in Feature 012) is the authoritative source of the reconnecting condition; this feature only renders it.
- "Within one poll interval" is measured against the display's existing data-refresh cadence; no new or faster polling is introduced.
- The subtle cue is co-located with the existing freshness stamp in the header/freshness area; the exact visual form (pulsing dot, short label, or both) is finalized during planning, constrained to the "subtle, freshness-language, non-banner" rules above.
- Wiring the cue is a single web-layer integration point plus a new render helper; the bootstrap wiring line lives in a coverage-excluded file, consistent with existing project conventions.
- No accessibility/audio/notification requirements beyond the visual cue are in scope for this wall-display feature.

## Out of Scope

- Changing the reconnect state machine or its failure/recovery detection (delivered in Feature 012).
- Any dedicated error page, "site can't be reached" handling, or cold-boot launcher behaviour.
- Offline caching, retry backoff changes, or any change to how often data is fetched.
- Any API, poller, shared-package, data-model, or response-contract change.
- Any new persisted state or stored reconnect history.
- Any change to existing timestamp, time-of-day, or timezone presentation.
