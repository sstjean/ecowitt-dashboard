# Quickstart: Wall-Kiosk Legibility

**Feature**: 004-kiosk-legibility · **Date**: 2026-06-26

## Prerequisites

- Repo bootstrapped: `npm install` at the root (installs workspaces).
- Working from branch `004-kiosk-legibility`.

## Build & local verify

```bash
# Add the self-hosted font
npm --workspace apps/web install @fontsource-variable/inter

# Type-check + unit tests at 100% coverage
npm run typecheck
npm --workspace apps/web run test:coverage

# Contrast guard only (fast loop while tuning tokens)
npm --workspace apps/web run test -- contrast

# End-to-end (font resolution, kiosk no-overflow, enlarged sizes)
npm --workspace apps/web run test:e2e
```

## Visual check at the kiosk resolution

```bash
# Serve the built app, then drive Chrome at the Surface panel size
npm --workspace apps/web run build
npm --workspace apps/web run preview   # or the dev server
```

Then, in Chrome/Playwright, set the viewport to **2160×1440** and load the app:

- Confirm the ring gauges, numeric readouts, and condition icon are noticeably
  larger than at desktop width.
- Confirm the rain-drop outline and gauge tracks are clearly visible.
- Confirm there is **no vertical scrollbar** and nothing is clipped.
- Confirm text renders in Inter (DevTools → Computed → `font-family`).

## Acceptance mapping

| Check | Spec |
|---|---|
| Inter resolves cross-platform, served same-origin | FR-001/002/004, SC-004 |
| Muted/soft ≥4.5:1, drop outline ≥4.5:1 @ width 3, strong border ≥3:1 | FR-009/010, SC-003 |
| Ring/glyph enlarged at 2160×1440, fluid scaling | FR-005/006/007, SC-001/002 |
| No scroll / no clip at 2160×1440 | FR-008, SC-005 |
| Phone/desktop unchanged | FR-011, SC-006 |
| typecheck + 100% coverage + e2e green | SC-007 |

## Deploy to the Surface (after merge)

The web app is a static bundle served by nginx in the `web` container.

```bash
# Build the amd64 web image
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build web

# Ship to the host and recreate
docker save ecowitt/web:1.0.0 | gzip -1 | ssh steve@192.168.10.5 'gunzip | docker load'
ssh steve@192.168.10.5 'cd ~/ecowitt-dashboard && docker compose up -d web'
```

Then confirm on the wall unit (or a Chrome screenshot at 2160×1440 of
http://192.168.10.5:8090/): Inter face, enlarged gauges/icon, visible drop
outline, Eastern times, no scroll, no console errors.
