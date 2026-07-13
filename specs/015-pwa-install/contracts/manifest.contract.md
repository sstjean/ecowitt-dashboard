# Contract — Web App Manifest (`/manifest.webmanifest`)

**Feature**: 015 Home-Screen Install Support (PWA) · **Maps to**: FR-001..FR-005, AC #1, SC-002

This contract defines the **required shape** of the static manifest served at
`/manifest.webmanifest`. It is the source of truth for `manifest.test.ts`. This is
a **static-asset contract** — there is no request body, no auth, no versioned API
surface; the only "request" is a same-origin `GET` of a committed file.

## Endpoint (production)

```
GET /manifest.webmanifest        (nginx, LAN HTTP, same-origin)
→ 200 OK
  Content-Type: application/manifest+json      # enforced by edge-assets.contract.md
  <the JSON document below>
```

## Required JSON shape

The document MUST `JSON.parse` without error and satisfy:

```jsonc
{
  "name": "<non-empty string>",            // FR-004
  "short_name": "<non-empty string>",      // FR-004
  "display": "standalone",                 // FR-002  (MUST be exactly this)
  "theme_color": "#3d3b3a",                // FR-003  (MUST be exactly this)
  "background_color": "#3d3b3a",           // FR-003  (MUST be exactly this)
  "start_url": "/",                         // same-origin start path (no CORS)
  "icons": [                                // FR-005  (MUST include all three below)
    { "src": "<192 png path>", "sizes": "192x192", "type": "image/png" },
    { "src": "<512 png path>", "sizes": "512x512", "type": "image/png" },
    { "src": "<512 maskable png path>", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Assertions (`manifest.test.ts`)

Given the committed `apps/web/public/manifest.webmanifest`:

1. `JSON.parse(raw)` succeeds (FR-001).
2. `display === "standalone"` (FR-002).
3. `theme_color === "#3d3b3a"` **and** `background_color === "#3d3b3a"` (FR-003).
4. `typeof name === "string" && name.length > 0` (FR-004).
5. `typeof short_name === "string" && short_name.length > 0` (FR-004).
6. `icons` is a non-empty array that contains, at minimum (FR-005):
   - an entry with `sizes === "192x192"` and `type === "image/png"`;
   - an entry with `sizes === "512x512"` and `type === "image/png"` (any purpose);
   - an entry with `sizes === "512x512"`, `type === "image/png"`, and `purpose`
     that includes `"maskable"`.
7. Every `icons[].src` resolves to a file present under `apps/web/public/`
   (cross-checked with `icons.test.ts`).

## Notes

- Exact `name` / `short_name` strings and the concrete `src` paths are finalized
  during implementation ([tasks.md](../tasks.md)); this contract fixes only the
  required fields, exact color values, and mandatory icon entries.
- Chrome basic installability is satisfied by this shape; no install-prompt UX is
  in scope (Non-Goal).
