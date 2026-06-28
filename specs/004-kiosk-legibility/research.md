# Research: Wall-Kiosk Legibility

**Feature**: 004-kiosk-legibility · **Date**: 2026-06-26

This feature is a front-end-only change in `apps/web` (CSS + a bundled font asset
+ an index.html preload). The decisions below lock the approach before planning.

## Current-state findings (from `apps/web/src/styles.css` + renderers)

- **Font stack** (`styles.css` body): `"Segoe UI", Aptos, Calibri, -apple-system,
  BlinkMacSystemFont, sans-serif`. None of the first four exist on Linux, so the
  Ubuntu/Chromium kiosk resolves the generic `sans-serif` (DejaVu/Ubuntu) — a
  different, muddier face than the macOS design.
- **Only one breakpoint**: `@media (max-width: 900px)` (phone). There is **no
  large-screen/kiosk tier**, so on the 2160-wide Surface the layout uses the
  default desktop sizes.
- **`clamp()` ceilings cap growth on big screens.** Key readouts use
  `clamp(min, vw, MAX)`; at 2160px the `vw` term exceeds the cap so they are
  pinned at the ceiling:
  - outdoor ring big: `clamp(34px, 5.2vw, 58px)` → pinned 58px
  - condition glyph (`.cond-glyph`): `clamp(44px, 5.5vw, 72px)` → pinned 72px
  - wind speed: `clamp(26px, 3.4vw, 38px)` → pinned 38px
  - rain value: `clamp(30px, 3.6vw, 44px)` → pinned 44px
  - droplet width (`.drop-wrap`): `clamp(74px, 9vw, 112px)` → pinned 112px
- **Fixed-px secondary text** never scales: `.glabel` 11px, `.metric .m-val`
  18px, `.metric .m-lbl` 10px, `.cond-label` 13px, `.ring-center .hl` 13px,
  rain labels 11–12px, badges 9px.
- **Low-contrast tokens on `--cp-bg: #3d3b3a`**:
  - `--cp-text-muted: #919191` (heavily used for labels) ≈ borderline.
  - The **rain-drop outline** is drawn in `rainfall.ts` with
    `stroke: var(--cp-border-strong)` (#5f5f5f) at `stroke-width: 2` — the
    near-background, thin outline the reporter cannot see from 3 m.
  - Gauge `.ring .track` uses `--cp-surface-soft` (#2e2e2e) — intentionally
    subtle; the colored value arc carries the data.
  - Dividers/`border-top` use `--cp-border` (#474747).

## Decision D1 — Self-hosted font: Inter (SIL OFL), via @fontsource

- **Choice**: Inter, self-hosted by bundling the npm package
  `@fontsource-variable/inter` (variable weight) and importing it from the web
  entry so Vite fingerprints and serves it same-origin (no CDN; works offline on
  the kiosk).
- **Rationale**: Inter is an openly-licensed (OFL) UI typeface with a tall
  x-height and open apertures → strong legibility at distance and small sizes;
  ubiquitous and reproducible. A variable file covers the 400/500/600/700
  weights the app already uses in one asset.
- **Alternatives considered**: Roboto (good, slightly lower x-height → less
  legible at distance); keeping the system stack (rejected — that is the bug).
- **Fallback (FR-003)**: `"Inter Variable", "Inter", system-ui, -apple-system,
  "Segoe UI", Roboto, "Noto Sans", sans-serif` so text is never absent.
- **No-flash (FR-004)**: same-origin bundle + `<link rel="preload" as="font"
  crossorigin>` for the variable woff2; `font-display: swap`. Because the asset
  is same-origin and cached, the swap is effectively instant on the kiosk after
  first paint. Subset to `latin` to keep the asset small.

## Decision D2 — Kiosk tier: `@media (min-width: 1800px) and (min-height: 1200px)`

- **Choice**: Add a kiosk media query gated on **both** width and height tuned to
  the Surface Pro 3's 2160×1440 panel. This targets the wall display (and similar
  large, tall panels) while **excluding** ordinary 1920×1080 desktop/laptop
  monitors (1080 < 1200 tall), so developer monitors keep the normal layout.
- **Scaling approach**: within the kiosk tier, **raise the capped `clamp()`
  ceilings** and bump the fixed-px secondary sizes by ~1.3–1.5×, keeping the
  fluid `vw` term so 1800→2160 still scales smoothly (FR-006). Concretely target
  (subject to no-overflow verification at 2160×1440):
  - outdoor ring big 58 → ~88px ceiling; wind 38 → ~56px; rain value 44 → ~64px
  - condition glyph 72 → ~104px (≥1.4×, satisfies SC-002); droplet 112 → ~150px
  - `.glabel` 11 → 16px; `.m-val` 18 → 26px; `.m-lbl` 10 → 14px;
    `.cond-label` 13 → 19px; `.ring-center .hl` 13 → 18px; rain labels +~40%
  - header date/time 28 → ~38px
- **Why not a global `--ui-scale` multiplier**: the layout is a fixed,
  no-scroll 100dvh grid; a blanket multiply risks overflow. Explicit per-element
  overrides inside the kiosk query are lower-risk and easy to verify, and the
  desktop/phone layers are untouched (FR-011).
- **No-overflow (FR-008)**: enlarged sizes verified against 2160×1440 with a
  Playwright check that `document.scrollingElement.scrollHeight` ≤ viewport
  height and no element clips.

## Decision D3 — Contrast token tuning (dark theme preserved)

Background is `--cp-bg: #3d3b3a` (relative luminance ≈ 0.050). Targets follow
WCAG: ≥4.5:1 for text, ≥3:1 for large text and meaningful graphical outlines
(SC-003). Planned token moves (exact hex finalized by the contrast test):

- `--cp-text-muted` #919191 → ~**#b4b4b4** (≈4.5–4.8:1) for labels/captions.
- Rain-drop outline: switch the stroke from `--cp-border-strong` to a dedicated
  visible value (~`--cp-text-soft`/#b0b0b0, ≈4.8:1) **and** thicken
  `stroke-width` 2 → 3 for distance.
- `--cp-border-strong` #5f5f5f → ~**#8c8c8c** (≈3:1) so any structural strong
  borders read at distance.
- `--cp-border` #474747 → ~**#5a5a5a** (modest lift for dividers without making
  the design heavy; not required to hit 3:1 for hairlines).
- Gauge `.ring .track`: lift slightly (e.g. toward `--cp-border`) so the ring
  silhouette reads from distance while staying subordinate to the colored arc.
- The accent (`--cp-accent #fd8ea1`), success/danger/warning, and overall dark
  look are **unchanged** (FR-012).

## Decision D4 — Testing strategy

- **Contrast guard (automated, SC-003)**: add `apps/web/tests/contrast.test.ts`
  that extracts the relevant hex tokens from `styles.css`, computes WCAG contrast
  ratios against `--cp-bg`, and asserts the thresholds (muted/soft ≥4.5:1; drop
  outline & strong border ≥3:1). The WCAG math lives in a small, fully-covered
  helper so the 100% coverage gate holds.
- **Font resolution (SC-004)**: extend Playwright e2e to assert the computed
  `font-family` of `body` resolves to the bundled Inter face, and that the font
  asset request returns 200 same-origin.
- **Kiosk no-overflow + size (SC-001/002/005)**: a Playwright case at viewport
  2160×1440 asserting no vertical scroll, and that the ring-big / condition-glyph
  computed `font-size` exceed the desktop ceilings.
- **No regression (SC-006)**: existing phone/desktop e2e and unit snapshots stay
  green; the kiosk styles are additive behind the new media query.
- **Gates (SC-007)**: `npm run typecheck`, web `test:coverage` at 100%, and the
  Playwright suite all pass.

## Decision D5 — Build & serving

- Add `@fontsource-variable/inter` to `apps/web` deps; import it once in the web
  entry (`src/main.ts`/equivalent) so Vite bundles + fingerprints the woff2.
- Add a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the
  primary woff2 in `index.html`.
- `nginx.conf` already serves hashed assets; confirm woff2 is served with a
  long-cache header and correct MIME (add if missing).

## Open questions / assumptions carried forward

- Exact kiosk hex values are finalized by the contrast test (D3 targets are the
  floor). 
- The Surface was unreachable during research (ssh timeout); sizes are derived
  from its known native 2160×1440 panel and verified in-browser at that viewport
  rather than on-device. On-device confirmation happens at deploy/verify.
