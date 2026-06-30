# Quickstart & Validation: Rain-Gauge "Not Measuring" Fault Detection (008)

**Branch**: `008-rain-fault-detection` | **Date**: 2026-06-29

Runnable validation scenarios that prove the feature end-to-end. Detailed thresholds live
in [research.md](./research.md); field shapes in
[contracts/](./contracts/). This guide is a run/validation checklist, not implementation
code.

## Prerequisites

- Node 22, repo dependencies installed (`npm install` at root).
- Committed static-capture fixtures — trimmed, de-identified extracts of the ACTUAL
  stored readings for each window (STORM, two DEW exclusion windows, RAIN, plus boundary
  cases), replayed deterministically and never read from the live DB at test time.
- No production data required — fixtures only (Constitution: Test Data Separation).

## Unit / acceptance (detector)

```bash
# from repo root
npm --workspace apps/api run test            # rainFault.test.ts + latest.test.ts
npm --workspace apps/api run test:coverage   # must be 100%
npm --workspace apps/api run typecheck
```

Maps each Success Criterion to a test:

| SC | Scenario | Fixture | Expected `rainSensorSuspect` |
|----|----------|---------|------------------------------|
| **SC-001** | Real storm, gauge silent | STORM (temp −13.5°F, hum +21%, gust 17.2, solar −0.78, rain 0.00) | `true` |
| **SC-002** | Overnight dew/saturation (both exclusion paths) | DEW-gate (piezo 0.19 → gate) + DEW-calm (piezo 0 → quorum not met) | `false` |
| **SC-003** | Light rain the gauge measured | RAIN (rate 0.02 in/hr) | `false` |
| **SC-004** | Full nightly sweep | every night window | `false` (zero false positives) |
| **SC-005** | Distinct indicator | suspect=true snapshot | web shows "not measuring", not dry 0.00 |
| **SC-006** | Available via existing endpoint | any snapshot | fields present on `/api/v1/latest` |

Boundary tests (each threshold ± epsilon): `TEMP_DROP_F`, `HUMIDITY_SURGE_PCT`,
`GUST_SPIKE_MPH`, `PRESSURE_DIP_HPA`, `SOLAR_COLLAPSE_FRAC`, `SOLAR_DAY_MIN_WM2`,
`PIEZO_RATE_EPS`, `PIEZO_EVENT_EPS`, `MIN_READINGS`, `TREND_MIN`, `MIN_PROXIES`
(3 proxies ⇒ `false`, 4 ⇒ `true`).

## API integration (envelope)

```bash
docker compose -f docker-compose.yml up -d   # or the running stack
curl -s http://localhost:8080/api/v1/latest | jq '{rainSensorSuspect, rainSensorReason}'
```

Expected: both keys present on every response. During dry/working-gauge conditions:
`{ "rainSensorSuspect": false, "rainSensorReason": null }`.

To exercise the `true` path without waiting for a storm, point the API at a fixture store
whose recent window matches the STORM signature and re-curl — `rainSensorSuspect` flips to
`true` with a populated `rainSensorReason`.

## Web (kiosk indicator)

```bash
npm --workspace apps/web run test            # rainfall.test.ts
npm --workspace apps/web run test:e2e        # Playwright
```

Visual check (per the End-to-End Verification standard):

1. Load the dashboard with a STORM-signature fixture snapshot.
2. The rainfall card shows a **distinct "sensor may not be reporting"** indicator
   (Feature 004 kiosk legibility), **not** a plain dry `0.00`.
3. Any timestamp on the card renders in **America/New_York** (non-negotiable TZ rule).
4. Reload with a dry snapshot → indicator is absent; card shows normal `0.00`.

## Done criteria

- [ ] `detectRainFault` returns the contract truth table (C1–C7) on fixtures.
- [ ] `/api/v1/latest` carries `rainSensorSuspect` + `rainSensorReason` on both envelope branches.
- [ ] Web renders a distinct indicator for `suspect=true`, absent for `false`, Eastern TZ.
- [ ] 100% coverage on `apps/api` and `apps/web`; typecheck clean.
- [ ] Full-dataset sweep shows zero nightly false positives (SC-004).
