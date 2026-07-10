# Implementation Plan: Rain-Fault Leading-Edge False Positive Fix (014)

**Branch**: `014-rain-fault-leading-edge` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/014-rain-fault-leading-edge/spec.md](./spec.md)

**Source of truth**: GitHub Issues [#60](https://github.com/sstjean/ecowitt-dashboard/issues/60) / [#61](https://github.com/sstjean/ecowitt-dashboard/issues/61) / [#62](https://github.com/sstjean/ecowitt-dashboard/issues/62). This markdown is a derived tool; if they disagree, the Issues win.

## Summary

Amend the Feature 008 rain-gauge "not measuring" detector so an approaching storm's
**leading edge** (storm signature present, rain legitimately not yet fallen) no longer
raises a false fault, while a genuinely dead gauge during a **sustained** downpour still
does. Feature 008 fired on every approaching storm because "storm signature + zero rain"
on the leading edge is indistinguishable from the fault it hunts for.

**Technical approach**: Add a **sustained-duration gate** on top of the existing 008
gate+quorum. The detector already evaluates the storm signature (piezo gate holding AND
≥ `MIN_PROXIES` of 5 storm proxies) over the full rolling window ending at `now`. The fix
**additionally** requires that same signature to have **already held `SUSTAIN_MIN = 45`
minutes earlier** — i.e. re-evaluate gate+quorum over the sub-window ending at
`now − SUSTAIN_MIN`, and raise a fault only when **both** evaluations hold. On a leading
edge the signature had not yet appeared 45 min ago (the earlier sub-window fails the
quorum) → suppressed. For a dead gauge the signature was already present 45 min ago with
rain still zero → still fires.

The change is a **monotonic tightening**: the sustained gate can only turn a `true`
verdict into `false`, never the reverse. Therefore every existing 008 **negative fixture**
stays negative. Note, however, that the 008 **positive builder tests** use short synthetic
windows (default `spanMin = TREND_MIN = 30`) whose `now − SUSTAIN_MIN` sub-window is empty
and therefore un-assessable — under the sustained gate these would flip to `false`. Those
positive builders MUST be re-anchored to *sustained* windows (spanning ≥ `SUSTAIN_MIN +
TREND_MIN`, with each 30-min delta preserved) so they still fire; this is an explicit
foundational task, not an incidental consequence. The single 008 positive **fixture**
(2026-06-28 dead-gauge downpour) is already sustained for hours and only needs re-confirming.

**Confined to the API detector**: only [apps/api/src/rainFault.ts](../../apps/api/src/rainFault.ts)
and its tests change. `SUSTAIN_MIN` is a new named tunable in `RAIN_FAULT_DEFAULTS` (no
magic literal in control flow). The `/api/v1/latest` envelope, the shared schema, the
route call site, the web, and the poller are all **unchanged**. The 90-minute rolling
window is unchanged (90 − 45 = 45 min remains for the earlier sub-window, ≥ `TREND_MIN` of
30 — sufficient; confirmed in [research.md](./research.md)).

## Technical Context

**Language/Version**: TypeScript 5.x (ES modules, `.ts` extensions), Node 22.

**Primary Dependencies**: Fastify (API), better-sqlite3 (read store), Zod (`@ecowitt/shared` schemas), SunCalc (astro), Vitest (tests). No new dependency.

**Storage**: SQLite (`readings` table, `metrics_json`). Read-only from the API. No new fields, no schema change.

**Testing**: Vitest unit + acceptance, 100% coverage gate. Committed static-capture fixtures only (Constitution: Test Data Separation) — trimmed, deterministic `StoredReading[]` extracts of the real production windows, replayed; the live DB is never read at test time. New leading-edge fixture generated **once, read-only, off-host** from `/tmp/ecowitt-014capture.sqlite`.

**Target Platform**: Self-hosted Docker Compose on the LAN host; wall kiosk (Chromium) for the web (unchanged by this feature).

**Project Type**: Web (monorepo: `apps/api` + `apps/web` + `packages/shared`). This feature touches `apps/api` only.

**Performance Goals**: Detection stays synchronous inside `/latest` over the ≤90-min window. The sustained gate adds one extra pass of the same sub-millisecond rolling-delta scan over a subset of the window — negligible.

**Constraints**: Local-only (no NWS precip cross-check, 008 FR-012 stands); pure & per-request (no persisted latch); graceful degradation on short/sparse windows (FR-013); Storage=UTC / Display=America/New_York (NON-NEGOTIABLE, not relevant to detector logic but honored by the unchanged indicator); Ambient `rain_0x*` still ignored.

**Scale/Scope**: One threshold constant added, one detector refactor + one new gate, one new test fixture, new tests. Single household, single gauge.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | One additional gate re-using the existing gate+quorum evaluation via an extracted pure helper; no new endpoint, storage, dependency, or layer. |
| II. YAGNI | ✅ PASS | Pure sustained-duration only. Pressure-bottomed/recovery criterion **rejected** (FR-015) — not built. `SUSTAIN_MIN` is a single named constant, not a rules engine. |
| III. SRP | ✅ PASS | Extract `signatureFired(samples, end, isDay, th)` (readiness + gate + quorum → fired list or null) so `detectRainFault` composes it twice (full window + earlier sub-window). "Evaluate signature at a point" is separated from "compose the sustained decision" — DRY, no duplicated gate/quorum logic. |
| IV. TDD / 100% coverage | ✅ PASS (planned) | Red-Green-Refactor; AAA tests. New leading-edge fixture (expected `false`) + re-confirm the 06-28 sustained fixture (expected `true`) + a `SUSTAIN_MIN` boundary test + sub-window graceful-degradation test + a representative approaching-storm sweep (SC-005). The 008 **positive builder** tests are re-anchored to sustained windows so they stay GREEN under the gate (negatives are unaffected). Every new branch covered. |
| Display Timezone | ✅ PASS | No new user-facing timestamp; the unchanged indicator keeps its Eastern rendering. |
| Local Type-Checking Parity | ✅ PASS | `npm run typecheck` in `apps/api` covers the change; the return type `RainFaultState` is unchanged. |
| Offline-First | ✅ PASS | Local WS90 only; no NWS precip call (FR-008 / 008 FR-012). |
| Test Data Separation | ✅ PASS | New fixture is a committed static capture (no PII); the production DB was read **once, read-only, off-host** to derive/validate the threshold (research provenance), never at test time. |

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/014-rain-fault-leading-edge/
├── plan.md              # This file
├── research.md          # Phase 0 — SUSTAIN_MIN=45 + pure-duration decision, data evidence
├── data-model.md        # Phase 1 — RainFaultThresholds addition (SUSTAIN_MIN), sub-window entity
├── quickstart.md        # Phase 1 — runnable validation scenarios (SC-001..SC-006)
├── contracts/
│   ├── rain-fault-detector-amendment.md  # detector delta: SUSTAIN_MIN + sustained-gate behaviour
│   └── latest-envelope-unchanged.md      # explicit statement that /api/v1/latest is UNCHANGED
├── spec.md
└── tasks.md             # (created later by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── rainFault.ts         # AMEND — add SUSTAIN_MIN to RainFaultThresholds + RAIN_FAULT_DEFAULTS;
│                        #   extract signatureFired() helper (readiness+gate+quorum);
│                        #   detectRainFault() gains the sustained sub-window gate + updated reason
└── routes/v1/latest.ts  # UNCHANGED — still calls detectRainFault(window, now, isDay) with
                         #   defaults; RAIN_FAULT_WINDOW_MIN stays 90

packages/shared/src/
└── schema.ts            # UNCHANGED — RainFaultState shape (rainSensorSuspect, rainSensorReason) unchanged

apps/web/                # UNCHANGED — presentation-only consumer of rainSensorSuspect
apps/poller/             # UNCHANGED

scripts/
└── gen-rain-fault-fixtures.py  # EXTEND — emit leading-edge-07-06.json from the 014 capture and
                                #   self-verify (008-would-be-TRUE, 014-sustained-FALSE)

apps/api/tests/
├── rainFault.test.ts                          # EXTEND — leading-edge suppression (US1), no-regression
│                                              #   on 06-28 storm (US2), SUSTAIN_MIN boundary, sub-window degrade
└── fixtures/rainFault/
    └── leading-edge-07-06.json                # NEW — captured 2026-07-06 leading-edge window (expected false)
```

**Structure Decision**: The fix stays in `apps/api/src/rainFault.ts` — the same locus as
008 — because it operates purely over the API-side rolling `StoredReading` window. The
shared package is untouched (the `RainFaultState` type and the envelope contract are
unchanged). The web remains a presentation-only consumer. This mirrors the 008 structure
decision exactly.

## Phase 0 — Research

See [research.md](./research.md). Both open questions are resolved (and pinned in the spec
as FR-014/FR-015):

- **SUSTAIN_MIN = 45 min** — calibrated against the two real captures: the 07-06 leading
  edge sustained its signature only ~25–40 min before rain opened the gate; the 06-28
  dead-gauge signature sustained for hours. 45 min sits cleanly between them.
- **No pressure-bottomed / recovery criterion** — pure sustained-duration. The 07-06
  capture shows pressure *rising* at onset (gust-front jump), making pressure recovery an
  unreliable leading-edge discriminator.
- **Window length unchanged (90 min)** — 90 − 45 = 45 min available for the earlier
  sub-window ≥ `TREND_MIN` (30). Confirmed sufficient; no change to `RAIN_FAULT_WINDOW_MIN`.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the `RainFaultThresholds.SUSTAIN_MIN` addition, the
  earlier sub-window as a transient analysis entity, and confirmation that no persisted
  storage or envelope field changes.
- [contracts/rain-fault-detector-amendment.md](./contracts/rain-fault-detector-amendment.md)
  — the detector delta: new constant, extracted `signatureFired` helper, sustained-gate
  behaviour rows (C8/C9), updated reason string, preserved 008 invariants.
- [contracts/latest-envelope-unchanged.md](./contracts/latest-envelope-unchanged.md) — an
  explicit no-change record for `/api/v1/latest` (SC-006).
- [quickstart.md](./quickstart.md) — runnable validation scenarios mapped to SC-001..SC-006.

**Post-Design Constitution Re-check**: PASS — the design adds one named constant, one
extracted pure helper, and one additional gate; no new layers, dependencies, endpoints, or
storage were introduced during design. The monotonic-tightening property guarantees no
008 negative regresses.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
