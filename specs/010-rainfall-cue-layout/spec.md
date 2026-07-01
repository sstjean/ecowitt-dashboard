# Feature Specification: Rainfall-Card Cue Layout Refinement (010)

**Feature Branch**: `010-rainfall-cue-layout`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "UI refinement to the rainfall card. The two cues shipped by Feature 008 — the 'Raining now' cue and the 'Sensor may not be reporting' fault indicator — overflow and clip the fixed-height rainfall card in production. Redesign both so nothing clips: move 'Raining now' inside the left column above the Daily Rain number, and turn the fault indicator into a centered overlay that greys out the whole card. This amends/overrides 008 FR-011a."

## Amendment Notice

> **This feature AMENDS and SUPERSEDES Feature 008 (`008-rain-fault-detection`)
> requirement FR-011a.** Feature 008 FR-011a mandated that the "Raining now" cue
> render as a **full-width banner** on the rainfall card. That requirement is
> **overridden** here: "Raining now" now renders as a compact banner **inside the
> left/main column, directly above the Daily Rain value** (see FR-002). Feature
> 008 FR-009/FR-010/FR-011 (the fault-indicator presentation and legibility rules)
> are **refined** here into a card-wide dimming overlay (see FR-005–FR-008).

## Background — why this feature exists

Feature 008 ("Rain-Gauge Fault Detection") shipped two mutually-exclusive visual
cues on the rainfall card, both driven by the existing `/api/v1/latest` envelope:

- **"Raining now"** — shown when `reading.isRaining` is `true` **and**
  `snapshot.rainSensorSuspect` is `false`. Rendered today as a **full-width banner
  at the top of the card** (blue `--cp-link` accent, pulsing dot, short "Raining
  now" text), per 008 FR-011a.
- **"Sensor may not be reporting"** fault indicator — shown when
  `snapshot.rainSensorSuspect` is `true`, carrying `snapshot.rainSensorReason`
  text. Rendered today as an **inline warning block at the top of the card**
  (amber/warning styling, ⚠ icon).

The rainfall card is a **fixed-height grid cell with `overflow: hidden`**. In
production the two-line fault warning block **overflows** the card and **clips**
the Yearly total row and the rain-rate readout. The full-width "Raining now"
banner also consumes vertical slack the card cannot spare. Steve wants both cues
redesigned so the card never grows and nothing is clipped.

The original defect slipped through because the DOM/unit tests asserted element
presence and text but never asserted **layout containment** — the clipping only
appeared at real rendered dimensions on the kiosk. A visual/layout containment
guard (Playwright e2e) is therefore mandatory here.

## Scope & Constraints

- **Web-only change.** Touches only `apps/web`:
  - `apps/web/src/render/rainfall.ts` (cue markup/placement)
  - `apps/web/src/styles.css` (in-column banner + card overlay + dimming styles)
  - Tests: `apps/web/tests/render/rainfall.test.ts`, `apps/web/tests/render/index.test.ts`, and a Playwright layout-containment guard under `apps/web/e2e`.
- **Data contract UNCHANGED.** `reading.isRaining`, `snapshot.rainSensorSuspect`,
  and `snapshot.rainSensorReason` already exist on the `/api/v1/latest` envelope.
  No API, poller, or shared-package changes.
- **Strict TDD, 100% coverage.** Red → verify → Green. The Playwright layout guard
  is mandatory (DOM presence tests alone missed the original overflow).
- **Kiosk legibility (Feature 004)** conventions apply to both cues.
- **No raw UTC timestamps.** The fault overlay MUST NOT render any timestamp; it
  carries only the title and `rainSensorReason` text (Eastern-time / no-UTC rule).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Active-rain cue no longer clips the card (Priority: P1)

As someone glancing at the wall kiosk during a rainstorm, I see a clear "Raining
now" cue on the rainfall card, and the card still shows every total (including the
Yearly row) and the rain-rate readout without any content being cut off.

**Why this priority**: This is the most common everyday state (it rains far more
often than the gauge faults) and the clipping regression is user-visible on the
kiosk. Fixing the active-rain layout restores the card's core readability.

**Independent Test**: Render the rainfall card with `isRaining = true` and
`rainSensorSuspect = false`; confirm the "Raining now" banner appears inside the
left column directly above the Daily Rain value, the Daily Rain number + label are
pushed down (not overlapping), the droplet graphic and the right-hand Totals grid
are unchanged, and no card content overflows the fixed-height cell.

**Acceptance Scenarios**:

1. **Given** `reading.isRaining = true` and `snapshot.rainSensorSuspect = false`, **When** the rainfall card renders, **Then** a compact "Raining now" banner (blue `--cp-link` accent, pulsing dot, "Raining now" text) appears inside the left/main column **directly above** the Daily Rain number.
2. **Given** the "Raining now" banner is shown, **When** the layout settles, **Then** its only layout effect is to push the Daily Rain value and "Daily Rain" label **down within the left column**; the droplet graphic and the right-hand Totals grid (Event/Hourly/Weekly/Monthly/Yearly) are unaffected.
3. **Given** the "Raining now" banner is shown, **When** the card is measured at its fixed rendered height, **Then** no content (Daily Rain, rain rate, or any Totals row including Yearly) is clipped or overflows the card.
4. **Given** `reading.isRaining = false` and `rainSensorSuspect = false`, **When** the card renders, **Then** no "Raining now" banner is shown and the Daily Rain value sits in its normal (un-pushed) position.

---

### User Story 2 - Sensor-fault state dims the whole card with a centered overlay (Priority: P1)

As someone glancing at the kiosk when the rain gauge is suspected to be faulted, I
see a centered "Sensor may not be reporting" message overlaid across the whole
rainfall card, with the card's contents greyed out — signaling at a glance that
the entire rainfall system is not to be trusted — and nothing clips.

**Why this priority**: The fault warning is the reason Feature 008 exists, and it
is the specific element that overflows and clips today. It must be legible and
contained. Equal P1 with US1 because both are the two states being redesigned.

**Independent Test**: Render the rainfall card with `rainSensorSuspect = true`;
confirm an absolutely-positioned overlay covers the entire card, is centered, shows
the ⚠ icon + "Sensor may not be reporting" title + `rainSensorReason` text, the
card content behind it (droplet, Daily Rain, Totals grid) is dimmed/greyed, no raw
UTC timestamp appears anywhere, and no content overflows the fixed-height cell.

**Acceptance Scenarios**:

1. **Given** `snapshot.rainSensorSuspect = true`, **When** the rainfall card renders, **Then** an absolutely-positioned overlay covering the **entire card** is shown, centered, with amber/warning styling, a ⚠ icon, the "Sensor may not be reporting" title, and the `rainSensorReason` text.
2. **Given** the fault overlay is shown, **When** the card renders, **Then** the underlying card content — droplet graphic, Daily Rain value, and the Totals grid — is visibly dimmed/greyed to signal the whole rainfall system is faulted.
3. **Given** the fault overlay is shown, **When** its content is inspected, **Then** it contains **no raw UTC timestamp** (and no timestamp at all), consistent with the current indicator.
4. **Given** the fault overlay is shown, **When** viewed at kiosk distance, **Then** the title and reason text are legible per Feature 004 legibility conventions.
5. **Given** the fault overlay is shown, **When** the card is measured at its fixed rendered height, **Then** neither the overlay nor the dimmed content overflows or clips the card.

---

### User Story 3 - The two cues remain mutually exclusive (Priority: P2)

As a viewer, I never see both cues at once: a suspected fault always suppresses the
"Raining now" cue, because a faulted gauge cannot be trusted to report active rain.

**Why this priority**: Preserves the Feature 008 invariant. Lower priority only
because it is a guard on the interaction of US1 and US2 rather than a new surface.

**Independent Test**: Render with `isRaining = true` **and**
`rainSensorSuspect = true`; confirm only the fault overlay is shown and the
"Raining now" banner is absent.

**Acceptance Scenarios**:

1. **Given** `reading.isRaining = true` and `snapshot.rainSensorSuspect = true`, **When** the card renders, **Then** only the fault overlay is shown and the "Raining now" banner is **not** rendered.
2. **Given** `snapshot.rainSensorSuspect = true`, **When** the card renders, **Then** the fault state takes precedence regardless of `reading.isRaining`.

---

### Edge Cases

- **Long `rainSensorReason` text**: The reason string may be long. The centered overlay MUST wrap and remain within the card bounds (no overflow, no clipping); if it cannot fully fit, it MUST degrade gracefully (e.g., wrap/truncate) rather than push the card taller or spill outside it.
- **`rainSensorReason` empty or missing**: The overlay MUST still render the ⚠ icon and "Sensor may not be reporting" title without breaking layout when the reason is absent.
- **Neither cue active** (`isRaining = false`, `rainSensorSuspect = false`): The card renders its normal dry state — no banner, no overlay, no dimming, Daily Rain in its normal position.
- **Zero / very small Daily Rain with "Raining now" active**: The pushed-down Daily Rain value (e.g., 0.00 at the very start of a shower) MUST remain fully visible within the left column.
- **Narrow / kiosk viewport widths**: At the kiosk's rendered width the in-column banner and the overlay MUST both stay contained; the containment guard runs at the kiosk viewport.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The rainfall card MUST continue to derive both cues solely from the existing `/api/v1/latest` envelope fields — `reading.isRaining`, `snapshot.rainSensorSuspect`, and `snapshot.rainSensorReason` — with no change to the data contract, API, poller, or shared package.
- **FR-002**: When `reading.isRaining = true` **and** `snapshot.rainSensorSuspect = false`, the web MUST render the "Raining now" cue as a **compact banner inside the left/main column, directly above the Daily Rain value**, retaining its established styling (blue `--cp-link` accent, pulsing dot, short "Raining now" text). This SUPERSEDES Feature 008 FR-011a (full-width banner).
- **FR-003**: The "Raining now" in-column banner's only layout effect MUST be to push the Daily Rain value and its "Daily Rain" label **down within the left column**. The droplet graphic and the right-hand Totals grid (Event/Hourly/Weekly/Monthly/Yearly) MUST be unaffected, and the card MUST NOT grow in height.
- **FR-004**: When `reading.isRaining = false` (and no fault), the web MUST NOT render the "Raining now" banner, and the Daily Rain value MUST sit in its normal un-pushed position.
- **FR-005**: When `snapshot.rainSensorSuspect = true`, the web MUST render the "Sensor may not be reporting" fault indicator as an **absolutely-positioned overlay covering the entire rainfall card**, horizontally and vertically **centered**, retaining fault styling (amber/warning, ⚠ icon), showing the "Sensor may not be reporting" title and the `rainSensorReason` text. (Refines Feature 008 FR-009/FR-010/FR-011 — the fault-indicator presentation.)
- **FR-006**: When the fault overlay is shown, the web MUST visibly **dim/grey out the entire card content behind it** (droplet graphic, Daily Rain value, and Totals grid) to signal that the whole rainfall system is faulted. (Refines Feature 008 FR-009/FR-010 — the fault-vs-dry distinction.)
- **FR-007**: The fault overlay MUST NOT render any timestamp (and specifically no raw UTC timestamp), preserving the current indicator's behavior and honoring the Eastern-time display rule.
- **FR-008**: Both cues MUST remain legible at kiosk distance per Feature 004 legibility conventions. The Playwright layout-containment guard MUST include a lightweight automated legibility assertion — the fault-overlay title and the "Raining now" banner text MUST have a computed `font-size` of at least **13px** (the established cue text size; no legibility regression) — with the remaining perceptual legibility (contrast, glance-readability) verified by the manual visual checks (local quickstart T026 and prod verify T029).
- **FR-009**: The two cues MUST remain **mutually exclusive**: when `snapshot.rainSensorSuspect = true`, the fault overlay MUST be shown and the "Raining now" banner MUST be suppressed regardless of `reading.isRaining`.
- **FR-010**: Neither the "Raining now" in-column banner nor the fault overlay (including a long, wrapped `rainSensorReason`) may cause any rainfall-card content to **overflow or clip** the fixed-height, `overflow: hidden` card cell at the kiosk viewport.
- **FR-011**: A Playwright end-to-end **layout-containment guard** MUST assert, at the kiosk viewport, that in each state (Raining now; sensor fault; neither) no rainfall-card content is clipped and the card's rendered height does not exceed its grid cell — because the DOM/unit tests alone did not catch the original overflow.
- **FR-012**: The change MUST maintain 100% test coverage and follow strict TDD (Red verified before Green) across `apps/web/tests/render/rainfall.test.ts`, `apps/web/tests/render/index.test.ts`, and the new/updated e2e guard.

### Key Entities *(include if feature involves data)*

- **Latest envelope (existing)**: The `/api/v1/latest` response already carrying `reading.isRaining` (boolean, active-rain), `snapshot.rainSensorSuspect` (boolean, gauge-fault suspicion), and `snapshot.rainSensorReason` (human-readable fault reason). Consumed unchanged; this feature only changes how these three fields are presented on the rainfall card.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the "Raining now" state, 100% of rainfall-card content (Daily Rain value + label, rain-rate readout, droplet, and all Totals rows including Yearly) is fully visible with zero clipped or overflowed pixels at the kiosk viewport.
- **SC-002**: In the "Raining now" state, the "Raining now" banner appears above the Daily Rain value inside the left column, and the droplet and Totals grid occupy the same positions as in the dry state (no horizontal reflow of those regions).
- **SC-003**: In the sensor-fault state, the fault message is presented as a single centered overlay covering the whole card, with the card content behind it visibly dimmed, and zero clipped or overflowed pixels at the kiosk viewport.
- **SC-004**: In the sensor-fault state, no timestamp (UTC or otherwise) is present anywhere in the overlay.
- **SC-005**: When both `isRaining` and `rainSensorSuspect` are true, only the fault overlay is present and the "Raining now" banner is absent, in 100% of renders.
- **SC-006**: The rainfall card's rendered height equals its grid-cell height (does not grow) in all three states — Raining now, sensor fault, and neither.
- **SC-007**: A Playwright layout-containment guard covering all three states passes in CI, and unit + e2e suites maintain 100% coverage.

## Assumptions

- The existing rainfall-card left/main column already contains the droplet graphic, the Daily Rain value, and the "Daily Rain" label, and the Totals grid is a separate right-hand region — matching the current Feature 008 layout.
- The established visual styling of both cues (blue `--cp-link` accent + pulsing dot for "Raining now"; amber/warning + ⚠ icon for the fault) is retained; only placement, containment, and the card-dimming behavior change.
- "Greys out / dims" is satisfied by reduced opacity and/or a muted overlay scrim over the card content; the exact opacity value is an implementation detail to be tuned for kiosk legibility.
- The kiosk viewport dimensions used by the Playwright guard match those already used by Feature 004 / existing e2e kiosk tests.
- No changes to the `rainSensorReason` text content are in scope; only its presentation within the overlay.
