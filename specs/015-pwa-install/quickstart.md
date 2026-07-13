# Quickstart — Feature 015: Home-Screen Install Support (PWA)

**Branch**: `015-pwa-install` · **Feature**: [#66](https://github.com/sstjean/ecowitt-dashboard/issues/66) · **US1**: [#67](https://github.com/sstjean/ecowitt-dashboard/issues/67)

This is a validation/run guide for the service-worker-free install surface. It
covers (1) regenerating the icons, (2) running the structural tests that gate CI,
and (3) the **manual** iOS "Add to Home Screen" QA. Full field/shape details live
in [data-model.md](data-model.md) and [contracts/](contracts/).

---

## Prerequisites

- Node + npm (repo standard) with `apps/web` deps installed (`npm ci` at repo root).
- Python 3.x + Pillow — **only** needed to regenerate icons (`pip install pillow`).
  Not required for CI or the container build (icons are committed).
- For manual QA: an iPhone/iPad on the same LAN and the dashboard reachable at
  `http://<box-ip>:8090` (production nginx build), plus optionally the Surface kiosk.

---

## 1. Regenerate the icons (build-time edge asset)

The icon PNG/ICO files are **committed**; only run this when the art or palette
changes. Outputs land in `apps/web/public/`.

```bash
cd apps/web
python scripts/make-icons.py
```

Expected outputs (all opaque, full-bleed, Clawpilot palette — field `#3d3b3a`,
coral glyph `#fd8ea1`):

- `public/icon-192.png` (192×192)
- `public/icon-512.png` (512×512)
- `public/icon-512-maskable.png` (512×512, art inside the maskable safe zone)
- `public/apple-touch-icon.png` (180×180)
- `public/favicon.ico`

Commit the regenerated files so the container build never runs Pillow.

> Maskable check: preview `icon-512-maskable.png` against a maskable safe-zone
> template (e.g. maskable.app) and confirm the glyph survives a ~40% inset without
> clipping.

---

## 2. Run the structural tests (the CI gate)

These read the committed static assets only — no device, no network.

```bash
cd apps/web
npm run test         # runs the Vitest suite, incl. tests/pwa/*
npm run test:coverage# enforce the 100% coverage gate
npm run typecheck    # tsc parity with CI
```

The `tests/pwa/` suite asserts:

| Test | Asserts | Contract |
|------|---------|----------|
| `manifest.test.ts` | manifest parses; `display`, colors, name/short_name, 192/512/512-maskable icons | [manifest.contract.md](contracts/manifest.contract.md) |
| `head-tags.test.ts` | six additive `<head>` tags present; SPA elements untouched | [edge-assets.contract.md](contracts/edge-assets.contract.md) Part A |
| `nginx-content-type.test.ts` | `location = /manifest.webmanifest` forces `application/manifest+json` | [edge-assets.contract.md](contracts/edge-assets.contract.md) Part B |
| `no-service-worker.test.ts` | no `serviceWorker.register` / `sw.js` anywhere (standing guard) | [edge-assets.contract.md](contracts/edge-assets.contract.md) Part C |
| `icons.test.ts` | icon files exist; opaque full-bleed PNGs at declared sizes | [data-model.md](data-model.md) Entity 2 |

TDD order (per constitution): write each test **Red** first, confirm it fails, then
create the asset/config to turn it **Green**.

> `scripts/make-icons.py` is a human-run generator and is **excluded** from the
> web app coverage gate, the same way other `scripts/` generators are.

---

## 3. Manual iOS "Add to Home Screen" QA (never in CI)

This is the only validation for live-device behavior (AC #3 / SC-001). Do it
against the **production** nginx build, not `vite dev`.

1. Build + serve the web container (production path) and confirm the dashboard
   loads at `http://<box-ip>:8090`.
2. Verify the manifest is served correctly:
   ```bash
   curl -sI http://<box-ip>:8090/manifest.webmanifest | grep -i content-type
   # → content-type: application/manifest+json         (AC #2 / SC-003)
   curl -s  http://<box-ip>:8090/manifest.webmanifest | python -m json.tool
   # → valid JSON with display:standalone, #3d3b3a colors, name/short_name, 3 icons
   ```
3. On iOS Safari, open `http://<box-ip>:8090`, tap **Share → Add to Home Screen**.
   Confirm the suggested **name** and **icon** are the branded ones (not a
   screenshot bookmark).
4. Launch the new home-screen icon. Confirm it opens **full-screen — no browser
   chrome** (address bar / tabs absent), with the coral-on-`#3d3b3a` icon and the
   configured status-bar style (AC #3 / SC-001).
5. Confirm **no service worker**: Safari Web Inspector shows no active service
   worker; page source contains no `serviceWorker.register` / `sw.js` (AC #4 / SC-004).
6. **Kiosk unchanged**: open the dashboard in the kiosk iframe viewport
   (2160×1308) and compare a before/after screenshot — layout must be visually
   identical (AC #6 / SC-005).

---

## Done when

- All `tests/pwa/*` pass at 100% coverage and `npm run typecheck` is clean.
- `curl` shows `application/manifest+json` and valid manifest JSON.
- The iOS home-screen icon launches full-screen with the correct name/icon/theme
  and no service worker.
- The kiosk 2160×1308 render is unchanged.
