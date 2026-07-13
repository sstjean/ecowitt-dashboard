# Contract — Edge Assets (`<head>` tags · nginx content-type · no service worker)

**Feature**: 015 Home-Screen Install Support (PWA) · **Maps to**: FR-006, FR-007, FR-008, FR-012, FR-013, AC #2, AC #4, AC #6, SC-003, SC-004, SC-005

This contract covers the non-manifest edge surface: the additive `index.html`
`<head>` tags, the nginx manifest content-type block, and the standing
"no service worker" invariant. It is the source of truth for `head-tags.test.ts`,
`nginx-content-type.test.ts`, and `no-service-worker.test.ts`.

---

## Part A — Additive `<head>` tags (`apps/web/index.html`)

The `<head>` MUST contain these six tags (additive only — nothing existing is
removed or reordered, FR-013 / AC #6):

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#3d3b3a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="<app title>" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

Plus (Decision 6 — favicon):

```html
<link rel="icon" href="/favicon.ico" sizes="any" />
```

### Assertions (`head-tags.test.ts`)

Given the committed `apps/web/index.html`:

1. A `<link rel="manifest">` with `href="/manifest.webmanifest"` is present (FR-007).
2. A `<meta name="theme-color">` with `content="#3d3b3a"` is present (FR-007 / FR-003).
3. A `<meta name="apple-mobile-web-app-capable" content="yes">` is present (FR-007).
4. A `<meta name="apple-mobile-web-app-status-bar-style">` with a non-empty `content` is present (FR-007).
5. A `<meta name="apple-mobile-web-app-title">` with a non-empty `content` is present (FR-007).
6. A `<link rel="apple-touch-icon">` whose `href` points at the committed touch icon is present (FR-007 / FR-009).
7. The pre-existing SPA elements (`<div id="app">`, the module `<script src="/src/bootstrap.ts">`, the stylesheet link, the viewport meta, `<title>`) are still present and unchanged (FR-013 — additive-only guard).

> The `status-bar-style` value shown (`black-translucent`) is the recommended
> default; the concrete value is finalized in [tasks.md](../tasks.md). The
> assertion checks presence + non-empty content, not a specific string.

---

## Part B — nginx manifest content-type (`apps/web/nginx.conf`)

nginx's default mime map does not know `.webmanifest` and would serve it as
`application/octet-stream`, which some browsers ignore. Add a dedicated
exact-match location that forces the correct type and does not interfere with the
existing `location /` SPA fallback or `location /api/` proxy:

```nginx
location = /manifest.webmanifest {
    default_type application/manifest+json;
    try_files $uri =404;
}
```

### Behavioral contract

```
GET /manifest.webmanifest   (production nginx)
→ 200 OK
  Content-Type: application/manifest+json     # FR-006 / AC #2 / SC-003
```

### Assertions (`nginx-content-type.test.ts`)

Given the committed `apps/web/nginx.conf`:

1. A `location = /manifest.webmanifest` block exists (FR-006).
2. That block sets `default_type application/manifest+json;` (FR-006 / AC #2).
3. That block uses `try_files $uri =404;` (serves the static file, 404s otherwise).
4. The existing `location /` SPA fallback and `location /api/` proxy blocks are
   still present and unchanged (edge-only, non-interfering — FR-012).

> Note: the served-header assertion (an actual `GET` returning
> `application/manifest+json`) is exercised in production via the manual/quickstart
> path; CI asserts the config block structurally, since only the prod nginx path
> controls this header (Decision 3). Vite dev serving of the manifest is not
> asserted in CI.

---

## Part C — No service worker (standing invariant)

Deliberately service-worker-free — a service worker would require HTTPS, which the
LAN-HTTP box does not provide, and would break the install (FR-008 / AC #4 / SC-004).

### Assertions (`no-service-worker.test.ts`)

Scanning the `apps/web` source tree (and, where feasible, the build output):

1. **No** occurrence of `serviceWorker.register(` anywhere (FR-008).
2. **No** file named `sw.js` (or `service-worker.js`) anywhere (FR-008).
3. This test is a **standing regression guard** — it must remain in the suite so a
   future stray registration cannot silently land.

> The scan excludes this specs/ directory and node_modules; it targets shippable
> app source and build artifacts, mirroring the spec's "source and served assets"
> wording.
