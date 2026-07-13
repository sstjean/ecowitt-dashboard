# Data Model — Feature 015: Home-Screen Install Support (PWA)

**Branch**: `015-pwa-install` · **Feature**: [#66](https://github.com/sstjean/ecowitt-dashboard/issues/66) · **US1**: [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67)

This feature has **no runtime data model** — no database rows, no API payloads, no
persisted state. The "entities" here are the **static edge assets** the feature
ships. They are modeled below so the structural tests and contracts have a single
source of truth for required fields and values.

All three entities are read from committed files at test time; none touch live
gateway telemetry (Test Data Separation honored).

---

## Entity 1 — Web App Manifest

**File**: `apps/web/public/manifest.webmanifest` (static JSON, served at
`/manifest.webmanifest`).

**Purpose**: Describes the installable app to the browser/OS so the launched icon
opens full-screen with the correct name, colors, and icon set.

| Field | Type | Required value / constraint | Maps to |
|-------|------|------------------------------|---------|
| `name` | string | Non-empty full app name (home-screen / splash label). | FR-004 |
| `short_name` | string | Non-empty short label suitable for a home-screen grid. | FR-004 |
| `display` | string | MUST equal `"standalone"` (launch without browser chrome). | FR-002 |
| `theme_color` | string | MUST equal `"#3d3b3a"` (Clawpilot `--cp-bg`). | FR-003 |
| `background_color` | string | MUST equal `"#3d3b3a"` (Clawpilot `--cp-bg`). | FR-003 |
| `start_url` | string | Same-origin start path (e.g. `"/"`); no CORS. | FR-001 (implied) |
| `icons` | array | MUST contain the three required icon entries below. | FR-005 |

**`icons[]` required entries** (each an object `{ src, sizes, type, purpose? }`):

| # | `sizes` | `type` | `purpose` | Constraint |
|---|---------|--------|-----------|------------|
| 1 | `192x192` | `image/png` | (any / omitted) | Points to a committed 192 PNG. |
| 2 | `512x512` | `image/png` | (any / omitted) | Points to a committed 512 PNG. |
| 3 | `512x512` | `image/png` | `maskable` | Points to the committed 512 maskable PNG; art inside the maskable safe zone. |

**Validation rules** (asserted by `manifest.test.ts`):

- The file MUST `JSON.parse` without error (FR-001).
- `display === "standalone"`; `theme_color === background_color === "#3d3b3a"`.
- `name` and `short_name` are present and non-empty.
- `icons` includes at least a 192 PNG, a 512 PNG, and a 512 PNG with
  `purpose` containing `maskable`.
- Every `icons[].src` resolves to a file that exists in `public/` (cross-checked
  by `icons.test.ts`).

---

## Entity 2 — PWA Icon Set

**Files** (committed under `apps/web/public/`):

| File | Dimensions | Role | Constraint |
|------|-----------|------|------------|
| `icon-192.png` | 192×192 | manifest any-purpose | Opaque, full-bleed. |
| `icon-512.png` | 512×512 | manifest any-purpose | Opaque, full-bleed. |
| `icon-512-maskable.png` | 512×512 | manifest `maskable` | Opaque; meaningful art inside center safe zone (~80%). |
| `apple-touch-icon.png` | 180×180 | iOS home-screen icon | Opaque, full-bleed. |
| `favicon.ico` | 16/32/48 multi-res | browser tab | Branded mark; kills the `/favicon.ico` 404. |

**Palette (Clawpilot dark)** — from [apps/web/src/styles.css](../../apps/web/src/styles.css) `:root`:

- Field / background: `#3d3b3a` (`--cp-bg`)
- Accent glyph: `#fd8ea1` (`--cp-accent`, coral)
- Secondary/surface: `#292929` (`--cp-surface`)

**Generation**: All PNG/ICO outputs are produced deterministically by
`apps/web/scripts/make-icons.py` (Pillow) and **committed** — the container build
never runs Pillow (FR-010).

**Validation rules** (asserted by `icons.test.ts`):

- Each listed file exists at its expected path (FR-009).
- Each raster icon is a valid PNG at its declared dimensions.
- Each PNG is **opaque / full-bleed** — no transparency (either no alpha channel,
  or an alpha channel that is fully opaque across all pixels) (FR-011).

---

## Entity 3 — Additive `<head>` Metadata

**File**: `apps/web/index.html` (`<head>` only; body/mount points unchanged).

**Purpose**: The manifest link + Apple mobile web-app metas iOS reads to launch
the installed icon in `standalone` mode with the right title, status bar, and
touch icon; plus the favicon link.

| # | Tag | Required attributes | Maps to |
|---|-----|--------------------|---------|
| 1 | `<link rel="manifest">` | `href="/manifest.webmanifest"` | FR-007 |
| 2 | `<meta name="theme-color">` | `content="#3d3b3a"` | FR-007 / FR-003 |
| 3 | `<meta name="apple-mobile-web-app-capable">` | `content="yes"` | FR-007 |
| 4 | `<meta name="apple-mobile-web-app-status-bar-style">` | a valid style value (e.g. `black-translucent`) | FR-007 |
| 5 | `<meta name="apple-mobile-web-app-title">` | non-empty title | FR-007 |
| 6 | `<link rel="apple-touch-icon">` | `href` → `apple-touch-icon.png` | FR-007 / FR-009 |
| (+) | `<link rel="icon">` | `href` → `favicon.ico` | Decision 6 (favicon) |

**Validation rules** (asserted by `head-tags.test.ts`):

- All six required tags (1–6) are present in `<head>` (FR-007).
- The edits are **additive only** — no existing `<head>`/body element is removed
  or reordered in a way that alters the SPA mount (FR-013). The manual kiosk
  before/after screenshot (SC-005) confirms the 2160×1308 render is unchanged.

---

## Invariant — No Service Worker (standing assertion)

Not an entity, but a cross-cutting rule enforced as data:

- No `serviceWorker.register(` call and no `sw.js` file may exist anywhere in the
  `apps/web` source tree or its build output (FR-008 / AC #4).
- Asserted by `no-service-worker.test.ts` as a standing regression guard so a
  future stray registration (which would silently require HTTPS and break the
  LAN-HTTP install) cannot land.
