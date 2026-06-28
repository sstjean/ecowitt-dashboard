# Data Model: Wall-Kiosk Legibility

**Feature**: 004-kiosk-legibility · **Date**: 2026-06-26

No persistent data entities change. The "model" here is the set of CSS design
tokens and the kiosk-tier size map. Exact hex/size values are floors; the
contrast test (SC-003) enforces the ratio thresholds.

## Entity 1 — Design tokens (`:root` in `styles.css`)

| Token | Current | New (target) | Why | Contrast vs `--cp-bg` #3d3b3a |
|---|---|---|---|---|
| `--cp-bg` | #3d3b3a | #3d3b3a | unchanged (reference bg) | — |
| `--cp-text` | #dedede | #dedede | already strong | ~9:1 |
| `--cp-text-soft` | #b0b0b0 | #b0b0b0 | already ≥4.5:1 | ~4.8:1 |
| `--cp-text-muted` | #919191 | **#b4b4b4** | labels/captions must hit ≥4.5:1 | ~3.3:1 → ~5:1 |
| `--cp-border` | #474747 | **#5a5a5a** | dividers more visible (not required ≥3:1 for hairlines) | lift |
| `--cp-border-strong` | #5f5f5f | **#8c8c8c** | strong borders read at distance ≥3:1 | ~1.9:1 → ~3:1 |
| `--cp-accent` & status colors | unchanged | unchanged | preserve design language (FR-012) | — |

New token (optional, for the drop + any outline that must read at distance):

| Token | Value | Use |
|---|---|---|
| `--cp-outline` | #b0b0b0 (= soft) | rain-drop stroke and similar meaningful outlines (≥4.5:1) |

## Entity 2 — Rain-drop outline (`render/rainfall.ts`)

| Property | Current | New |
|---|---|---|
| `stroke` | `var(--cp-border-strong)` (#5f5f5f) | `var(--cp-outline)` (#b0b0b0) |
| `stroke-width` | `2` | `3` |

## Entity 3 — Kiosk-tier size map

Applied **only** inside `@media (min-width: 1800px) and (min-height: 1200px)`.
Desktop/phone values are untouched (FR-011). Values keep a fluid `vw` term so
1800→2160 scales smoothly (FR-006); the ceiling is what changes.

| Selector | Desktop (current) | Kiosk (target) | ≈ factor |
|---|---|---|---|
| `.h-date`, `.h-time` | 28px | 38px | 1.36× |
| `.ring-center .big` | clamp(34px, 5.2vw, 58px) | clamp(58px, 5.2vw, 88px) | 1.52× cap |
| `.ring-wrap.ind .ring-center .big` | clamp(20px, 2.6vw, 34px) | clamp(34px, 2.6vw, 50px) | 1.47× cap |
| `.wind-center .ws` | clamp(26px, 3.4vw, 38px) | clamp(38px, 3.4vw, 56px) | 1.47× cap |
| `.rain-main .rv` | clamp(30px, 3.6vw, 44px) | clamp(44px, 3.6vw, 64px) | 1.45× cap |
| `.cond-glyph` | clamp(44px, 5.5vw, 72px) | clamp(72px, 5.5vw, 104px) | 1.44× cap (SC-002) |
| `.drop-wrap` | clamp(74px, 9vw, 112px) | clamp(112px, 9vw, 150px) | 1.34× cap |
| `.glabel` | 11px | 16px | 1.45× |
| `.metric .m-val` | 18px | 26px | 1.44× |
| `.metric .m-lbl` | 10px | 14px | 1.40× |
| `.cond-label` | 13px | 19px | 1.46× |
| `.ring-center .hl` | 13px | 18px | 1.38× |
| `.wind-center .wu`, `.gust` | 12px | 17px | 1.42× |
| `.rain-main .rl`, `.rain-rate`, `.rain-grid .rr` | 11–15px | +~40% | ~1.4× |
| `.ring .track`, `.ring .val` stroke-width | 15 | 18 | thicker rings read at distance |

All kiosk sizes are subject to the no-overflow check at 2160×1440 (FR-008,
SC-005); any value that causes clipping is reduced until the fixed 100dvh grid
contains everything.

## Entity 4 — Font face

| Aspect | Value |
|---|---|
| Family | Inter (variable), self-hosted via `@fontsource-variable/inter` |
| Stack | `"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif` |
| Subset | latin |
| Weights used | 400 / 500 / 600 / 700 (covered by the variable file) |
| Load | same-origin bundle + `<link rel="preload" as="font" crossorigin>`, `font-display: swap` |
