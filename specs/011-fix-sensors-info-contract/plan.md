# Implementation Plan: Fix Feature 007 `get_sensors_info` Contract (Bug Fix)

**Branch**: `011-fix-sensors-info-contract` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-fix-sensors-info-contract/spec.md`

## Summary

Feature 007 (Sensor Battery & Signal Health) shipped and deployed but is **broken on the
real GW2000B**: its `get_sensors_info` parser assumes a `{ command:[{ sensor:[…] }] }`
envelope the device never emits, keys "registered" on `idst` (which is `"1"` even on
unpaired placeholder slots), never coerces the string `"--"` signal/rssi to `null`, and its
card map invents a wired `wh25` (id `C7`) health row that no `get_sensors_info` record
backs. The device actually returns **each page as a bare JSON array** of sensor objects,
with placeholders carrying `id ∈ {FFFFFFFF, FFFFFFFE}`. The only two registered radios are
**WS90** (`wh90`, type 48, id `1242D`) and **wh31 CH2** (type 7, id `A0`).

This bug fix corrects the **input contract only** — the served `sensorHealth` envelope and
`SensorHealthEntry` schema are unchanged. Technical approach: (1) reparse each page as a bare
array in `normalizeSensorHealth` and `fetchSensorsInfo`; (2) re-key "registered" on `id`
(not `idst`); (3) keep the existing `"--"→null` coercion path and ensure it is exercised;
(4) re-capture real-device fixtures across all four workspaces; (5) bind outdoor/solar/rain
to the real WS90 `1242D` and remove the fabricated `wh25`/`C7` mapping so indoor/baro render
**no** radio indicator; (6) redeploy all three amd64 images and live-verify.

## Technical Context

**Language/Version**: TypeScript 5.x (ES modules), Node.js 20 (poller/api), browser DOM (web).

**Primary Dependencies**: Zod (shared schema/validation), Vitest (unit), Playwright (web e2e),
native `fetch` with `AbortController` (poller gateway client). No new dependencies.

**Storage**: SQLite (system of record) — **untouched** by this fix. The served
`sensorHealth` snapshot is projected in the poller and served by the API; no schema/migration
change.

**Testing**: Vitest across `packages/shared`, `apps/poller`, `apps/api`, `apps/web`;
Playwright e2e in `apps/web`. Fixtures re-captured from the real GW2000B (de-identified static
JSON — radio hex ids only, no PII), consistent with the constitution's Test Data Separation
rule (tests never touch the live gateway/DB).

**Target Platform**: Self-hosted Docker (amd64) on the household mini-PC (prod
`192.168.10.5:8090`); kitchen kiosk (2014 Surface Pro 3, Ubuntu) for the web UI.

**Project Type**: Web application — monorepo with `packages/shared` (contracts),
`apps/poller` (cross-VLAN collector), `apps/api` (read server), `apps/web` (static frontend).

**Performance Goals**: Unchanged. `get_sensors_info` is fetched on the existing poll cadence
under the reused 5 s fail-fast `AbortController` timeout; a parse failure must never block the
readings write path.

**Constraints**: Pull-only across the one-way main→IoT VLAN boundary (poller is the sole
cross-VLAN consumer — unchanged). Honest degradation (007 US4) preserved. Storage UTC / display
`America/New_York`. 100% coverage hard gate.

**Scale/Scope**: Two registered radios today (WS90 + wh31 CH2); 16-entry pages with 14–15
placeholders each. Four workspaces touched; no new endpoints, columns, or history.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | Fix *removes* complexity: a bare-array parse is simpler than the wrapper walk; the fabricated `wh25`/`C7` binding is deleted. No new abstractions. |
| II. YAGNI | ✅ PASS | No new capability. Reading indoor/baro battery from `get_livedata_info`'s `wh25[]` is explicitly out of scope. |
| III. SRP | ✅ PASS | Fetch (poller) vs. project (shared) vs. bind (web) separation preserved. Bare-array extraction and per-entry projection stay distinct helpers. |
| IV. TDD (NON-NEGOTIABLE) | ✅ PASS | Bug-fix regression tests first: each defect gets a failing test (Red) against re-captured real fixtures before the Green fix. 100% coverage on shared/poller/web (api re-verified). |
| Test Data Separation | ✅ PASS | Fixtures are de-identified static captures (radio hex ids only). No test reads the live gateway/DB. |
| Bug Fix Regression Tests | ✅ PASS | This entire feature is the required regression suite for the five 007 defects. |
| Network Boundary Integrity | ✅ PASS | No new firewall pinhole; poller remains the sole main→IoT consumer of `get_sensors_info`. |
| Input Validation | ✅ PASS | Parser rejects/skips malformed pages without throwing or corrupting the store (FR-002). |
| Display Timezone | ✅ PASS | No new user-facing timestamp; `lastSeenUtc` stays UTC, any display remains Eastern. |
| Local Type-Checking Parity | ✅ PASS | `npm run typecheck` per workspace, unchanged. |
| CI Coverage Gate 100% | ✅ PASS | Re-captured fixtures include placeholders that exercise the registered-filter and `"--"→null` branches, keeping 100% honest. |
| Container Images / Reproducible Stack | ✅ PASS | All three images rebuilt from repo Dockerfiles, immutable tags, redeployed via the ship-images runbook. |

**Result**: No violations. Complexity Tracking section left empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-fix-sensors-info-contract/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── get-sensors-info-input.md   # corrected bare-array input contract
├── spec.md              # /speckit.specify output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/
├── src/
│   └── schema.ts                         # normalizeSensorHealth: bare-array parse;
│                                         #   registered keyed on id; "--"→null; RawSensorsInfo type
└── tests/
    ├── (sensor-health test)              # Red-first regression cases against real fixtures
    └── fixtures/sensorHealth/
        ├── merged.json                   # rebuilt: merged real bare arrays (registered = WS90 1242D + wh31 A0)
        └── garbage.json                  # non-array guard fixture (kept)

apps/poller/
├── src/
│   └── gatewayClient.ts                  # fetchSensorsInfo: per-page bare array,
│                                         #   merge/dedup by id, skip non-array page, never throw
└── tests/
    ├── (sensorsInfo test)                # contract tests updated to bare-array shape
    └── fixtures/sensorsInfo/
        ├── page1.json                    # replaced with real 16-entry bare array (WS90 registered)
        └── page2.json                    # replaced with real 16-entry bare array (wh31 registered)

apps/web/
├── src/
│   ├── sensorCardMap.ts                  # outdoor/solar/rain → WS90 1242D; remove wh25/C7 mapping;
│                                         #   indoor/baro NOT in the map (no radio indicator)
│   └── render/
│       ├── index.ts                      # attachCardIndicators honest for cards with no backing sensor
│       └── sensorIndicator.ts            # (verify) no fabricated radio indicator for wired/absent
├── e2e/
│   └── fixtures.ts                       # sensorHealth blocks → WS90 + wh31 only (no C7 wh25 row)
└── tests/                                # unit tests for sensorCardMap + render updated

apps/api/                                 # likely unaffected — re-verified (serves envelope unchanged)
```

**Structure Decision**: Existing four-workspace monorepo (web application). No new files beyond
this feature's docs; all changes are edits to the five 007-authored source files plus their
fixtures/tests. The corrected input contract doc lives in `contracts/`.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
