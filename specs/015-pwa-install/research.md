# Research — Feature 015: Home-Screen Install Support (PWA)

**Branch**: `015-pwa-install` · **Feature**: [#66](https://github.com/sstjean/ecowitt-dashboard/issues/66) · **US1**: [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67)

This document records the technical decisions behind the spec so the plan/tasks
can proceed without re-litigating them.

## Decision 1 — No service worker (service-worker-free PWA)

**Decision**: Ship the install surface with **no** service worker.

**Rationale**:
- A service worker requires a *secure context* (HTTPS). The dashboard is served over
  LAN **HTTP** at `http://192.168.10.5:8090`; localhost is the only HTTP exception and
  the kiosk/phones do not hit it via localhost.
- iOS "Add to Home Screen" + `display: standalone` full-screen launch works over plain
  HTTP **without** a service worker. The only capability a service worker would add here
  is offline caching, which is a non-goal (the box and clients are on the same LAN; the
  data is live telemetry that is useless when stale/offline).
- Constitution Principles I (Simplicity) and II (YAGNI): don't build the offline layer
  nobody asked for and that we can't even serve securely.

**Alternatives considered**:
- `vite-plugin-pwa` / Workbox: rejected — pulls in a service worker + build-time codegen,
  needs HTTPS to function, and would touch the shared build. Overkill for "put an icon on
  the home screen."
- Manual minimal service worker: rejected — same HTTPS requirement, more moving parts.

## Decision 2 — Edge-only divergence (no shared `src/` changes)

**Decision**: Confine every change to edge/deployment files:
`apps/web/public/manifest.webmanifest`, icon assets under `apps/web/public/`, additive
`<head>` tags in `apps/web/index.html`, an nginx manifest content-type block in
`apps/web/nginx.conf`, and a generator `apps/web/scripts/make-icons.py`.

**Rationale**: Mirrors the proven pattern in the sibling `epcube-lan` app (its Feature 182 /
US3), which shipped exactly this shape. Keeps the diff auditable, avoids any risk to the
dashboard rendering logic, and keeps parity guarantees intact. `index.html` in this repo is
already a hand-authored edge file (it hosts the SPA mount points directly), so additive
`<head>` tags are natural there.

**Reference implementation** (`~/repos/epcube-lan/dashboard/`):
- `public/manifest.webmanifest` — `display: standalone`, theme/background color, name/short_name, 192 + 512 + 512-maskable icons.
- `index.html` `<head>` — `<link rel="manifest">`, `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `apple-touch-icon`.
- `nginx.conf` — `location = /manifest.webmanifest { default_type application/manifest+json; try_files $uri =404; }`.
- `scripts/make-icons.py` — Pillow generator emitting `icon-512.png`, `icon-192.png`, `apple-touch-icon.png` (180), `favicon.ico`.

## Decision 3 — nginx manifest content-type

**Decision**: Add a dedicated `location = /manifest.webmanifest` block forcing
`default_type application/manifest+json;` with `try_files $uri =404;`.

**Rationale**: nginx's default mime map does not know the `.webmanifest` extension and would
serve it as `application/octet-stream`, which some browsers ignore. The exact-match location
avoids interfering with the existing `location /` SPA fallback and `/api/` proxy. In dev,
Vite already serves files from `public/` with a correct-enough type; the nginx block governs
the production container (the environment the family actually installs from).

## Decision 4 — Icon art in the Clawpilot design language

**Decision**: Generate full-bleed icons on the Clawpilot warm-dark field `#3d3b3a` with a
coral `#fd8ea1` weather glyph, via a committed `make-icons.py` (Pillow). Match our theme,
not epcube's navy/lightning bolt.

**Palette** (from `apps/web/src/styles.css` `:root`):
- Field / theme / background: `--cp-bg` `#3d3b3a`
- Accent glyph: `--cp-accent` `#fd8ea1` (coral)
- Secondary/surface: `--cp-surface` `#292929`
- `color-scheme: dark`

**Glyph**: a simple, legible weather mark (sun / sun-behind-cloud) rendered in coral on the
dark field. Meaningful art stays inside the maskable safe zone (center ~80%) so aggressive OS
masking on the 512-maskable variant does not clip it. Full-bleed background (no alpha) so iOS,
which masks its own rounded corners and turns transparency black, looks clean.

**Outputs**: `icon-512.png`, `icon-192.png`, `icon-512-maskable.png`, `apple-touch-icon.png`
(180×180), `favicon.ico` — all committed so the container build never runs Pillow.

**Reproducibility**: the generator is committed and deterministic (fixed palette + vector-ish
drawing), satisfying FR-010.

## Decision 5 — Testing approach (TDD, 100% coverage, CI-safe)

**Decision**: The automatable units are **static / structural checks** in the web test suite:
1. JSON-parse `public/manifest.webmanifest`; assert `display: standalone`, `theme_color` /
   `background_color` = `#3d3b3a`, `name`/`short_name`, and icons (192, 512, 512-maskable).
2. Read `index.html`; assert the six additive `<head>` tags are present.
3. Scan the tree/build output; assert **no** `serviceWorker.register` and **no** `sw.js`.
4. Assert the icon files exist and are non-transparent (opaque) full-bleed PNGs.
5. Assert the nginx config contains the manifest content-type block.

**Rationale**: These run in Node/Vitest with no device and no network — deterministic and
CI-safe (Test Data Separation honored: they read committed static assets, not live data).
The live iOS "Add to Home Screen" launch (AC #3, SC-001) is **manual QA** and is never
automated in CI, consistent with the constitution's manual-testing carve-out.

**Coverage note**: `make-icons.py` is a build-time generator (an edge asset run by a human),
not shipped/production runtime code, so it is excluded from the web app coverage gate the same
way other `scripts/` generators are. The 100% coverage requirement applies to any production
code paths; this feature adds essentially no production *code* (static assets + config + HTML
meta), so the structural tests fully cover the shippable surface.

## Decision 6 — favicon

**Decision**: Also emit and reference a `favicon.ico`.

**Rationale**: Today `index.html` has no favicon, so browsers request `/favicon.ico` and 404.
The generator already produces one cheaply; adding `<link rel="icon">` removes the 404 and
gives the browser tab the branded mark. Low-cost, in-theme, and within the edge-file surface.

## Open questions / risks

- **Maskable clipping**: verify the 512-maskable glyph survives a 40% inset without clipping
  (validate with a maskable preview). Mitigated by keeping the glyph small/centered.
- **iOS caches the apple-touch-icon aggressively**: if the icon changes later, users may need
  to remove/re-add the home-screen icon. Acceptable for a first ship.
- **Dev vs prod manifest type**: only the nginx (prod) path is under our control for the
  content-type header; Vite dev serving is not asserted in CI (the family installs from prod).
