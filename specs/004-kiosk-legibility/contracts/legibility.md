# Contract: Legibility Guarantees

**Feature**: 004-kiosk-legibility · **Date**: 2026-06-26

Observable, testable guarantees the build MUST uphold. Each maps to spec FRs/SCs
and is enforced by the test named in brackets.

## C1 — Self-hosted font resolves cross-platform (FR-001/002/004, SC-004)

- `body`'s resolved `font-family` MUST include the bundled Inter face as the
  first available family, not the generic `sans-serif`. [e2e: computed-style]
- The font asset MUST be served same-origin and return HTTP 200 (no CDN, no OS
  dependency). [e2e: network request]
- No flash of a different face after load on the kiosk (preload + same-origin
  bundle). [manual/visual at verify]

## C2 — Contrast thresholds (FR-009/010, SC-003)

Against `--cp-bg` #3d3b3a:

- `--cp-text-muted` and `--cp-text-soft` MUST be ≥ 4.5:1.
- The rain-drop outline color MUST be ≥ 4.5:1 and drawn at `stroke-width` ≥ 3.
- `--cp-border-strong` MUST be ≥ 3:1.
- The accent and status colors MUST be unchanged from the pre-feature values.
  [unit: `contrast.test.ts` — parses tokens from `styles.css`, computes WCAG
  ratios via the covered `contrast.ts` helper]

## C3 — Kiosk enlargement (FR-005/006/007, SC-001/002)

At viewport 2160×1440:

- `.ring-center .big` computed `font-size` MUST exceed the desktop ceiling
  (> 58px). [e2e]
- `.cond-glyph` computed `font-size` MUST be ≥ 1.3× its desktop ceiling
  (≥ ~94px). [e2e]
- Enlargement MUST scale with the viewport (fluid), not a single abrupt switch —
  verified by the `clamp()` form retaining a `vw` term. [review + e2e sampling]

## C4 — No-scroll / no-clip at kiosk size (FR-008, SC-005)

At viewport 2160×1440:

- `document.scrollingElement.scrollHeight` MUST be ≤ the viewport height (no
  vertical scroll). [e2e]
- No primary panel element overflows its container (no clipped readouts). [e2e +
  screenshot]

## C5 — No regression on phone/desktop (FR-011, SC-006)

- At ≤900px and at ordinary desktop widths (below the kiosk threshold), the
  computed sizes of the sampled selectors MUST equal their pre-feature values.
  [e2e at desktop + existing phone e2e stay green]

## C6 — Design language preserved (FR-012)

- Dark theme, accent `--cp-accent`, and overall layout MUST be visually
  unchanged apart from size/contrast. [screenshot review]

## C7 — Gates (SC-007)

- `npm run typecheck` clean; `apps/web` `test:coverage` at 100%; Playwright e2e
  suite green. [CI]
