# Render Contract: `renderRainfall` DOM/State Contract (010)

**Feature**: `010-rainfall-cue-layout` | **Date**: 2026-07-01

There is **no API/HTTP contract change** in this feature. The relevant "contract"
is the **render contract** of `renderRainfall` — the DOM structure, attributes,
CSS class hooks, and per-state guarantees that unit and e2e tests assert against.
This document is the source of truth for those assertions.

## Signature (unchanged)

```ts
renderRainfall(container: HTMLElement, data: RainData): void
```

`RainData` fields are unchanged (see [data-model.md](../data-model.md)). Behavior:
`renderRainfall` replaces `container`'s children with the rainfall card contents.

## Stable selector hooks (tests depend on these)

| Selector / attribute | Meaning | Change from 008 |
|----------------------|---------|-----------------|
| `[data-rain-daily]` | Daily Rain value span | unchanged |
| `[data-rain-rate]` | Rain-rate value span | unchanged |
| `[data-rain-event\|hourly\|weekly\|monthly\|yearly]` | Totals rows | unchanged |
| `[data-drop-fill]` | Droplet fill rect | unchanged |
| `.rain-now-banner` / `[data-rain-now]` | "Raining now" cue | **now nested inside `.rain-main`**, above `.rv`; `[hidden]` when dry OR suspect |
| `.rain-main` | Middle column (value/label/rate + banner) | now also hosts the banner as first child |
| `.rain-body` | Droplet + main + grid wrapper | gains `dimmed` class when suspect |
| `.rain-fault-overlay` / `[data-rain-fault]` | Centered full-card fault overlay | **replaces** the old inline `.rain-fault` block |
| `.rain-fault-title` | "Sensor may not be reporting" title | unchanged text, now inside overlay |
| `.rain-fault-reason` / `[data-rain-fault-reason]` | `rainSensorReason` text | unchanged, now inside overlay |
| `.rain-fault-icon` | ⚠ icon | unchanged, now inside overlay |

> Note: `[data-rain-fault]` remains the fault hook but now marks the overlay
> element rather than an inline block. `[data-rain-now]` remains the banner hook.
>
> Note (T1): the Daily Rain value node carries **both** the `.rv` class and the
> `[data-rain-daily]` attribute — they identify the **same element**. Assertions
> standardize on `[data-rain-daily]`.

## Per-state contract

### State A — "Raining now" (`isRaining: true`, `rainSensorSuspect: false`)

- MUST render `.rain-now-banner[data-rain-now]` **without** the `hidden` attribute.
- The banner MUST be a **descendant of `.rain-main`** and MUST appear **before**
  the `[data-rain-daily]` value element in DOM order.
- The banner MUST contain the pulsing `.dot` and the text "Raining now".
- `.rain-body` MUST **not** carry the `dimmed` class.
- No `.rain-fault-overlay` element MUST exist.
- Layout guarantee (e2e): only `[data-rain-daily]`/`.rl` shift down vs. the dry
  baseline; `.drop-wrap` and `.rain-grid` (incl. `[data-rain-yearly]`) stay
  fully within the card box; card does not grow.

### State B — Sensor fault (`rainSensorSuspect: true`, any `isRaining`)

- MUST render exactly one `.rain-fault-overlay[data-rain-fault]` element as a
  child of the card container.
- The overlay MUST contain: `.rain-fault-icon` ("⚠"), `.rain-fault-title`
  ("Sensor may not be reporting"), and `.rain-fault-reason[data-rain-fault-reason]`
  containing `rainSensorReason` (or empty string when `null`/missing).
- The overlay MUST contain **no** timestamp element (no time text at all).
- `.rain-body` MUST carry the `dimmed` class.
- `.rain-now-banner`, if present in the DOM, MUST have the `hidden` attribute
  (banner suppressed); it MUST NOT be visible.
- Layout guarantee (e2e): overlay is centered over the card (mid-x within tol of
  card mid-x; mid-y within tol of card mid-y) and fully contained; dimmed body
  content does not overflow; card does not grow. A long `rainSensorReason`
  wraps/clips **inside** the overlay, never growing the card.

### State C — Dry / neither (`isRaining: false`, `rainSensorSuspect: false`)

- `.rain-now-banner` MUST have the `hidden` attribute (or be absent), not visible.
- No `.rain-fault-overlay` MUST exist; `.rain-body` MUST NOT be `dimmed`.
- `[data-rain-daily]` MUST sit in its normal (un-pushed) position.

## Mutual-exclusion contract

For all inputs: it MUST NOT be possible for a **visible** `.rain-now-banner` and a
`.rain-fault-overlay` to coexist. `rainSensorSuspect: true` always wins.

## Coverage / test mapping

| Requirement | Verified by |
|-------------|-------------|
| FR-002, FR-003, SC-002 | `rainfall.test.ts` (banner nested in `.rain-main`, precedes value) + e2e State A containment |
| FR-004 | `rainfall.test.ts` (dry ⇒ banner hidden, value normal) |
| FR-005, FR-006 | `rainfall.test.ts` (overlay markup + body `dimmed`) + e2e State B centered/contained |
| FR-007, SC-004 | `rainfall.test.ts` (no time element / no UTC string in overlay) |
| FR-009, SC-005 | `rainfall.test.ts` (suspect+raining ⇒ overlay only, banner hidden) |
| FR-010, SC-001, SC-003, SC-006 | Playwright containment guard (3 states) + card-no-grow check |
| FR-008 | Playwright guard: `.rain-fault-title` + `.rain-now-text` computed `font-size` ≥ 13px (established cue size, automated); perceptual legibility via manual quickstart T026 + prod verify T029 |
| FR-011, SC-007 | Playwright guard exists at kiosk viewport; suites at 100% coverage |
| FR-001 | `index.test.ts` (snapshot suspect/reason → renderRainfall, no contract change) |
| Edge: empty/missing reason | `rainfall.test.ts` (overlay renders icon+title with empty reason) |
| Edge: long reason | Playwright guard (long-reason fixture stays contained) |
