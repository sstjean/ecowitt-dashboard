# Quickstart: Validate the Reconnecting Affordance

**Feature**: 013-reconnecting-affordance · **Date**: 2026-07-02

How to prove the cue works end-to-end. Implementation detail lives in
[plan.md](plan.md) / [research.md](research.md); the seam is in
[contracts/render-seam.md](contracts/render-seam.md).

## Prerequisites

- Node + workspace deps installed (`npm ci` at repo root).
- Working directory for most commands: `apps/web`.

## 1. Unit tests + coverage (covered gate — MUST be 100%)

```bash
cd apps/web
npm run test:coverage
```

Expected: all render tests pass, including the new
`tests/render/reconnecting.test.ts` and the extended `tests/render/index.test.ts`
seam assertions. Coverage for `src/**` (excluding `src/bootstrap.ts`) stays at
100% / 100% / 100% / 100%.

The unit suite MUST assert (maps to spec):

| Scenario | Assertion | Requirement |
|----------|-----------|-------------|
| Fresh cue on creation | cue hidden, no dot/label visible | FR-003 / SC-004 |
| Outage begins (`set(true)`) | dot + "Reconnecting…" label become visible | FR-001 / SC-001 |
| Recovery (`set(false)`) | cue hidden again, automatically | FR-002 / SC-002 |
| Steady outage (`set(true)` ×N) | still exactly one cue; no re-insert / no animation restart | FR-005 / SC-005 |
| Never-on-success | with only `set(false)` (or no call), cue never shows | FR-003 / SC-004 |
| Panel-safety via `mountDashboard.setReconnecting` | panel HTML byte-identical before/after toggling | FR-004 / SC-003 |
| No timestamp | cue text is a fixed label; no time value rendered | FR-009 |

## 2. Type-check (parity with CI)

```bash
cd apps/web
npm run typecheck
```

Expected: `tsc` reports no errors — the new render helper and extended `Dashboard`
interface type-check cleanly.

## 3. Playwright e2e (composed wiring)

Mirrors [e2e/selfheal.spec.ts](../../apps/web/e2e/selfheal.spec.ts): route-stub
`**/api/v1/latest`, drive the loop through fail → recover, assert the cue while
values persist.

```bash
cd apps/web
npm run test:e2e -- reconnecting.spec.ts
```

Expected flow inside the spec:

1. Stub `**/api/v1/latest` → 200 with a fixture; load `/`; a known value
   (e.g. `[data-out-temp]`) is visible; the cue is **not** shown.
2. Switch the stub to fail (e.g. 500 / abort). After ~1 poll interval
   (`intervalMs`, ~10 s by default — **not** the 30 s staleness threshold), the
   cue appears; the known value is **still visible** (display not blanked).
3. Switch the stub back to 200. After ~1 poll interval the cue clears
   automatically, with no manual refresh; the known value remains.

## 4. Manual visual check (kiosk legibility)

```bash
cd apps/web
npm run build && npm run preview   # serves the real build (emits version.json)
```

Open the preview URL, then simulate an outage (block `/api/v1/latest` in
DevTools → Network, or stop the API) and confirm:

- A subtle pulsing dot + "Reconnecting…" appears near the header clock — **not** a
  banner or modal (FR-006/FR-007).
- All panel values stay on screen, dimmed-as-usual by existing Fresh/Stale rules
  but never blanked (FR-004).
- Restore the API; the cue disappears on its own within ~1 poll interval
  (FR-002).
- Reload the page mid-outage: the cue is re-derived from live ticks; nothing was
  persisted (FR-008).
- The header clock still reads Eastern time and no new timestamp appeared
  (FR-009).

## Done when

- [ ] `npm run test:coverage` passes at 100% (render helper + seam covered).
- [ ] `npm run typecheck` is clean.
- [ ] `reconnecting.spec.ts` shows appear→clear with values persisting.
- [ ] Manual kiosk check confirms subtle, freshness-language cue; no banner; no
      new timestamp; panels never blanked.
