# Implementation Plan: Home-Screen Install Support (PWA) (015)

**Branch**: `015-pwa-install` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-pwa-install/spec.md`

**GitHub Issues**: Feature [#66](https://github.com/sstjean/ecowitt-dashboard/issues/66) (parent) · User Story [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67) (US1, P1)

## Summary

Make the LAN weather dashboard ([apps/web](../../apps/web), a Vite SPA served by
nginx over plain LAN HTTP) installable to an iPhone/iPad (and the Surface kiosk)
home screen as a **service-worker-free** Progressive Web App, so a family member
can tap an icon and launch the dashboard full-screen like a native app with the
correct name, icon, and theme color.

**Technical approach** (all decisions fixed in [research.md](research.md) — not
re-opened here): add a static web manifest, a committed set of full-bleed
Clawpilot-themed icons, six additive `<head>` tags, and a one-line nginx
content-type block. **No service worker** (deliberate — the box only serves LAN
HTTP and a service worker needs HTTPS; offline caching is a non-goal). Every
change lives in **edge / deployment files only**; shared dashboard `src/`
rendering logic is never touched.

Concretely:

- **NEW** [apps/web/public/manifest.webmanifest](../../apps/web/public/manifest.webmanifest) — `display: standalone`, `theme_color`/`background_color` `#3d3b3a`, `name`/`short_name`, and a 192 + 512 + 512-maskable `icons[]`.
- **NEW** icon assets under [apps/web/public/](../../apps/web/public/) — `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` (180×180), `favicon.ico`.
- **NEW** [apps/web/scripts/make-icons.py](../../apps/web/scripts/make-icons.py) — deterministic Pillow generator; its outputs are committed so the container build never runs Pillow.
- **MODIFY** [apps/web/index.html](../../apps/web/index.html) — six additive `<head>` tags only (manifest link, `theme-color`, three `apple-mobile-web-app-*` metas, `apple-touch-icon`, plus a favicon link). No structural/body change.
- **MODIFY** [apps/web/nginx.conf](../../apps/web/nginx.conf) — add `location = /manifest.webmanifest { default_type application/manifest+json; try_files $uri =404; }`.

Testable surface = **static/structural** Vitest checks (parse the manifest,
assert the `<head>` tags, assert no service worker, assert opaque full-bleed
icons, assert the nginx block). Live iOS install is **manual QA**, never in CI.

## Technical Context

**Language/Version**: TypeScript 5.x for the web app (build/preview via Vite);
static JSON/HTML/nginx config for the shipped assets; Python 3.x + Pillow for the
build-time icon generator (an edge asset, not shipped runtime code).

**Primary Dependencies**: Vite (build/preview), Vitest + jsdom (unit),
Playwright (e2e), nginx (production static serving). Pillow is used **only** by
`make-icons.py` at author time — it is not a runtime or container-build
dependency (icons are committed). No new web runtime dependency is added.

**Storage**: N/A. This feature ships static edge assets and config only. No
database, no persisted state, no live-telemetry path is involved.

**Testing**: Vitest structural tests under [apps/web/tests/](../../apps/web/tests/)
that read the **committed** static assets (manifest JSON, `index.html`,
`nginx.conf`, icon PNGs) and assert their shape — deterministic, no device, no
network (Test Data Separation honored). Live "Add to Home Screen" on iOS Safari
(AC #3 / SC-001) is **manual QA** documented in [quickstart.md](quickstart.md)
and never automated in CI.

**Target Platform**: iOS Safari on family iPhones/iPads over LAN HTTP
(`http://<box-ip>:8090`), plus the always-on Surface kiosk. Production serving is
nginx in the web container; the family installs from the production origin.

**Project Type**: Web (monorepo). This slice touches **only** `apps/web`, and
within it only edge/deployment files — never `apps/web/src/`.

**Performance Goals**: N/A. No new network calls, no polling, no runtime code
path. The manifest and icons are small static assets served once at install time;
the additive `<head>` tags are inert metadata.

**Constraints**: Service-worker-free (FR-008); edge-files-only, no shared `src/`
change (FR-012); icons full-bleed / no transparency in the Clawpilot palette
(FR-011); additive `<head>` tags must not alter the kiosk iframe rendering at
2160×1308 (FR-013); manifest must be served `application/manifest+json` (FR-006).

**Scale/Scope**: One manifest, five committed icon files, one generator script,
six `<head>` tag lines, one nginx location block, and their structural tests. No
historical/large-data concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | The minimal install surface: static manifest + icons + additive meta + one nginx line. No service worker, no `vite-plugin-pwa`, no build-time codegen, no shared-build change. |
| II. YAGNI | ✅ PASS | No offline caching, no install-prompt UX, no Android polish, no native packaging — all explicit Non-Goals. Ships exactly what "put an icon on the home screen over LAN HTTP" requires. |
| III. Single Responsibility | ✅ PASS | Manifest describes the app; icons render the mark; `make-icons.py` only generates icons; `index.html` metas only declare install hints; nginx block only sets one content-type. Each edge file has one reason to change. |
| IV. TDD + 100% Coverage | ✅ PASS | Automatable units are static/structural Vitest checks written Red-first (parse manifest, assert `<head>` tags, assert no SW, assert opaque icons + Clawpilot palette, assert generator exists, assert nginx block). This slice adds **no production code paths** — only static assets + config + HTML meta — so the structural tests fully cover the shippable surface. **Explicit coverage carve-out (analyze C3):** `make-icons.py` is a build-time, human-run Python generator whose outputs are committed; it is deliberately excluded from the web app's 100% coverage gate. This is a *policy* carve-out, not merely an accident of the vitest `coverage.include: src/**/*.ts` (TypeScript-only) config — it follows the established repo precedent that `scripts/*.py` build/analysis tools are not under the TS coverage gate. Its *existence* is asserted by `icons.test.ts` (FR-010). Live iOS install is the constitution-sanctioned manual carve-out. |
| Test Data Separation | ✅ PASS | Tests read only committed static assets (manifest, HTML, nginx.conf, PNGs) — never live gateway data, never the network. Deterministic and CI-safe. |
| Offline-First, Not Offline-Only | ✅ PASS | Core poller→store→API→UI still needs no internet. This feature adds an install shell, not an offline layer; declining a service worker keeps the LAN-HTTP model intact (a SW would *require* HTTPS we don't have). |
| Security / LAN-Trust | ✅ PASS | No new auth, no secrets, no cloud, no VLAN pinhole. Same-origin static assets over the existing LAN HTTP surface; no HTTPS introduced. |
| Local Type-Checking Parity | ✅ PASS | `npm run typecheck` in `apps/web` already runs `tsc`; this feature adds no TypeScript, and the structural tests are plain typed Node reads. |
| Web layer only | ✅ PASS | FR-012: confined to `apps/web` edge files; no API, poller, shared, contract, or data-model change. |

**Result**: PASS. No violations; the Complexity Tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-pwa-install/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — 6 fixed technical decisions (input)
├── data-model.md        # Phase 1 output — manifest schema + icon set as "entities"
├── quickstart.md        # Phase 1 output — manual iOS QA + run generator + run tests
├── contracts/
│   ├── manifest.contract.md    # Required manifest fields/shape + icon entries
│   └── edge-assets.contract.md # Additive <head> tags + nginx content-type block
├── spec.md              # Feature spec (input)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── index.html                        # MODIFY — six additive <head> tags only
├── nginx.conf                        # MODIFY — add manifest content-type location block
├── public/                           # NEW static edge assets (served at site root)
│   ├── manifest.webmanifest          # NEW — web app manifest (JSON)
│   ├── icon-192.png                  # NEW — 192×192 any-purpose icon
│   ├── icon-512.png                  # NEW — 512×512 any-purpose icon
│   ├── icon-512-maskable.png         # NEW — 512×512 purpose:"maskable" icon
│   ├── apple-touch-icon.png          # NEW — 180×180 iOS home-screen icon
│   └── favicon.ico                   # NEW — browser-tab favicon
├── scripts/
│   └── make-icons.py                 # NEW — Pillow generator (committed; not run in build)
└── tests/
    └── pwa/                          # NEW — structural Vitest checks (read committed assets)
        ├── manifest.test.ts          #   parse manifest; assert fields + 192/512/512-maskable
        ├── head-tags.test.ts         #   assert the six additive <head> tags in index.html
        ├── no-service-worker.test.ts #   assert no serviceWorker.register / sw.js in tree
        ├── icons.test.ts             #   assert icon files exist + opaque full-bleed PNGs
        └── nginx-content-type.test.ts#   assert nginx.conf has the manifest content-type block
```

**Structure Decision**: Web monorepo, `apps/web` only. All divergence is confined
to edge/deployment files (`public/`, `index.html`, `nginx.conf`, `scripts/`) plus
a new `tests/pwa/` structural suite. `apps/web/src/` is not modified (FR-012).
The exact icon-file directory (`public/` root vs a subfolder) and test-folder
name are finalized in [tasks.md](tasks.md); paths above reflect the planned
layout the contracts assert against.

## Complexity Tracking

> No Constitution Check violations. This table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                   |

## Phase 0 — Research

Complete. See [research.md](research.md). Six decisions are fixed and MUST NOT be
re-opened by planning or tasks:

1. **No service worker** — LAN HTTP; iOS standalone install works without one; offline caching is a non-goal.
2. **Edge-only divergence** — mirror the proven `epcube-lan` shape; never touch shared `src/`.
3. **nginx manifest content-type** — dedicated `location = /manifest.webmanifest` forcing `application/manifest+json`.
4. **Icon art in Clawpilot design language** — full-bleed `#3d3b3a` field, coral `#fd8ea1` glyph, maskable art inside the safe zone, via committed `make-icons.py`.
5. **Testing** — static/structural Vitest checks (CI-safe); live iOS install is manual QA.
6. **favicon** — also emit/reference `favicon.ico` to kill the tab 404 with a branded mark.

No `NEEDS CLARIFICATION` remain.

## Phase 1 — Design & Contracts

- **[data-model.md](data-model.md)** — models the three static "entities": the
  Web App Manifest schema, the PWA Icon Set, and the Additive `<head>` Metadata,
  with fields, required values, and validation rules mapped to FRs.
- **[contracts/manifest.contract.md](contracts/manifest.contract.md)** — the
  required manifest JSON shape (fields, exact color values, and the mandatory
  192 / 512 / 512-maskable icon entries) that the structural test asserts.
- **[contracts/edge-assets.contract.md](contracts/edge-assets.contract.md)** —
  the six additive `<head>` tags contract and the nginx `application/manifest+json`
  content-type block contract, plus the standing "no service worker" invariant.
- **[quickstart.md](quickstart.md)** — how to run `make-icons.py`, run the
  structural tests, and perform the manual iOS "Add to Home Screen" QA.
- **Agent context** — `.github/copilot-instructions.md` SPECKIT block is updated
  to reference this plan.

## Phase 2 — Tasks (not produced here)

`/speckit.tasks` will decompose this into Red-first structural tests + asset/config
creation tasks. Command ends after Phase 1 design.
