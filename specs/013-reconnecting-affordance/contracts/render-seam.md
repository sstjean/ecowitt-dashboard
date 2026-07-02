# Contract: In-Memory Render Seam (NO API / Data Contract Change)

**Feature**: 013-reconnecting-affordance · **Date**: 2026-07-02

## There is NO external contract change

This feature is confined to the web-display layer (FR-011). It introduces **no**
new or modified:

- HTTP API endpoint, request, or response (`apps/api` is untouched)
- Poller / ingestion behaviour (`apps/poller` is untouched)
- Shared-package type or schema (`packages/shared` is untouched)
- Persisted data, database column, or stored reconnect history
- Response-contract field consumed by the client

The `LatestSnapshot` shape and every existing API contract remain byte-for-byte
identical. The reconnect signal is already-shipped in-memory plumbing from
Feature 012; this feature only renders it.

The only "contract" this feature defines is an **in-memory seam** between three
existing web modules. It is documented here for reviewers, but it is a TypeScript
interface, not a wire contract, and requires no versioning.

---

## In-memory seam (TypeScript surface)

### 1. Driver → composition (already exists — UNCHANGED)

Defined in [apps/web/src/main.ts](../../../apps/web/src/main.ts):

```ts
interface PollLoopDeps {
  // …existing fields…
  /** Edge-triggered: true on first failed tick, false on first success after. */
  onReconnectingChange?: (active: boolean) => void;
}
```

The feature **consumes** this. It does not alter its signature or semantics.

### 2. Render helper (NEW)

`apps/web/src/render/reconnecting.ts`:

```ts
export interface ReconnectingCue {
  /** The cue element to insert into the header status area. */
  element: HTMLElement;
  /** Show (true) / hide (false) the cue. Idempotent; never restarts the pulse. */
  set(active: boolean): void;
}

export function createReconnectingCue(doc: Document): ReconnectingCue;
```

Behavioural contract:

- Newly created ⇒ cue **hidden** (never shown before a failure — FR-003).
- `set(true)` ⇒ cue **visible** (dot + "Reconnecting…" label).
- `set(false)` ⇒ cue **hidden**.
- `set(x)` when already in state `x` ⇒ **no-op**; no re-insert, no animation
  restart (FR-005).
- `set` mutates **only** `element`; it MUST NOT read/write any panel node
  (FR-004).

### 3. Dashboard seam (EXTENDED)

[apps/web/src/render/index.ts](../../../apps/web/src/render/index.ts) — the
`Dashboard` interface gains one method:

```ts
export interface Dashboard {
  update(snapshot: LatestSnapshot): void; // existing
  stop(): void;                           // existing
  /** Show/hide the reconnecting cue. Delegates to the header-mounted cue. */
  setReconnecting(active: boolean): void; // NEW
}
```

`mountDashboard` creates the cue, inserts `cue.element` into the header status
area, and implements `setReconnecting` as a thin delegate to `cue.set`. Existing
`update` / `stop` behaviour is unchanged.

### 4. Wiring (bootstrap — coverage-EXCLUDED, +1 line)

[apps/web/src/bootstrap.ts](../../../apps/web/src/bootstrap.ts) forwards the
driver edge to the render seam:

```ts
startPollLoop({
  fetchSnapshot: () => fetchLatest(),
  render: (snapshot) => dashboard.update(snapshot),
  onError: (error) => console.error("snapshot poll failed", error),
  intervalMs: UI_REFRESH_SECONDS * 1000,
  onReconnectingChange: (active) => dashboard.setReconnecting(active), // NEW
});
```

This file is excluded from the coverage gate
([vitest.config.ts](../../../apps/web/vitest.config.ts)), consistent with the
existing self-heal wiring; the composed behaviour is validated by the required
Playwright e2e.
