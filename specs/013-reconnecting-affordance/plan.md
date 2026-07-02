# Implementation Plan: Reconnecting Affordance (Visible Outage Cue)

**Branch**: `013-reconnecting-affordance` | **Date**: 2026-07-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-reconnecting-affordance/spec.md`

**GitHub Issues**: Feature #56 (parent) · User Story #57 (US1)

## Summary

Feature 012 (kiosk self-heal) already shipped and 100%-covered an edge-triggered
reconnect signal in the dashboard's poll loop
([apps/web/src/main.ts](../../apps/web/src/main.ts)): `startPollLoop` accepts an
optional `onReconnectingChange(active: boolean)` callback that fires `true` once
on the first failed tick after a healthy one and `false` once on the first
success after a failure — never re-firing on consecutive same-state ticks. That
signal is currently **unconsumed**: nothing on screen reflects it.

This feature renders that signal as a subtle, kiosk-legible cue — a small quietly
pulsing dot plus a short "Reconnecting…" label — co-located with the header
clock/freshness area, reusing the existing Fresh/Stale visual language
(`--cp-warning`). The cue appears when the loop starts failing and clears
automatically when data flows again, while the last-known panel values stay on
screen untouched.

**Technical approach**: one new pure-ish render helper
(`apps/web/src/render/reconnecting.ts`) that builds a hidden cue element and
toggles it from a boolean; `mountDashboard` inserts that cue into the header
element and exposes a new `setReconnecting(active)` method on the returned
`Dashboard`; and a single wiring line in the coverage-excluded
[apps/web/src/bootstrap.ts](../../apps/web/src/bootstrap.ts) forwards
`onReconnectingChange` into `dashboard.setReconnecting`. No API, poller, shared,
contract, or data-model change. Web-display layer only.

## Technical Context

**Language/Version**: TypeScript 5.x (ES modules, `strict`), targeting the
browser via Vite.

**Primary Dependencies**: Vite (build/preview), Vitest + jsdom (unit),
Playwright (e2e). No new runtime dependency is added — the cue is hand-built DOM
via the existing `el()` helper in [apps/web/src/render/dom.ts](../../apps/web/src/render/dom.ts)
and a few lines of CSS.

**Storage**: N/A. The reconnecting condition is transient in-memory display
state only (FR-008) — never persisted, never survives reload.

**Testing**: Vitest DOM unit tests under `apps/web/tests/render/` for the new
render helper and the `mountDashboard` seam (must hold 100% coverage);
a required Playwright e2e under `apps/web/e2e/` mirroring
[selfheal.spec.ts](../../apps/web/e2e/selfheal.spec.ts) (route-stub the API to
fail then recover) — the sole automated gate for the SC-001/SC-002 timing bound.

**Target Platform**: Always-on wall kiosk (2014-era Surface Pro 3, Ubuntu,
viewed from ~3 m) plus household phones over the LAN. The cue must be subtle yet
legible across the room.

**Project Type**: Web (monorepo). This slice touches **only** `apps/web`.

**Performance Goals**: No new polling and no new network calls (FR-010/FR-011);
the cue is driven solely by the existing loop. Toggling the cue is an O(1) class
change on one element — well within the constitution's 500 ms responsiveness bar.

**Constraints**: Subtle, freshness-language, NOT a banner/modal (FR-006/FR-007);
must never blank, clear, overwrite, or corrupt panel values (FR-004); must not
introduce any new user-visible timestamp or change timezone presentation
(FR-009).

**Scale/Scope**: One new ~30-line render helper, one new `Dashboard` method, one
CSS block (dot + label + quiet pulse keyframes), one bootstrap wiring line, and
their unit tests. No historical/large-data concerns.

### Cadence clarification (intervalMs vs POLL_CADENCE_SECONDS)

The spec's "within one poll interval" (SC-001/SC-002) refers to the
**data-refresh cadence that drives `startPollLoop`** — its `intervalMs`
(default `10_000` ms in [main.ts](../../apps/web/src/main.ts), configured from
`VITE_UI_REFRESH_SECONDS ?? "10"` in bootstrap). It is **NOT** the
`POLL_CADENCE_SECONDS = 30` staleness threshold in
[freshness.ts](../../apps/web/src/render/freshness.ts), which governs the
per-panel Fresh→Stale dimming. Because the reconnect signal is edge-triggered on
the very next fail/success tick, the cue's appear/clear latency is bounded by one
`intervalMs` (~10 s by default), independent of the 30 s staleness rule. Tasks
and tests MUST quantify timing against `intervalMs`, not `POLL_CADENCE_SECONDS`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | One render helper + one method + one wiring line + a CSS block. No new abstraction, no new dependency, no state machine — the driver already exists. |
| II. YAGNI | ✅ PASS | Renders exactly the already-shipped signal. No dismiss button, no escalation, no persistence, no config — none are required by the spec (explicitly Out of Scope). |
| III. Single Responsibility | ✅ PASS | `reconnecting.ts` only builds/toggles the cue. `mountDashboard` only wires it in. `main.ts` (unchanged) owns detection. bootstrap owns composition. Each unit has one reason to change. |
| IV. TDD + 100% Coverage | ✅ PASS | The render helper and the `mountDashboard` seam are covered-gate files → Red-Green unit tests first (appear / clear / never-on-success / idempotent-steady / values-untouched). bootstrap.ts is coverage-EXCLUDED per [vitest.config.ts](../../apps/web/vitest.config.ts), matching the existing self-heal wiring convention. |
| Display Timezone | ✅ PASS | FR-009: no new timestamp, no timezone change. The cue is a static "Reconnecting…" label + dot; it renders no time. |
| Platform / Web layer only | ✅ PASS | FR-011: no data-serving, contract, stored-data, or reconnect-state-machine change. Confined to `apps/web`. |
| Local Type-Checking Parity | ✅ PASS | `npm run typecheck` in `apps/web` already runs `tsc`; the new file is plain typed DOM code. |

**Result**: PASS. No violations; Complexity Tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-reconnecting-affordance/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — decisions & rationale
├── data-model.md        # Phase 1 output — the in-memory display-state entity
├── quickstart.md        # Phase 1 output — how to validate the cue end-to-end
├── contracts/
│   └── render-seam.md   # Phase 1 output — in-memory render seam; NO API/data contract change
├── spec.md              # Feature spec (input)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── main.ts                    # UNCHANGED — owns onReconnectingChange (the sole driver)
│   ├── bootstrap.ts               # +1 wiring line (coverage-EXCLUDED composition root)
│   ├── styles.css                 # + .reconnecting-cue dot/label + quiet pulse keyframes
│   └── render/
│       ├── index.ts               # mountDashboard gains setReconnecting(active); Dashboard type extended
│       ├── reconnecting.ts        # NEW — createReconnectingCue(doc): { element, set(active) }
│       ├── header.ts              # UNCHANGED — clock stays isolated
│       └── freshness.ts           # UNCHANGED — POLL_CADENCE_SECONDS reused only as reference
└── tests/
    ├── render/
    │   ├── reconnecting.test.ts   # NEW — appear/clear/never-on-success/idempotent-steady
    │   └── index.test.ts          # + setReconnecting seam assertions (cue toggles, panels untouched)
    └── (e2e)
apps/web/e2e/
└── reconnecting.spec.ts           # stub API fail→recover; cue appears then clears, values persist
```

**Structure Decision**: Web monorepo, single affected package `apps/web`. The
render helper lives beside its sibling render modules under `src/render/`; its
unit test lives beside the other render tests under `tests/render/`. The wiring
line lives in the already-coverage-excluded `bootstrap.ts`, exactly as the
Feature-012 self-heal wiring does today.

## Complexity Tracking

> No Constitution Check violations. This table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
