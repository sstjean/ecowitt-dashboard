# Tasks: Home-Screen Install Support (PWA) (015)

**Input**: Design documents from `/specs/015-pwa-install/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/manifest.contract.md](contracts/manifest.contract.md), [contracts/edge-assets.contract.md](contracts/edge-assets.contract.md), [quickstart.md](quickstart.md)

**GitHub Issues (source of truth)**: Feature [#66](https://github.com/sstjean/ecowitt-dashboard/issues/66) (parent) · US1 [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67) (P1)

**Tests**: REQUIRED. TDD is non-negotiable for this feature — every automatable unit is a Red-first structural Vitest check, then made Green, at 100% coverage. Live iOS install is the constitution-sanctioned manual carve-out.

**Organization**: One P1 user story (US1). All work is edge/deployment files under `apps/web` only — shared `apps/web/src/` is never modified (FR-012).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1)
- Exact file paths are included in each task

## Scope note

This is a small edge-file-only slice: one manifest, five committed icon files, one
Pillow generator, six additive `<head>` tags + a favicon link, one nginx location
block, and their structural tests. No shared `src/` change, no service worker, no
new web runtime dependency.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Home for the structural PWA test suite.

- [x] T001 Create the structural PWA test folder `apps/web/tests/pwa/` (Vitest already globs `tests/**/*.test.ts` per `apps/web/vitest.config.ts`; no config change needed).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The committed icon generator that produces the icon assets US1 depends on. Blocks the icon-generation task in US1.

**⚠️ CRITICAL**: The generator must exist before the icons can be generated and committed.

- [x] T002 Create the deterministic icon generator `apps/web/scripts/make-icons.py` (Pillow) that emits, into `apps/web/public/`, the full-bleed/opaque Clawpilot-palette assets: `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-512-maskable.png` (512×512, glyph inside the maskable safe zone), `apple-touch-icon.png` (180×180), and `favicon.ico` — field `#3d3b3a`, coral glyph `#fd8ea1`, surface `#292929`, no transparency (FR-010, FR-011). This is a build-time edge asset excluded from the web app coverage gate (coverage `include` is `src/**/*.ts` only); do NOT run it yet.

**Checkpoint**: Generator ready — US1 can begin.

---

## Phase 3: User Story 1 - Family member installs the dashboard to a home screen (Priority: P1) 🎯 MVP

**Maps to**: [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67)

**Goal**: Ship the service-worker-free install surface so a family member (or the Surface kiosk) can "Add to Home Screen" and launch the dashboard full-screen with the correct name, icon, and theme color over LAN HTTP.

**Independent Test**: On iOS Safari at `http://<box-ip>:8090`, use **Add to Home Screen**, launch the icon, and confirm full-screen launch (no browser chrome) with the branded name/icon/theme and no registered service worker (per [quickstart.md](quickstart.md) §3).

### Tests for User Story 1 (write FIRST, confirm they FAIL) ⚠️

> Constitution TDD: author each test Red, confirm failure, then create the asset/config to turn it Green. Each test reads only committed static assets — no device, no network (Test Data Separation).
>
> **AAA (constitution IV):** every `tests/pwa/*.test.ts` case MUST use the Arrange-Act-Assert structure with explicit `// Arrange`, `// Act`, `// Assert` comments (sections omitted only when genuinely empty).

- [x] T003 [P] [US1] Write FAILING `apps/web/tests/pwa/manifest.test.ts`: JSON-parse `apps/web/public/manifest.webmanifest` and assert `display === "standalone"`, `theme_color === background_color === "#3d3b3a"`, `start_url === "/"`, non-empty `name` and `short_name`, and an `icons[]` containing a 192×192 png, a 512×512 png, and a 512×512 png with `purpose` including `maskable`; assert every `icons[].src` resolves to a file under `apps/web/public/` (per [contracts/manifest.contract.md](contracts/manifest.contract.md)).
- [x] T004 [P] [US1] Write FAILING `apps/web/tests/pwa/head-tags.test.ts`: read `apps/web/index.html` and assert the six additive `<head>` tags — `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#3d3b3a">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style">` (non-empty content), `<meta name="apple-mobile-web-app-title">` (non-empty content), `<link rel="apple-touch-icon">` (href → touch icon) — plus assert the pre-existing SPA elements (`<div id="app">`, `<script src="/src/bootstrap.ts">`, stylesheet link, viewport meta, `<title>`) are still present/unchanged (additive-only guard, per [contracts/edge-assets.contract.md](contracts/edge-assets.contract.md) Part A).
- [x] T005 [P] [US1] Write FAILING `apps/web/tests/pwa/icons.test.ts`: assert `apps/web/public/{icon-192.png,icon-512.png,icon-512-maskable.png,apple-touch-icon.png,favicon.ico}` exist, are valid PNGs at their declared dimensions, and are **opaque/full-bleed** (no alpha channel, or a fully-opaque alpha across all pixels); assert the **Clawpilot palette** — sample a corner/field pixel and assert it is the field `#3d3b3a`, and assert the coral glyph color `#fd8ea1` is present among the icon's pixels (FR-011 palette, closing analyze C1); and assert the committed generator `apps/web/scripts/make-icons.py` exists (FR-010, closing analyze C2) (FR-009, FR-010, FR-011; [data-model.md](data-model.md) Entity 2).
- [x] T006 [P] [US1] Write FAILING `apps/web/tests/pwa/nginx-content-type.test.ts`: read `apps/web/nginx.conf` and assert a `location = /manifest.webmanifest` block that sets `default_type application/manifest+json;` and uses `try_files $uri =404;`, and that the existing `location /` SPA fallback and `location /api/` proxy blocks are still present/unchanged (per [contracts/edge-assets.contract.md](contracts/edge-assets.contract.md) Part B).
- [x] T007 [P] [US1] Write `apps/web/tests/pwa/no-service-worker.test.ts`: scan `apps/web/src`, `apps/web/public`, and `apps/web/index.html` and assert NO `serviceWorker.register(` occurrence and NO `sw.js`/`service-worker.js` file anywhere (FR-008; [contracts/edge-assets.contract.md](contracts/edge-assets.contract.md) Part C). Standing regression guard — it passes on arrival (no SW exists); it exists so a future stray registration cannot silently land.
- [x] T008 [US1] Run `npm run test` in `apps/web` and confirm RED: `manifest.test.ts`, `head-tags.test.ts`, `icons.test.ts`, and `nginx-content-type.test.ts` FAIL (assets/config not yet created); `no-service-worker.test.ts` passes (standing guard). Do not proceed to implementation until Red is verified.

### Implementation for User Story 1 (turn each test Green)

- [x] T009 [P] [US1] Create `apps/web/public/manifest.webmanifest` with `name`, `short_name`, `display: "standalone"`, `theme_color`/`background_color` `#3d3b3a`, `start_url: "/"`, and the 192 / 512 / 512-maskable `icons[]` entries pointing at the committed PNGs → turns `manifest.test.ts` GREEN (FR-001..FR-005).
- [x] T010 [P] [US1] Run `python scripts/make-icons.py` from `apps/web` (using T002's generator) and commit the produced `apps/web/public/{icon-192.png,icon-512.png,icon-512-maskable.png,apple-touch-icon.png,favicon.ico}` → turns `icons.test.ts` GREEN (FR-009, FR-010, FR-011).
- [x] T011 [P] [US1] Edit `apps/web/index.html` to add ONLY the six additive `<head>` tags plus the `<link rel="icon" href="/favicon.ico" sizes="any">` favicon link — no structural/body change to the SPA mount → turns `head-tags.test.ts` GREEN (FR-007, FR-013).
- [x] T012 [P] [US1] Edit `apps/web/nginx.conf` to add the `location = /manifest.webmanifest { default_type application/manifest+json; try_files $uri =404; }` block, leaving the `location /` SPA fallback and `location /api/` proxy untouched → turns `nginx-content-type.test.ts` GREEN (FR-006).
- [x] T013 [US1] Run `npm run test` in `apps/web` and confirm the entire `tests/pwa/*` suite (and the full web suite) is GREEN.

**Checkpoint**: US1 is fully functional and independently testable — the install surface is complete and structurally verified.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Full gates, kiosk regression proof, live-device QA, and issue sync.

- [x] T014 Run the full web gates in `apps/web`: `npm run test:coverage` (100% statements/branches/functions/lines) and `npm run typecheck` (tsc parity with CI) — both clean.
- [x] T015 Run the Playwright e2e suite in `apps/web` and confirm the kiosk `2160×1308` viewport still passes and is visually unaffected by the additive `<head>` tags (FR-013 / AC #6 / SC-005).
- [ ] T016 Manual QA (NOT in CI): perform the live iOS "Add to Home Screen" verification against the production nginx build per [quickstart.md](quickstart.md) §3 — confirm full-screen launch, branded name/icon/theme, `curl -sI .../manifest.webmanifest` shows `application/manifest+json`, and no active service worker (AC #2/#3/#4, SC-001/SC-003/SC-004).
- [ ] T017 Sync task/acceptance completion state into GitHub issues [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67) (US1) and [#66](https://github.com/sstjean/ecowitt-dashboard/issues/66) (parent feature).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. The icon generator (T002) blocks icon generation (T010).
- **User Story 1 (Phase 3)**: Depends on Setup + Foundational. Tests (T003–T007) → verify Red (T008) → implementation (T009–T012) → verify Green (T013).
- **Polish (Phase 4)**: Depends on US1 being complete and Green.

### Within User Story 1

- Red-first: T003–T007 (tests) MUST be written and T008 MUST confirm failure before any of T009–T012.
- T010 (generate icons) depends on T002 (generator) and T005 (Red icon test).
- T009–T012 touch independent files (manifest / public icons / index.html / nginx.conf) and can run in parallel once Red is verified.
- T013 (verify Green) depends on T009–T012 all complete.

### Parallel Opportunities

- **Red test authoring**: T003, T004, T005, T006, T007 are all different files → run in parallel.
- **Green implementation**: T009 (manifest), T010 (icons), T011 (index.html), T012 (nginx.conf) are all different files → run in parallel after T008.

---

## Parallel Example: User Story 1

```bash
# Author all Red structural tests together (Phase 3, before verifying Red):
Task T003: manifest.test.ts   → apps/web/tests/pwa/manifest.test.ts
Task T004: head-tags.test.ts  → apps/web/tests/pwa/head-tags.test.ts
Task T005: icons.test.ts      → apps/web/tests/pwa/icons.test.ts
Task T006: nginx-content-type.test.ts → apps/web/tests/pwa/nginx-content-type.test.ts
Task T007: no-service-worker.test.ts  → apps/web/tests/pwa/no-service-worker.test.ts

# After T008 confirms Red, create all assets/config together:
Task T009: apps/web/public/manifest.webmanifest
Task T010: run make-icons.py → apps/web/public/*.png + favicon.ico
Task T011: apps/web/index.html additive <head> tags
Task T012: apps/web/nginx.conf manifest content-type block
```

---

## Implementation Strategy

### MVP (US1 is the entire feature)

1. Phase 1: Setup — create `tests/pwa/`.
2. Phase 2: Foundational — create `make-icons.py`.
3. Phase 3: US1 — Red tests → verify Red → create manifest/icons/head-tags/nginx → verify Green.
4. **STOP and VALIDATE**: full gates (T014–T015), then manual iOS QA (T016).
5. Sync issues (T017). Ship.

### Notes

- `[P]` tasks = different files, no dependencies.
- `make-icons.py` is a committed human-run generator excluded from the app coverage gate; generated icons are committed so the container build never runs Pillow.
- All changes are confined to `apps/web` edge/deployment files; `apps/web/src/` is never modified (FR-012).
- Commit after each task or logical group; verify Red before Green (constitution TDD).
