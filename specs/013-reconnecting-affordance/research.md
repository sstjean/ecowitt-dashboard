# Phase 0 Research: Reconnecting Affordance

**Feature**: 013-reconnecting-affordance · **Date**: 2026-07-02

This feature has no external unknowns (no new dependency, no network call, no
data contract). "Research" here is a set of grounded design decisions against the
actual `apps/web` codebase. Each records the decision, rationale, and rejected
alternatives.

---

## D1 — Driver: consume the existing edge-triggered signal, unchanged

- **Decision**: Use `startPollLoop`'s existing `onReconnectingChange(active:
  boolean)` callback in [apps/web/src/main.ts](../../apps/web/src/main.ts) as the
  **sole** driver. Do not modify `main.ts`.
- **Rationale**: The signal is already implemented and 100%-covered (Feature
  012). It is edge-triggered — `setReconnecting` inside the loop early-returns
  when `active === reconnecting`, so `onReconnectingChange` fires exactly once
  per real transition. That directly satisfies FR-005/FR-010/SC-005 (single
  appearance, no per-tick flicker) with zero new detection logic.
- **Alternatives considered**:
  - *Track failures in the render layer* — rejected: duplicates the state
    machine (FR-010 forbids), risks double-counting, adds untested branches.
  - *Debounce/threshold before showing* — rejected: YAGNI; the spec wants the
    cue on the first failed tick, and the signal is already clean.

## D2 — Timing bound: `intervalMs`, not `POLL_CADENCE_SECONDS`

- **Decision**: Quantify "within one poll interval" (SC-001/SC-002) against the
  loop's `intervalMs` — default `10_000` ms in `main.ts`, set from
  `VITE_UI_REFRESH_SECONDS ?? "10"` in bootstrap.
- **Rationale**: The reconnect edge fires on the *next* tick (fail or success),
  so appear/clear latency is bounded by one `intervalMs`. The `30 s`
  `POLL_CADENCE_SECONDS` in [freshness.ts](../../apps/web/src/render/freshness.ts)
  is a **different** quantity — the Fresh→Stale staleness threshold (3× cadence
  for panel dimming) — and is irrelevant to the cue's latency.
- **Alternatives considered**:
  - *Measure against 30 s staleness* — rejected: conflates two unrelated
    cadences and would over-state the cue's latency by 3×.

## D3 — Visual treatment: quiet pulsing dot + short "Reconnecting…" label

- **Decision**: A small dot (≈8–10 px) tinted `--cp-warning` (the same token the
  `.stale-badge` uses) with a slow, low-amplitude opacity pulse, followed by a
  short uppercase-tracked "Reconnecting…" label in the same muted-warning color.
  Hidden by default; shown via a single class/`hidden` toggle.
- **Rationale**: FR-006/FR-007 demand subtle, freshness-language, non-banner.
  Reusing `--cp-warning` and the small-caps/letter-spacing treatment already seen
  in `.stale-badge` keeps it in the existing Fresh/Stale vocabulary. A gentle
  pulse reads as "working on it" from ~3 m without shouting. No layout shift, no
  color the palette doesn't already use.
- **Alternatives considered**:
  - *Full-width banner / modal / toast* — rejected outright by FR-006.
  - *Spinner icon* — rejected: heavier, not in the current visual language, and
    animation cost on the aging kiosk GPU is unnecessary. A CSS opacity pulse is
    cheap.
  - *Reusing the literal "STALE" badge text* — rejected: staleness (aged data)
    and reconnecting (active outage) are distinct states (Edge Case: "MUST NOT
    interfere with the existing Fresh/Stale presentation"). Distinct label, same
    color family.

## D4 — Placement: header clock/freshness area, injected by `mountDashboard`

- **Decision**: `mountDashboard` builds the cue and inserts it into the
  **header element** (the top-of-display status zone that already carries the
  clock). The cue is positioned so it sits next to / just under the right-aligned
  `.h-time` clock without disturbing the header's three-column grid
  (`1fr auto 1fr`). `.header` gets `position: relative`; the cue is
  `position: absolute` (out of flow → grid untouched).
- **Rationale**: The codebase's "freshness stamp area" is the header status
  strip (clock) plus the per-panel Fresh/Stale badges. A single global
  reconnecting state belongs at the display level, co-located with the clock, not
  duplicated per panel. Injecting from `mountDashboard` (not `header.ts`) keeps
  `header.ts`'s single responsibility (the clock) intact and avoids rewriting its
  tests.
- **Alternatives considered**:
  - *Put the cue inside `.h-time`* — rejected: `header.update()` overwrites
    `time.textContent` every second, which would wipe a child node.
  - *Modify `header.ts` to own the cue* — rejected: widens header's
    responsibility and churns header tests for no benefit; `mountDashboard`
    already composes header + health overlay, so it is the natural owner.
  - *A new panel/row* — rejected: not subtle, consumes kiosk real estate,
    violates FR-006.

## D5 — Seam shape: `createReconnectingCue(doc) → { element, set(active) }`

- **Decision**: New module `apps/web/src/render/reconnecting.ts` exporting a
  factory that returns `{ element: HTMLElement; set(active: boolean): void }`.
  `set(true)` reveals the cue; `set(false)` hides it. `set` is idempotent — it
  toggles a class/`hidden` flag, so calling it with the current value is a no-op
  and never restarts the pulse animation (FR-005). `mountDashboard` holds the cue
  and exposes `setReconnecting(active)` on the `Dashboard` object, delegating to
  `cue.set`.
- **Rationale**: Mirrors the existing factory style (`createHeader`,
  `createSensorHealthPage`) — a builder returning an element plus a small imperative
  API. Pure-ish and trivially unit-testable in jsdom. Toggling a class (rather
  than re-appending/removing the node) means the pulse animation is not reset on
  repeated `set(true)` calls, satisfying the "steady, no re-animate" requirement.
- **Alternatives considered**:
  - *Append/remove the node on each change* — rejected: re-inserting restarts CSS
    animation and risks flicker; a class toggle is steadier and cheaper.
  - *Pass the boolean through `update(snapshot)`* — rejected: the reconnect state
    is orthogonal to snapshot data and arrives on a different edge; folding it
    into `update` couples two concerns and risks touching panel values (FR-004).

## D6 — Panel-safety: the cue never touches panel values (FR-004)

- **Decision**: `setReconnecting` mutates only the cue element. It never queries,
  reads, writes, or clears any `[data-panel]` / `[data-ring]` / `.card` node.
- **Rationale**: FR-004/SC-003 require 100% of last-known values to remain
  visible during an outage. Because the cue lives in the header and the toggle is
  scoped to the cue element, the panels are structurally untouched. This is also
  directly asserted in the seam unit test (snapshot panel HTML before/after
  `setReconnecting(true)` → unchanged).

## D7 — State lifetime: in-memory only (FR-008)

- **Decision**: No persistence. The cue's shown/hidden state lives only as DOM
  class state for the running session and resets naturally on reload.
- **Rationale**: FR-008 forbids persisting or surviving reload. There is nothing
  to store — the driver re-derives the state from live ticks after any reload.
- **Alternatives considered**: *localStorage/sessionStorage* — rejected: violates
  FR-008 and adds pointless complexity.

## D8 — No new timestamp / timezone (FR-009)

- **Decision**: The cue renders a fixed "Reconnecting…" label and a dot — no time
  value of any kind. The header clock (`America/New_York`, unchanged) remains the
  only time on screen.
- **Rationale**: FR-009 forbids any new user-visible timestamp or timezone
  change. Confirmed by inspection: neither the render helper nor the seam formats
  or reads a date. No `format/eastern.ts` usage is introduced.

## D9 — Testing strategy

- **Decision**:
  - **Unit (Vitest + jsdom, covered gate)** in
    `apps/web/tests/render/reconnecting.test.ts`:
    (a) hidden on creation; (b) `set(true)` reveals the cue (dot + label present);
    (c) `set(false)` hides it; (d) never-on-success = default hidden with no
    `set(true)`; (e) idempotent steady = `set(true)` twice yields one cue and does
    not re-toggle/re-insert (no animation restart).
  - **Seam (extend `tests/render/index.test.ts`)**: `mountDashboard` exposes
    `setReconnecting`; toggling it shows/hides the cue in the header; panel HTML is
    byte-identical before/after (FR-004).
  - **E2e (Playwright), required** in `apps/web/e2e/reconnecting.spec.ts` mirroring
    [selfheal.spec.ts](../../apps/web/e2e/selfheal.spec.ts): route-stub
    `**/api/v1/latest` to succeed, then fail, then succeed; assert the cue appears
    after failures and clears after recovery while a known value (e.g.
    `[data-out-temp]`) stays visible throughout.
- **Rationale**: The covered files (`reconnecting.ts`, `index.ts`) reach 100%
  through fast jsdom unit tests. `bootstrap.ts` stays coverage-EXCLUDED
  ([vitest.config.ts](../../apps/web/vitest.config.ts)), so the one wiring line
  needs no unit test — the required e2e exercises the real composed wiring
  instead, matching the Feature-012 precedent.
- **Alternatives considered**: *Unit-test bootstrap wiring* — rejected: bootstrap
  is intentionally excluded from coverage; wiring is validated at the e2e layer.

## D10 — Constitution posture

- **Decision**: Web-display layer only. No change to API, poller, shared package,
  response contracts, stored data, or the reconnect state machine.
- **Rationale**: FR-011 + Out of Scope. Confirmed by the file list in
  [plan.md](plan.md): only `apps/web/src/render/*`, `apps/web/src/styles.css`,
  `apps/web/src/bootstrap.ts`, and `apps/web/tests/*` are touched.
