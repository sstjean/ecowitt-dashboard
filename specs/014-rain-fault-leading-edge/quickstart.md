# Quickstart: Rain-Fault Leading-Edge False Positive Fix (014)

**Branch**: `014-rain-fault-leading-edge` | **Date**: 2026-07-06

Runnable validation for the sustained-duration gate. Scenarios map to SC-001..SC-006 and
are exercised by deterministic, committed static-capture fixtures (the live DB is never read
at test time). See [contracts/rain-fault-detector-amendment.md](./contracts/rain-fault-detector-amendment.md)
and [data-model.md](./data-model.md) for the detector delta.

## Prerequisites

- Node 22, repo dependencies installed (`npm install` at the root).
- No gateway, DB, or network required — the detector is pure and fixtures are committed.

## 1. Regenerate / verify the fixtures (one-time, off-host)

The new leading-edge fixture is captured from the read-only production copy at
`/tmp/ecowitt-014capture.sqlite`. The generator self-verifies each window's expected
verdict (008-would-be-`true`, 014-sustained-`false`) before writing, then the committed
JSON is what CI replays.

```bash
# Off-host, read-only against the capture; writes apps/api/tests/fixtures/rainFault/*.json
python3 scripts/gen-rain-fault-fixtures.py
```

Expected console (abridged): the new `leading-edge-07-06.json` line reports
`008=True 014=False OK`; the existing `storm-06-28.json` reports `014=True OK`.

## 2. Run the detector tests (Red → Green)

```bash
cd apps/api
npm test -- rainFault          # unit + acceptance for the detector
```

Expected: all pass, including the new sustained-gate cases below.

## 3. Enforce 100% coverage (Constitution gate)

```bash
cd apps/api
npm run test:coverage
```

Expected: 100% statements/branches/functions/lines across `src/rainFault.ts`, including
every new branch (the sustained gate, the `signatureFired` `null` paths, and the sub-window
degradation path).

## 4. Type-check (Local Type-Checking Parity)

```bash
cd apps/api
npm run typecheck
```

Expected: clean — the return type `RainFaultState` and the `detectRainFault` signature are
unchanged; only `RainFaultThresholds` gains `SUSTAIN_MIN: number`.

## Validation scenarios (→ Success Criteria)

| # | Scenario | Fixture / input | Expected | Maps to |
|---|----------|-----------------|----------|---------|
| V1 | **Leading edge suppressed** — signature present but only recently (rain onset imminent) | `leading-edge-07-06.json` (`now` = last reading, ~17:12 EDT, before 17:15 onset) | `rainSensorSuspect = false`, reason `null` | SC-001, FR-001/FR-006 |
| V2 | **Sustained dead-gauge downpour still flagged** — signature held for hours, rain flatlined 0.0 | `storm-06-28.json` | `rainSensorSuspect = true` with a reason noting the signature was sustained | SC-002, FR-003/FR-005 |
| V3 | **Nightly-dew exclusions unchanged** — gate path and quorum path | `dew-06-28-gate.json`, `dew-06-28-calm.json` | `false` (both) | SC-003, FR-007 |
| V4 | **Measured-rain window unchanged** — piezo registered rain (gate fails) | `rain-06-27.json` | `false` | SC-004, FR-007 |
| V5 | **`SUSTAIN_MIN` boundary** — signature holds at `now` but not at `now − SUSTAIN_MIN` vs. holds at both | synthetic windows (builders) crossing the 45-min sub-window | just-recent → `false`; sustained → `true` | FR-014 |
| V6 | **Sub-window graceful degradation** — window too short/sparse to assess the earlier sub-window | synthetic short/sparse window | `false`, no exception | FR-013 |
| V7 | **Envelope + UI unchanged** — no schema/route/web change | `latest.test.ts` (unchanged) still passes | envelope shape identical | SC-006, FR-010/FR-011 |

## What a reviewer should confirm

- The only production change is `apps/api/src/rainFault.ts` (+ its test, + the new fixture,
  + the generator). `packages/shared`, `apps/api/src/routes/v1/latest.ts`, `apps/web`, and
  `apps/poller` are untouched (`git diff --stat` shows nothing else).
- `RAIN_FAULT_WINDOW_MIN` in `latest.ts` is still `90`.
- `SUSTAIN_MIN = 45` lives in `RAIN_FAULT_DEFAULTS`; there is no bare `45` in the detector's
  control flow.
- The sustained gate only *removes* the leading-edge false positive: every 008 **negative**
  test/fixture stays negative, and the 008 positive **fixture** (`storm-06-28.json`) stays
  positive (monotonic tightening). The 008 positive **builder** tests are re-anchored to
  sustained windows (T018) so they still fire — the suite is fully GREEN at 100% coverage.
