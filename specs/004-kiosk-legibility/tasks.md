# Tasks: Wall-Kiosk Legibility

**Feature**: 004-kiosk-legibility · **Branch**: `004-kiosk-legibility`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

TDD order: write/confirm failing tests (Red) before production code (Green).
`[P]` = parallelizable (different files, no ordering dependency).

## Phase 1 — Setup

- **T001** Add the self-hosted font dependency: `npm --workspace apps/web install
  @fontsource-variable/inter`. Confirm it appears in `apps/web/package.json` and
  the lockfile. (FR-001, D1/D5)
- **T002** Baseline green: run `npm run typecheck`, `npm --workspace apps/web run
  test:coverage`, and `npm --workspace apps/web run test:e2e` to confirm a clean
  starting point before any change.

## Phase 2 — Red (author failing tests first)

- **T003** [P] Create the WCAG contrast helper test `apps/web/tests/contrast.test.ts`
  (AAA): import a not-yet-existing `relativeLuminance`/`contrastRatio` from
  `src/lib/contrast.ts`; assert known pairs (e.g. #000/#fff ⇒ 21:1, equal colors
  ⇒ 1:1). Confirm it FAILS (module missing). (C2, SC-003)
- **T004** [P] Extend `contrast.test.ts` to parse the real tokens from
  `apps/web/src/styles.css` and assert: `--cp-text-muted` ≥4.5:1 and
  `--cp-text-soft` ≥4.5:1 vs `--cp-bg`; the drop-outline token ≥4.5:1;
  `--cp-border-strong` ≥3:1; and that `--cp-accent` equals its current value.
  Confirm it FAILS against today's tokens. (C2, FR-009/010, SC-003)
- **T005** [P] Add e2e `apps/web/e2e/*` assertions (Red): at viewport 2160×1440,
  (a) `body` computed `font-family` first family is the Inter face;
  (b) the font asset request returns 200 same-origin;
  (c) `.ring-center .big` font-size > 58px and `.cond-glyph` ≥ ~94px;
  (d) `document.scrollingElement.scrollHeight` ≤ 1440 (no scroll).
  Confirm these FAIL on the current build. (C1/C3/C4, SC-001/002/004/005)
- **T006** Verify Red: run the unit + e2e suites and confirm the new tests fail
  for the right reasons (missing helper, low ratios, small sizes, wrong font).

## Phase 3 — Green (implement)

- **T007** Create `apps/web/src/lib/contrast.ts`: pure `relativeLuminance(hex)`
  and `contrastRatio(a, b)` (sRGB → linear → WCAG). Make T003 pass. Keep it tiny,
  single-responsibility, 100% covered. (SRP, C2)
- **T008** Import the bundled font once in the web entry (`apps/web/src/main.ts`):
  `import "@fontsource-variable/inter";`. (FR-001, D5)
- **T009** Update `apps/web/src/styles.css` `body` font stack to
  `"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto,
  "Noto Sans", sans-serif`. (FR-002/003)
- **T010** Ensure no flash of unstyled/invisible text: the bundled fontsource
  `@font-face` rules already carry `font-display: swap`, and the woff2 is served
  same-origin (no CDN), so a static fingerprint-fragile preload tag is
  intentionally omitted for simplicity. (FR-004, D5)
- **T011** Raise contrast tokens in `styles.css` `:root` to the data-model
  targets (`--cp-text-muted` #b4b4b4, `--cp-border` #5a5a5a, `--cp-border-strong`
  #8c8c8c, add `--cp-outline` #b0b0b0); leave accent/status/text unchanged. Tune
  hex until T004 passes the ratio thresholds. (FR-009, C2)
- **T012** Change the rain-drop outline in `apps/web/src/render/rainfall.ts`:
  `stroke: var(--cp-outline)` and `stroke-width: 3`. (FR-010, C2)
- **T013** Add the kiosk media query to `styles.css`
  `@media (min-width: 1800px) and (min-height: 1200px) { ... }` implementing the
  data-model size map (ring big, indoor ring, wind, rain value, cond-glyph,
  drop-wrap, glabel, m-val, m-lbl, cond-label, hl, wind units, rain labels,
  header date/time, ring stroke-width). Keep fluid `clamp()` ceilings. (FR-005/006/007)
- **T014** Make the e2e size/no-scroll assertions (T005c/d) pass; adjust any
  kiosk value that causes overflow at 2160×1440 until the grid contains
  everything. (FR-008, SC-005)

## Phase 4 — Verify

- **T015** Run `npm --workspace apps/web run test:coverage` — 100% statements/
  branches/functions/lines (contrast helper fully covered). (SC-007)
- **T016** Run `npm run typecheck` — clean. (SC-007)
- **T017** Run `npm --workspace apps/web run test:e2e` — all green, including the
  new font/size/no-scroll cases and the unchanged phone/desktop cases. (SC-006/007)
- **T018** Chrome/Playwright screenshot at 2160×1440 of the running app; visually
  confirm enlarged gauges/icon, visible drop outline, Inter face, Eastern times,
  no scroll, no console errors. Dump/inspect to confirm the drop outline reads.
  (C3/C4/C6)
- **T019** Audit: grep that no legacy font names remain as the primary family and
  no outline still uses the near-background token; confirm phone/desktop sampled
  sizes are unchanged. (FR-011, C5)

## Phase 5 — Ship

- **T020** Commit on `004-kiosk-legibility` (atomic commits: font, contrast,
  kiosk tier, tests). Push; open a PR to `main` (merge-commit on merge).
- **T021** After merge approval: build amd64 `ecowitt/web`, ship to
  192.168.10.5, `docker compose up -d web`; confirm on the wall unit (or a
  2160×1440 Chrome screenshot of http://192.168.10.5:8090/). (quickstart Deploy)

## Dependencies

- T001 → T008/T010 (font dep before import/preload).
- T003 → T007 (test before helper); T004 → T011/T012; T005 → T013/T014.
- T006 (Red verified) gates Phase 3.
- T007–T014 (Green) → T015–T019 (Verify) → T020–T021 (Ship).
