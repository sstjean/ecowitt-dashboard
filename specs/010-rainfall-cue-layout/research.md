# Phase 0 Research: Rainfall-Card Cue Layout Refinement (010)

**Feature**: `010-rainfall-cue-layout` | **Date**: 2026-07-01

All spec inputs are fully specified; there are no `NEEDS CLARIFICATION` markers.
This document records the design decisions that resolve the "how" of the two
layout changes and the mandatory containment guard.

## Current state (as-built, Feature 008)

`renderRainfall` ([apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts))
builds these card-level children, in order:

- `h3.inline` "Rainfall"
- `.rain-fault` (inline warning block) — only when `rainSensorSuspect`
- `.rain-now-banner` (full-width, `[hidden]` when dry or suspect)
- `.rain-body` → `.drop-wrap` (droplet) + `.rain-main` (`.rv` value, `.rl` label,
  `.rain-rate`) + `.rain-grid` (Event/Hourly/Weekly/Monthly/Yearly rows)

> **Selector note (T1)**: the Daily Rain value node is `.rv`, and it also carries
> the `[data-rain-daily]` attribute — they are the **same element**. Test
> assertions standardize on `[data-rain-daily]`; `.rv` is the CSS class on that
> node.

`.card` already has `position: relative` and `overflow: hidden`
([apps/web/src/styles.css](../../apps/web/src/styles.css) line ~191). The defect:
the full-width banner and the two-line inline fault block both sit **above**
`.rain-body` at card level, consuming vertical slack the fixed-height card cannot
spare, so the Yearly row / rain-rate readout clip.

## Decision 1 — "Raining now" moves into the left/main column

- **Decision**: Render the `.rain-now-banner` as the **first child of `.rain-main`**
  (the middle column that holds `.rv` Daily Rain value, `.rl` label, `.rain-rate`),
  above `.rv`. Remove it from the card-level child list.
- **Rationale**: `.rain-body` is a 3-column grid (`auto auto 1fr`) with
  `align-items: center`; the droplet (col 1) and Totals grid (col 3) are laid out
  independently of the middle column's intrinsic height. A banner prepended inside
  `.rain-main` only grows the middle column's content box, pushing `.rv`/`.rl`
  down **within** that column — exactly FR-003. The droplet and Totals grid keep
  their positions (grid tracks unaffected). Because the banner replaces vertical
  space that the centered middle column previously left as slack, and the totals
  column is the tallest track, the card does not grow.
- **Styling**: Compact variant of the existing banner — keep the blue `--cp-link`
  accent, pulsing `.dot`, "Raining now" text, but tighten padding/margins and
  center it within the column. Keep the `data-rain-now` attribute and `[hidden]`
  suppression semantics (dry OR suspect ⇒ hidden) so existing selectors/e2e keep
  working.
- **Alternatives rejected**:
  - *Keep card-level banner, shrink height*: still consumes card-level vertical
    slack and reflows `.rain-body`; does not satisfy "only pushes Daily Rain".
  - *Overlay the banner on the droplet*: obscures the fill graphic; not requested.

## Decision 2 — Sensor fault becomes a centered full-card overlay + body dim

- **Decision**: When `rainSensorSuspect`, render a single
  `.rain-fault-overlay` element as the **last child of the card**, absolutely
  positioned to cover the card (`position: absolute; inset: 0`), flex-centered
  both axes, carrying the ⚠ icon + "Sensor may not be reporting" title +
  `rainSensorReason` text. Simultaneously add a `dimmed` class to `.rain-body`
  (droplet + Daily Rain + Totals) so the underlying content greys out.
- **Rationale**: `.card` is already `position: relative`, so an
  `position: absolute; inset: 0` child is clipped by the card's `overflow: hidden`
  and centered without affecting flow layout (zero effect on `.rain-body` height ⇒
  cannot grow or clip the card). Dimming the body (reduced opacity / muted scrim)
  signals "whole system faulted" per FR-006. A scrim background on the overlay
  itself plus a `.rain-body.dimmed { opacity: … }` covers both the "greyed
  content" and "overlay on top" requirements with the fewest moving parts.
- **Overflow safety for long reason text**: The overlay is a centered flex column
  with `max-width`/`max-height` bounded to the card, `overflow: hidden`, and text
  wrapping (`overflow-wrap: anywhere`); it degrades by wrapping/clipping **inside**
  the overlay rather than growing the card (edge case in spec).
- **No timestamp**: The overlay markup contains only icon + title + reason — no
  time element — satisfying FR-007 by construction.
- **Alternatives rejected**:
  - *Keep inline fault block, just constrain height*: still participates in flow
    and can push/clip; doesn't give the "centered over the whole card" look.
  - *Separate scrim element + overlay*: extra node for no benefit; a single
    overlay with its own background scrim plus a body opacity class is simpler.

## Decision 3 — Mutual exclusivity (unchanged invariant)

- **Decision**: Preserve Feature 008's rule: `rainSensorSuspect` ⇒ overlay shown,
  banner suppressed regardless of `isRaining`. Implement as: build the overlay
  only when suspect; the banner keeps its existing "hidden when dry OR suspect"
  guard, so both cannot appear together.
- **Rationale**: A faulted gauge cannot be trusted to report active rain (FR-009).

## Decision 4 — SRP + DRY structure inside `renderRainfall`

- **Decision**: Extract small local builders so the two branches don't duplicate
  markup: `buildRainingBanner(doc)`, `buildFaultOverlay(doc, reason)`, and the
  existing body assembly. `renderRainfall` composes: always build `h3` + `body`;
  prepend the banner into `.rain-main`; when suspect, add `dimmed` to body and
  append the overlay to the card children.
- **Rationale**: Constitution III (SRP) with DRY — each builder does one thing;
  shared concerns are not copy-pasted (per user design rule).

## Decision 5 — Mandatory Playwright layout-containment guard

- **Decision**: Add e2e assertions (extending the existing
  `expectContained(child, card)` helper in
  [apps/web/e2e/dashboard.spec.ts](../../apps/web/e2e/dashboard.spec.ts)) that, at the
  **kiosk viewport** (2160×1440, matching `kiosk.spec.ts`), verify for each state:
  1. **Raining now** (`isRaining:true`, `suspect:false`): the banner is inside
     `.rain-main` and above `.rv`; `.rain-grid` (incl. Yearly `[data-rain-yearly]`)
     and `.drop-wrap` remain fully contained in the card box; only `.rv` shifts
     down vs. the dry baseline.
  2. **Sensor fault** (`suspect:true`): `.rain-fault-overlay` box is centered over
     the card (mid-x/mid-y within tolerance of card center) and contained; the
     `.rain-body` carries the `dimmed` class; no card content overflows.
  3. **Neither** (`isRaining:false`, `suspect:false`): no banner, no overlay, no
     dim; card contained.
  Plus a card-does-not-grow check: card `scrollHeight ≤ clientHeight + 1px`
  (a fixed **±1px** tolerance to absorb sub-pixel rounding — not an open-ended
  slack). Plus a **legibility assertion** (FR-008): the `.rain-fault-title` and the
  `.rain-now-text` computed `font-size` is ≥ **13px** (the established cue text
  size today — guards against a legibility regression).
- **Rationale**: The 008 regression had correct DOM/text but escaped the
  `overflow:hidden` card only at real rendered dimensions — DOM-presence unit
  tests structurally cannot catch it (FR-011). The guard reuses the proven
  bounding-box containment approach already in the suite.
- **Fixtures**: Add `rainingSnapshot` (isRaining true, suspect false) and
  `faultSnapshot` (suspect true, with a `rainSensorReason`, plus a long-reason
  variant for the wrap edge case) to
  [apps/web/e2e/fixtures.ts](../../apps/web/e2e/fixtures.ts); route them per-test with
  the existing `mockLatest` helper. The base `latestSnapshot` already has
  `isRaining:true` / `suspect:false` (covers state 1 in the populated suite).

## TDD sequence (Red → Green)

1. Write unit assertions in `rainfall.test.ts`: banner is a descendant of
   `.rain-main` and precedes `.rv`; overlay present/centered-markup when suspect
   and body has `dimmed`; overlay absent + no dim when not suspect; mutual
   exclusion; empty/missing reason still renders icon+title. Verify **Red**.
2. Write/verify `index.test.ts` wiring (snapshot suspect/reason → renderRainfall)
   still asserts the new structure. Verify **Red** where behavior changed.
3. Add Playwright guard + fixtures. Verify **Red** (fails on current full-width
   banner / inline block).
4. Implement `rainfall.ts` + `styles.css` minimally to Green.
5. `npm run test:coverage` (100%) + `npm run typecheck` + `npm run test:e2e`.

## Consolidated decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Banner as first child of `.rain-main`, above `.rv` | Pushes only Daily Rain down; droplet & Totals grid tracks unaffected; card can't grow |
| 2 | Fault = absolute `inset:0` centered overlay + `.rain-body.dimmed` | `.card` is `position:relative`+`overflow:hidden`; overlay out of flow ⇒ no growth/clip; dim signals whole-card fault |
| 3 | Suspect suppresses banner (existing guard retained) | Faulted gauge can't be trusted to report rain (FR-009) |
| 4 | Extract `buildRainingBanner` / `buildFaultOverlay` builders | SRP + DRY; no duplicated markup across branches |
| 5 | Playwright containment guard at kiosk viewport, 3 states | DOM-presence tests missed the original overflow (FR-011) |
