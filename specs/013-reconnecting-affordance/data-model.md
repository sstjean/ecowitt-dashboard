# Phase 1 Data Model: Reconnecting Affordance

**Feature**: 013-reconnecting-affordance · **Date**: 2026-07-02

> This feature introduces **no persisted data and no API/response schema**. The
> only "entity" is a transient in-memory display flag. There is no database
> table, no shared-package type, and no contract field. See
> [contracts/render-seam.md](contracts/render-seam.md).

---

## Entity: Reconnecting indicator (in-memory display state)

A transient boolean representing "live-data requests are currently failing and
the display is retrying." Derived entirely from the existing edge-triggered
reconnect signal; exists only for the running display session; never persisted
(FR-008).

| Attribute | Type | Values | Source | Notes |
|-----------|------|--------|--------|-------|
| `active` | boolean | `true` = outage/retrying · `false` = healthy | `onReconnectingChange(active)` from `startPollLoop` ([main.ts](../../apps/web/src/main.ts)) | Edge-triggered: emitted once per real transition, never per-tick (FR-005/FR-010). |

### Representation

The flag is **not** stored as a JS variable that the feature owns; it is
materialized purely as DOM state on a single element:

- **Present/visible** cue element ⇔ `active === true`
- **Hidden** cue element ⇔ `active === false`

`setReconnecting(active)` maps the incoming boolean onto that element's
visibility (a class / `hidden` toggle). No shadow copy of the flag is kept, so
there is one source of truth (the driver) and one rendering (the DOM).

### State transitions

```text
        onReconnectingChange(true)
HEALTHY ───────────────────────────►  RECONNECTING
  ▲   (cue hidden)                     (cue visible: dot + "Reconnecting…")   │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
        onReconnectingChange(false)   (cue hidden again — auto, no operator action)
```

- **Initial state**: `HEALTHY` (cue hidden) at mount — the cue is never shown
  before any failure (FR-003/SC-004).
- **HEALTHY → RECONNECTING**: on the first failed tick after a healthy one; cue
  appears once (FR-001/SC-001).
- **RECONNECTING → RECONNECTING** (consecutive failures): **no event fires**
  (edge-triggered); cue stays steady, no flicker/re-animate (FR-005/SC-005).
- **RECONNECTING → HEALTHY**: on the first successful tick; cue clears
  automatically, no operator action, no manual refresh (FR-002/SC-002).
- **Rapid flap** (fail→recover→fail within consecutive ticks): each genuine
  transition emits once; the feature adds no re-trigger of its own.

### Validation / invariants

- **INV-1 (no fabrication)**: the cue's visibility MUST equal the last `active`
  value delivered by the driver — the feature never infers, debounces, or invents
  a value (FR-010).
- **INV-2 (panel-safety)**: toggling `active` MUST NOT read or mutate any
  `[data-panel]`, `[data-ring]`, or `.card` node; last-known values remain
  on screen (FR-004/SC-003).
- **INV-3 (idempotence)**: applying the current `active` value again is a no-op
  and MUST NOT restart the pulse animation or re-insert the node (FR-005).
- **INV-4 (no persistence)**: the state lives only in the DOM for the session;
  reload resets to `HEALTHY` and the driver re-derives from live ticks (FR-008).
- **INV-5 (no timestamp)**: the representation carries no time value; the header
  clock (`America/New_York`) is unaffected (FR-009).

### Lifecycle & ownership

- **Owner of truth**: `startPollLoop` (unchanged). It computes the edge.
- **Owner of rendering**: `createReconnectingCue` (new) + `mountDashboard`
  (extended) — they translate the edge into DOM visibility.
- **Lifetime**: session-scoped; created at `mountDashboard`, destroyed on reload.
- **Cardinality**: exactly one indicator per display session (one cue element).

### Relationship to existing freshness state

The reconnecting indicator is **additive and independent** of the per-panel
Fresh/Stale state (`markPanelStale` / `.card.stale`). They may co-exist (aged
data during an outage), but the reconnecting cue MUST NOT hide, override, or
interfere with the Fresh/Stale presentation, and vice versa (spec Edge Case).
They share only the `--cp-warning` color token for visual consistency.
