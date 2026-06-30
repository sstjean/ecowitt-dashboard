# Quickstart: Validating Sensor Battery & Signal Health (007)

**Branch**: `007-sensor-health` | **Date**: 2026-06-30

Runnable validation for the seven success criteria. All scenarios run against **committed
static-capture fixtures** of a real `get_sensors_info` payload — never the live gateway or DB
(Constitution: Test Data Separation). See [data-model.md](./data-model.md),
[contracts/](./contracts/), and [plan.md](./plan.md) for the design details these steps prove.

## Prerequisites

```bash
# from repo root
npm install
npm run -ws build            # builds @ecowitt/shared so poller/api/web resolve the new types
```

## Per-workspace checks (run for each touched workspace)

```bash
# packages/shared — normalization + schema
npm --workspace packages/shared run test:coverage
npm --workspace packages/shared run typecheck

# apps/poller — fetch + persist
npm --workspace apps/poller run test:coverage
npm --workspace apps/poller run typecheck

# apps/api — envelope available/stale + both branches
npm --workspace apps/api run test:coverage
npm --workspace apps/api run typecheck

# apps/web — indicator helper + health page (unit) and kiosk/dashboard (e2e)
npm --workspace apps/web run test:coverage
npm --workspace apps/web run typecheck
npm --workspace apps/web run test:e2e
```

**Gate**: every workspace must report **100%** statements/branches/functions/lines
(`src/server.ts` excluded) and a clean typecheck before US1 is considered green.

## Success-criteria validation map

| SC | What it proves | How to validate | Fixture / expected |
|----|----------------|-----------------|--------------------|
| **SC-001** | One normalized record per registered sensor; placeholders excluded | `packages/shared` normalization test on the captured 2-page payload | Input has WS90 + wh31 + wh25 + `FFFFFFFE` placeholders → output = exactly the registered set, placeholders gone |
| **SC-002** | Card shows signal + battery at a glance | `apps/web` `sensorIndicator.test.ts`; e2e `dashboard.spec.ts` asserts bars/battery glyph on each sensor-backed card | WS90 cards show 4 bars + OK; wh25 cards show N/A (no radio) |
| **SC-003** | Health page lists every sensor; Low/lost-link obvious | `apps/web` `sensorHealthPage.test.ts`; toggle the overlay in e2e | Rows for WS90, wh31, wh25 with distinct OK/Low/N/A/Unknown states |
| **SC-004** | Flag/wired battery never "0% / empty" | normalization + indicator tests | wh31 `batt 0` → `OK` (not 0%); wh25 → `N/A`; WS90 `batt 1` → `Low` |
| **SC-005** | Garbage/unreachable ⇒ readings keep flowing, health `Unknown`/stale | poller honest-fail test (readings still written) + API no-snapshot test + web Unknown render | malformed payload → `[]` upsert skipped → envelope `available:false, stale:true` → cards/page render Unknown |
| **SC-006** | Health rides the existing `/latest`, no new web call | API contract test: `sensorHealth` present on `/latest`; confirm web makes no second request | `latestSnapshotSchema.parse` passes with `sensorHealth`; web network log shows only `/latest` |
| **SC-007** | Last-seen renders in America/New_York | indicator + page tests assert Eastern formatting | a UTC `lastSeenUtc` renders via `Intl.DateTimeFormat({ timeZone: 'America/New_York' })` |

## End-to-end manual smoke (optional, against the mock stack)

```bash
# Bring up the mock gateway + full stack (poller → api → web)
docker compose -f docker-compose.mock.yml up --build
# then:
curl -s http://localhost:8080/api/v1/latest | jq '.sensorHealth'
#   → { available, stale, capturedAtUtc, sensors: [ {id,img,type,name,battery,...} ] }
```

Open the dashboard, confirm: (1) each sensor-backed card shows bars + battery; (2) the
"Sensors" toggle opens the health overlay with every sensor; (3) last-seen times are Eastern;
(4) the default kiosk view still has **no vertical scroll** (overlay closed).

## Failure-path smoke (US4 / SC-005)

Point the poller at an unreachable/garbage `get_sensors_info` (mock returns 500 or junk):
- `curl …/api/v1/latest | jq '.reading'` → **still populated** (readings unaffected);
- `… | jq '.sensorHealth'` → `available:false`/`stale:true`;
- cards/page show **Unknown**, never empty bars or "0%".

## Done criteria

- [ ] `normalizeSensorHealth` produces one record per registered sensor; placeholders excluded (SC-001).
- [ ] Per-type battery rules correct: WS90 level, wh31 flag, wh25 N/A; no "0% empty" (SC-004).
- [ ] `sensorHealth` rides `/latest` in both `ok` and `no-data` branches; `available`/`stale` correct (SC-006).
- [ ] Each sensor-backed card shows signal + battery; WS90 backs four cards from one record (SC-002).
- [ ] Sensor Health overlay lists every sensor; hidden by default; kiosk no-scroll preserved (SC-003).
- [ ] Garbage/unreachable ⇒ readings keep flowing, health `Unknown`/stale (SC-005).
- [ ] All last-seen timestamps render in America/New_York (SC-007).
- [ ] Both e2e mock envelopes in `apps/web/e2e/fixtures.ts` extended with `sensorHealth` (ripple).
- [ ] 100% coverage + clean typecheck across all four workspaces.
