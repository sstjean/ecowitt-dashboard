# Quickstart & Validation: Rainfall-Card Cue Layout Refinement (010)

**Feature**: `010-rainfall-cue-layout` | **Date**: 2026-07-01

This is a runnable validation guide proving the feature end-to-end. Implementation
details live in [contracts/render-rainfall.md](contracts/render-rainfall.md),
[research.md](research.md), and (Phase 2) `tasks.md`.

## Prerequisites

- Node + workspace deps installed at repo root (`npm install`).
- Playwright browsers installed for the web app (`cd apps/web && npx playwright install`).
- On branch `010-rainfall-cue-layout`.

## Commands

Run from `apps/web` unless noted:

```bash
# Type check (constitution: local type-check parity)
npm run typecheck

# Unit/DOM tests + 100% coverage gate
npm run test:coverage

# Playwright e2e (includes the layout-containment guard)
npm run test:e2e

# Local visual check
npm run dev            # then open the dashboard in Chrome
```

## TDD validation order (Red → Green)

1. **Red (unit)**: With `rainfall.test.ts` updated for the new structure but
   `rainfall.ts` unchanged, `npm run test:coverage` MUST fail — the banner is
   still a card-level sibling and the fault is still an inline `.rain-fault`
   block, not an overlay.
2. **Red (e2e)**: With the guard + fixtures added but source unchanged,
   `npm run test:e2e` MUST fail on containment / centering at the kiosk viewport.
3. **Green**: Implement `rainfall.ts` + `styles.css`; re-run all three commands to
   green with 100% coverage.

## Acceptance scenarios (map to spec)

### Scenario 1 — "Raining now" no longer clips (US1 / FR-002–004, SC-001,002)

- **Setup**: route `/api/v1/latest` with `reading.isRaining = true`,
  `snapshot.rainSensorSuspect = false` (base `latestSnapshot` fixture qualifies).
- **Expect**:
  - `.rain-now-banner[data-rain-now]` is visible, nested inside `.rain-main`,
    and precedes `[data-rain-daily]` in DOM order.
  - `.drop-wrap`, `.rain-grid`, and `[data-rain-yearly]` are fully within the
    `[data-panel="rain"]` card box (no clip).
  - Only Daily Rain value/label are shifted down vs. the dry baseline.
  - Card `scrollHeight ≤ clientHeight` (+tol) — card did not grow.

### Scenario 2 — Sensor-fault overlay dims the card (US2 / FR-005–007, SC-003,004)

- **Setup**: route with `snapshot.rainSensorSuspect = true` and a
  `rainSensorReason` (e.g. "No tips during a storm signature").
- **Expect**:
  - Exactly one `.rain-fault-overlay[data-rain-fault]`, centered over the card
    (mid-x/mid-y within tolerance of card center) and fully contained.
  - Overlay shows ⚠ icon + "Sensor may not be reporting" + the reason text.
  - `.rain-body` carries the `dimmed` class (droplet/Daily/Totals greyed).
  - No timestamp text anywhere in the overlay (no UTC).
  - No card content overflows; card did not grow.

### Scenario 3 — Mutual exclusivity (US3 / FR-009, SC-005)

- **Setup**: route with `isRaining = true` **and** `rainSensorSuspect = true`.
- **Expect**: overlay present; `.rain-now-banner` is `hidden`/not visible.

### Edge cases

- **Long reason**: route a long `rainSensorReason`; overlay wraps/clips inside
  itself and stays within the card box (card does not grow).
- **Empty/missing reason**: route `rainSensorReason: null`; overlay still renders
  the ⚠ icon and title without breaking layout.
- **Neither cue** (`isRaining:false`, `suspect:false`): no banner, no overlay, no
  dim; Daily Rain in normal position; card contained.

## Post-green deployment (web image only)

Per repo `prod-deploy.md` (ship images, not source; Mac arm64 → host amd64):

```bash
# From repo root
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build web
docker save ecowitt/web:1.0.0 | gzip -1 | ssh steve@192.168.10.5 'gunzip | docker load'
ssh steve@192.168.10.5 'cd ~/ecowitt-dashboard && docker compose up -d web'
```

Verify at **http://192.168.10.5:8090/** (WEB_PORT 8090). `api` and `poller` are
unchanged and are NOT rebuilt or shipped.

## Definition of done

- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` green at 100% (rainfall.ts + index.ts).
- [ ] `npm run test:e2e` green, including the 3-state containment guard at kiosk viewport.
- [ ] Chrome visual check: banner above Daily Rain (raining), centered dimmed
      overlay (fault), nothing clipped, Eastern-time header intact.
- [ ] Web amd64 image rebuilt & shipped; dashboard verified at :8090.
