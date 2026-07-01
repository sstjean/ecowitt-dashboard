# Quickstart: Validate the `get_sensors_info` Contract Fix

**Branch**: `011-fix-sensors-info-contract` | **Date**: 2026-07-01

This guide validates the bug fix end-to-end: re-captured fixtures parse, the projection yields
exactly the two real registered sensors, the UI renders honestly (no fabricated `wh25`), and —
after redeploy — the live gateway serves `sensorHealth.available:true` with no poller errors.

## Prerequisites

- Repo checked out on `011-fix-sensors-info-contract`; Node 20 + npm; Docker (amd64 buildx) for
  the deploy step.
- Real captures present at `/tmp/real_sensors_page1.json` and `/tmp/real_sensors_page2.json`
  (16-entry bare arrays). These are the canonical fixture source.
- Prod host reachable at `192.168.10.5:8090`; ship-images runbook available
  (`/memories/repo/prod-deploy.md`).

## Step 0 — TDD Red (author regression tests first)

Per the constitution (Bug Fix Regression Tests + TDD), write/adjust the failing tests **before**
touching production code, one per 007 defect:

1. Poller: page body is a **bare array** (not `{command}`) → `fetchSensorsInfo` returns the
   merged array without throwing.
2. Poller: page 2 is a non-array garbage body → skipped, page-1 sensors returned, no throw.
3. Shared: real merged array → projection is exactly `{WS90 1242D, wh31 A0}`.
4. Shared: `id:"FFFFFFFF", idst:"1"` placeholder → excluded (registered keyed on `id`).
5. Shared: `rssi:"--"`/`signal:"--"` → `null`.
6. Web: `sensorCardMap` binds outdoor/solar/rain → `1242D`; indoor/baro absent (no indicator).

Run the suites and **confirm Red** before implementing:

```bash
npm run -w packages/shared test
npm run -w apps/poller test
npm run -w apps/web test
```

## Step 1 — Replace/rebuild fixtures from the real device

```bash
cp /tmp/real_sensors_page1.json apps/poller/tests/fixtures/sensorsInfo/page1.json
cp /tmp/real_sensors_page2.json apps/poller/tests/fixtures/sensorsInfo/page2.json
# Rebuild packages/shared/tests/fixtures/sensorHealth/merged.json as the merged bare array
# (registered set = WS90 1242D + wh31 A0). Keep garbage.json for the non-array guard path.
```

Update `apps/web/e2e/fixtures.ts` `sensorHealth` blocks to WS90 (`1242D`) + wh31 (`A0`) only —
remove the `C7`/`wh25` health row.

## Step 2 — Implement Green

Apply the corrections (see [data-model.md](./data-model.md) and
[contracts/get-sensors-info-input.md](./contracts/get-sensors-info-input.md)):

- `packages/shared/src/schema.ts`: bare-array whole-payload guard; registration keyed on `id`
  (drop the `idst` gate); `RawSensorsInfo` reflects the array shape; keep the `"--"→null` guard.
- `apps/poller/src/gatewayClient.ts`: per-page `Array.isArray` parse + skip; merge/dedup by
  `id`; `RawSensorsInfo = unknown[]`; never throw.
- `apps/web/src/sensorCardMap.ts`: outdoor/solar/rain → `1242D`; remove indoor/baro (`C7`) rows.
- `apps/web/src/render/index.ts` + `render/sensorIndicator.ts`: verify cards with no backing
  sensor render **no** indicator.

## Step 3 — Green + coverage + typecheck (all four workspaces)

```bash
npm run -w packages/shared test:coverage
npm run -w apps/poller  test:coverage
npm run -w apps/web     test:coverage
npm run -w apps/api     test:coverage   # re-verify unaffected
npm run typecheck                        # all workspaces clean
```

**Expected**: all green, **100%** statements/branches/functions/lines on shared/poller/web;
api unchanged. If a branch is uncovered (e.g. the type-4 `N/A` rule now unused), remove the
dead code rather than adding a fake test.

## Step 4 — Playwright e2e

```bash
npm run -w apps/web e2e
```

**Expected**: green. Sensor Health page shows WS90 + wh31 CH2; indoor/baro cards show **no**
radio/battery indicator; no `wh25`/`C7` row anywhere.

## Step 5 — Deploy all three amd64 images & live-verify

Rebuild **web + api + poller** (poller/shared logic changed; web card map changed) and ship to
prod per the ship-images runbook, then verify:

```bash
# From prod host / over LAN:
curl -s http://192.168.10.5:8090/api/v1/latest | jq '.sensorHealth | {available, stale, ids: [.sensors[].id]}'
# Expected: { "available": true, "stale": false, "ids": ["1242D", "A0"] }

# Poller logs over ≥3 cycles show ZERO get_sensors_info parse errors:
docker logs --since 5m <poller-container> 2>&1 | grep -i sensors_info || echo "no sensors_info errors ✓"
```

## Done when

- [ ] Red confirmed for all six regression tests before Green.
- [ ] Fixtures re-captured from the real device (bare arrays, incl. placeholders).
- [ ] `sensorHealth` projection = exactly `{1242D, A0}`; zero placeholder ids.
- [ ] Indoor/baro render no radio indicator; no fabricated `wh25`/`C7` anywhere.
- [ ] 100% coverage on shared/poller/web (api re-verified); typecheck clean; Playwright green.
- [ ] All three amd64 images redeployed; live `sensorHealth.available:true`, `stale:false`,
      ids `[1242D, A0]`, and no per-cycle poller `get_sensors_info` errors.
