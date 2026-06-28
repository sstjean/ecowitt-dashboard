# Implementation Plan: Wall-Kiosk Legibility

**Branch**: `004-kiosk-legibility` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-kiosk-legibility/spec.md`

## Summary

Make the wall-mounted weather dashboard legible from ~3 m on the Surface Pro 3
(2160×1440, Ubuntu/Chromium) by: (1) self-hosting the UI font (Inter, bundled via
`@fontsource-variable/inter`) so every OS renders the same face; (2) adding a
kiosk presentation tier (`@media (min-width: 1800px) and (min-height: 1200px)`)
that raises the capped `clamp()` ceilings and bumps fixed-px secondary sizes so
gauges, readouts, and the condition icon scale up for distance; and (3) raising
the low-contrast tokens — especially the rain-drop outline (`--cp-border-strong`
#5f5f5f, width 2) — so outlines and muted text are visible from across the room.
Front-end only (`apps/web`); no API/data-model/timezone changes. Approach and
exact targets are locked in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, CSS; Node ≥22 (Vite build).

**Primary Dependencies**: Vite, `@fontsource-variable/inter` (new, self-hosted
font), Vitest, Playwright; nginx serves the built assets on the kiosk.

**Storage**: N/A (no data path touched).

**Testing**: Vitest (unit, 100% coverage gate) + Playwright (e2e acceptance).

**Target Platform**: Chromium kiosk on Ubuntu (Surface Pro 3, 2160×1440);
macOS/Windows for parity; phones (≤900px) unaffected.

**Project Type**: Web front-end (`apps/web`) in an npm-workspaces monorepo.

**Performance Goals**: No-flash font load on kiosk; fixed 100dvh no-scroll layout
preserved at 2160×1440.

**Constraints**: Offline-capable kiosk (no CDN — font bundled same-origin); dark
theme preserved; additive only (no phone/desktop regression).

**Scale/Scope**: One stylesheet (`apps/web/src/styles.css`), one renderer tweak
(`apps/web/src/render/rainfall.ts` drop stroke), one font import in the web
entry, one `index.html` preload, plus a contrast unit test and e2e additions.

## Constitution Check

*GATE: re-checked after design. Result: PASS.*

- **I. Simplicity / II. YAGNI**: Per-element overrides inside one kiosk media
  query rather than a new theming engine or global scale system. One openly
  licensed font, bundled — no font pipeline, no CDN. No new abstractions.
- **III. SRP**: The only new production TS is a pure WCAG contrast helper
  (`contrast.ts`) doing one thing (ratio math); its consumer (the test) is
  separate. No mixing of "compute" and "decide".
- **IV. TDD / 100% coverage (NON-NEGOTIABLE)**: The new contrast helper follows
  Red→Green and is fully covered by `contrast.test.ts`, which also acts as the
  automated guard for SC-003 (token ratios). CSS/visual behaviour is covered by
  Playwright acceptance tests (font resolution, kiosk no-overflow, enlarged
  sizes). Existing web unit coverage stays at 100%; existing e2e stays green.
  AAA comments used in new tests.
- **Workflow**: Dedicated branch `004-kiosk-legibility` off `main`; no direct
  commits to `main`; PR merged with a merge commit. Local `npm run typecheck`
  parity holds (no new type-checker needed).
- **Timezone**: Not touched (no date/time rendering changes).
- **Offline-first**: Strengthened — the font is now bundled same-origin instead
  of depending on OS-installed faces.

No violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/004-kiosk-legibility/
├── plan.md          # This file
├── spec.md          # Feature spec
├── research.md      # Locked decisions (D1–D5)
├── data-model.md    # Design tokens + kiosk-tier size map
├── quickstart.md    # Build/verify/deploy walkthrough
├── contracts/
│   └── legibility.md # Observable guarantees (font/contrast/size/no-scroll)
└── tasks.md         # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/
├── index.html                      # add <link rel="preload"> for the woff2
├── package.json                    # add @fontsource-variable/inter
├── src/
│   ├── main.ts                     # import the bundled font once
│   ├── styles.css                  # @font-face fallback stack, contrast tokens,
│   │                               #   drop stroke, new kiosk media query
│   ├── lib/contrast.ts             # NEW: pure WCAG contrast-ratio helper
│   └── render/rainfall.ts          # drop stroke → visible token + width 3
├── tests/
│   └── contrast.test.ts            # NEW: token contrast-ratio guard (SC-003)
└── e2e/                            # extend: font resolution, kiosk no-overflow,
                                    #   enlarged sizes (SC-001/002/004/005)
```

## Phases

- **Phase 0 — Research** (done): D1 font=Inter/self-host; D2 kiosk media query
  `min-width:1800 and min-height:1200`; D3 contrast token targets; D4 testing;
  D5 build/serving. See research.md.
- **Phase 1 — Design** (this plan): data-model.md (tokens + size map),
  contracts/legibility.md (observable guarantees), quickstart.md.
- **Phase 2 — Tasks** (`/speckit.tasks`): dependency-ordered TDD task list.
- **Phase 3 — Implement**: Red (contrast test + e2e asserts) → Green (font,
  tokens, drop stroke, kiosk tier) → verify gates.
- **Phase 4 — Verify & ship**: typecheck, web coverage 100%, Playwright; Chrome
  screenshot at 2160×1440; build, deploy to the Surface, on-wall confirmation.

## Complexity Tracking

No constitution deviations; table intentionally empty.
