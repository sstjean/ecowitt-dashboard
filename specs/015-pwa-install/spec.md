# Feature Specification: Home-Screen Install Support (PWA) (015)

**Feature Branch**: `015-pwa-install`

**Created**: 2026-07-12

**Status**: Draft

**Input**: Make the LAN weather dashboard installable to an iPhone/iPad (and the Surface kiosk) home screen as a service-worker-free Progressive Web App, so a family member can tap an icon and launch the dashboard full-screen like a native app.

## Source of Truth

> **GitHub Issues are the source of truth for this feature. This markdown is a
> derived implementation tool. If they ever disagree, the Issues win.**

- **Parent Feature**: [#66 — Home-Screen Install Support (PWA) (015)](https://github.com/sstjean/ecowitt-dashboard/issues/66)
- **US1** (P1): [#67 — Family member installs the dashboard to an iPhone/iPad home screen](https://github.com/sstjean/ecowitt-dashboard/issues/67)

## Background — why this feature exists

The LAN weather dashboard (`apps/web`, a Vite SPA served by nginx) is reachable at
`http://192.168.10.5:8090` over plain HTTP. Today it ships **no** PWA assets: there is no
web manifest, no icons, and no Apple meta tags in [apps/web/index.html](../../apps/web/index.html).
As a result, iOS "Add to Home Screen" produces a generic Safari bookmark that opens inside
browser chrome with the wrong name and a screenshot-derived icon.

This feature adds the minimal, **service-worker-free** install surface so a family member (or
the Surface kiosk) can add the dashboard to a home screen and launch it full-screen with the
correct name, icon, and theme color — matching the proven LAN-over-HTTP install pattern.

### Why no service worker

A service worker requires a secure context (HTTPS) and the box only serves LAN HTTP. iOS
"Add to Home Screen" + full-screen `standalone` launch works fine over HTTP **without** a
service worker. Offline caching is therefore explicitly **out of scope** (it is the only thing
a service worker would buy us here, and it needs HTTPS we do not have).

### Edge-only divergence (non-negotiable)

All divergence for this feature lives in **edge / deployment files only**:

- `apps/web/public/manifest.webmanifest` (new)
- PWA icon assets under `apps/web/public/` (new, generated)
- additive `<head>` tags in [apps/web/index.html](../../apps/web/index.html)
- an nginx manifest content-type block in [apps/web/nginx.conf](../../apps/web/nginx.conf)
- a committed icon generator `apps/web/scripts/make-icons.py` (edge asset)

**Shared dashboard `src/` rendering logic is NEVER changed by this feature.**

### Design language reference (from [apps/web/src/styles.css](../../apps/web/src/styles.css))

Icon art MUST match the Clawpilot dark design language:

- `--cp-bg: #3d3b3a` — theme / background color and the icon field
- `--cp-surface: #292929`
- `--cp-accent: #fd8ea1` — coral accent
- `--cp-text: #dedede`
- `color-scheme: dark`

Icons are **full-bleed** (no transparency) so iOS home-screen masking looks clean.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Family member installs the dashboard to a home screen (Priority: P1)

Maps to [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67).

As a family member on an iPhone/iPad (or the Surface kiosk), I add the weather dashboard to my
home screen and launch it full-screen like an app, with the correct name, icon, and theme color
— and no service worker is registered.

**Why this priority**: This is the entire feature. Without it, "Add to Home Screen" yields a
mislabeled browser bookmark; with it, the dashboard behaves like an installed app. It is a
single independently shippable MVP slice.

**Independent Test**: On iOS Safari at `http://<box-ip>:8090`, use **Add to Home Screen**,
launch the icon, and confirm the app opens full-screen (no browser chrome) with the correct
name, icon, and theme color. Confirm no service worker is registered (Safari Web Inspector →
no active service worker; source contains no `serviceWorker.register` / `sw.js`).

**Acceptance Scenarios**:

1. **Given** the dashboard is served, **When** a client requests `/manifest.webmanifest`, **Then** the response is valid JSON with `display: "standalone"`, a `theme_color`, a `background_color`, an app `name` and `short_name`, and an `icons` array containing a 192px icon, a 512px icon, and a 512px `maskable` icon.
2. **Given** the manifest is requested, **When** nginx serves it, **Then** the `Content-Type` response header is `application/manifest+json`.
3. **Given** iOS Safari on a LAN device, **When** the user chooses "Add to Home Screen" and launches the resulting icon, **Then** the app opens full-screen (no browser chrome) using the configured apple-touch-icon, app title, and status-bar style.
4. **Given** the built app, **When** its source and served assets are inspected, **Then** there is **no** `serviceWorker.register` call and **no** `sw.js` anywhere (deliberately service-worker-free — LAN HTTP).
5. **Given** the icon assets, **When** rendered, **Then** they match the Clawpilot dark design language (field `#3d3b3a`, coral accent `#fd8ea1`) and are full-bleed (no transparency).
6. **Given** the additive `<head>` tags in `index.html`, **When** the existing kiosk iframe viewport (2160×1308) renders the dashboard, **Then** its layout is visually unaffected.

---

### Edge Cases

- **Manifest served with the wrong content type**: if nginx returns the manifest as
  `application/octet-stream` or `text/plain`, some browsers ignore it. The nginx block MUST
  force `application/manifest+json` (AC #2).
- **A stray/legacy service worker registration** anywhere in the tree would silently require
  HTTPS and break the LAN-HTTP install; the "no service worker" assertion (AC #4) MUST be a
  standing test so it cannot regress.
- **Icon with transparency**: a transparent icon would show the OS wallpaper through the
  masked corners on iOS; icons MUST be full-bleed (AC #5).
- **Maskable safe-zone**: the maskable 512 icon's meaningful art must sit inside the maskable
  safe zone so aggressive OS masking does not clip the glyph.
- **`index.html` head edit that alters rendering**: only additive PWA `<head>` tags are
  allowed; nothing that changes the shared SPA layout (AC #6).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The web app MUST serve a web manifest at `/manifest.webmanifest` that is valid JSON parseable without error.
- **FR-002**: The manifest MUST declare `display: "standalone"` so the launched app opens without browser chrome.
- **FR-003**: The manifest MUST declare `theme_color` and `background_color` set to the Clawpilot background `#3d3b3a`.
- **FR-004**: The manifest MUST declare an app `name` and a `short_name` suitable for a home-screen label.
- **FR-005**: The manifest `icons` array MUST include a 192×192 `png`, a 512×512 `png`, and a 512×512 `png` with `purpose: "maskable"`.
- **FR-006**: nginx MUST serve `/manifest.webmanifest` with `Content-Type: application/manifest+json`.
- **FR-007**: [apps/web/index.html](../../apps/web/index.html) MUST be updated with **additive** `<head>` tags only: the **six PWA tags** — `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#3d3b3a">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" ...>`, `<meta name="apple-mobile-web-app-title" ...>`, and `<link rel="apple-touch-icon" ...>` — **plus one favicon link** `<link rel="icon" href="/favicon.ico" ...>` (see Decision 6 in research.md).
- **FR-008**: The system MUST NOT introduce a service worker: no `serviceWorker.register` call and no `sw.js` may exist anywhere in the app or its build output.
- **FR-009**: Icon assets MUST be committed under `apps/web/public/` — at minimum `icon-192.png`, `icon-512.png`, a 512 maskable, `apple-touch-icon.png` (180×180), and `favicon.ico`.
- **FR-010**: Icons MUST be generated by a committed `apps/web/scripts/make-icons.py` edge asset (Pillow), not hand-drawn, so they are reproducible.
- **FR-011**: Icons MUST use the Clawpilot palette (field `#3d3b3a`, coral accent `#fd8ea1`, dark surface `#292929`) and be full-bleed (no transparency).
- **FR-012**: All changes MUST be confined to edge/deployment files (`apps/web/public/`, `apps/web/index.html`, `apps/web/nginx.conf`, `apps/web/scripts/make-icons.py`); shared dashboard `src/` rendering logic MUST NOT be modified.
- **FR-013**: The existing kiosk iframe viewport (2160×1308) rendering MUST remain visually unaffected by the added `<head>` tags.

### Key Entities *(include if feature involves data)*

- **Web App Manifest**: static JSON describing the installable app — `name`, `short_name`, `display`, `theme_color`, `background_color`, and `icons[]` (192, 512, 512-maskable). Served as a static edge asset.
- **PWA Icon Set**: the committed image assets (`icon-192.png`, `icon-512.png`, 512 maskable, `apple-touch-icon.png`, `favicon.ico`) rendered in the Clawpilot dark palette, full-bleed.
- **Additive `<head>` Metadata**: the manifest link, theme-color, and Apple mobile web-app meta tags injected into `index.html` that iOS reads for standalone launch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A family member can add the dashboard to an iPhone/iPad home screen and launch it full-screen (no browser chrome) with the correct name, icon, and theme color, in a single Safari "Add to Home Screen" flow.
- **SC-002**: `GET /manifest.webmanifest` returns valid JSON with `display: standalone`, `theme_color`, `background_color`, `name`/`short_name`, and 192 + 512 + 512-maskable icons — 100% of the required fields present.
- **SC-003**: The manifest is served with `Content-Type: application/manifest+json`.
- **SC-004**: Zero service workers are registered and no `sw.js` exists anywhere in the app or its build output.
- **SC-005**: The kiosk iframe viewport (2160×1308) is visually unchanged (before/after screenshots match).

## Testing Strategy

Testable units for this edge slice are static / structural checks that run in CI, plus a web
unit/e2e assertion:

- **JSON-parse the manifest** and assert the required fields and icon entries (FR-001..FR-005).
- **Assert the additive `<head>` tags** are present in `index.html` (FR-007).
- **Assert no service worker**: grep/scan the source and build output for `serviceWorker.register`
  and `sw.js` and assert absent (FR-008).
- **Assert icon assets exist** and are non-transparent full-bleed images in the committed set (FR-009, FR-011).
- **nginx content-type**: covered by a structural check of the nginx config block and, where
  feasible, an integration assertion that the served header is `application/manifest+json` (FR-006).

**Live iOS install (AC #3) is manual QA and is never automated in CI.** Per the project
constitution, TDD + 100% coverage is non-negotiable for the automatable units above; the live
device install remains a manual verification step.

## Assumptions

- The dashboard is and will remain served over LAN **HTTP** (no HTTPS/TLS on the kiosk host); this is why the service-worker-free pattern is chosen.
- iOS Safari's HTTP "Add to Home Screen" + `standalone` launch behavior is available on the family's devices.
- Pillow is available (or installable) in the environment that runs `make-icons.py`; generated icons are committed so the generator does not run in the container build.
- The manifest is fetched same-origin from the SPA root, so no CORS handling is required.
- Existing nginx SPA-fallback and `/api/` proxy behavior are unchanged; only a manifest content-type block is added.

## Non-Goals (Out of Scope)

- **Offline caching / any service worker** — needs HTTPS and is not required for home-screen install.
- **HTTPS/TLS on the kiosk host.**
- **Any change to shared dashboard `src/` rendering logic** or component behavior.
- **Android/Chrome install polish beyond the standard manifest** (the manifest already satisfies Chrome's basic installability; no install-prompt UX work is in scope).
- **App store / native packaging.**
