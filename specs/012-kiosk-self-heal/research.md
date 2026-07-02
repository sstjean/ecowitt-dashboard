# Phase 0 Research: Kiosk Self-Heal on Deploy

All Technical Context items were resolvable from the existing codebase; there were
no open `NEEDS CLARIFICATION` markers. This document records the design decisions
and the alternatives considered.

## Decision 1 — Single-source build id via Vite (`define` + emitted `version.json`)

**Decision**: Add a small plugin to
[apps/web/vite.config.ts](../../apps/web/vite.config.ts) that computes ONE build id
per build (a timestamp or short content hash) and uses it in two places from that
single value:

1. `define: { __BUILD_ID__: JSON.stringify(buildId) }` — bakes the id into the
   bundle as a compile-time constant so the running page knows its own id with **no
   network request** (FR-002).
2. `generateBundle`/`writeBundle` emits `dist/version.json` = `{ "buildId": buildId }`
   so nginx serves the currently deployed id at `/version.json` (FR-003).

Because both come from the same in-memory `buildId` value, a freshly loaded page
always finds baked == served (FR-004), and any new build produces a new id while an
identical redeploy of the same commit/build produces the same id (FR-001).

**Rationale**: One source of truth, zero runtime cost, no new dependency. Vite's
`define` is the idiomatic compile-time constant mechanism; emitting a sibling static
file reuses nginx's existing static serving with no server code.

**Alternatives considered**:

- *Hash the built `index.html` at runtime* — rejected: no baked id to compare
  against, and asset-hash filenames already change per build but aren't a single
  comparable token.
- *Read the git SHA at runtime from an API endpoint* — rejected: requires an
  API/poller change, violating FR-020 (web-layer-only) and adding a cross-service
  dependency.
- *Inject the id only into `index.html` as a meta tag* — rejected: the SPA fallback
  (`try_files … /index.html`) means a stale cached `index.html` could mask a deploy;
  a dedicated no-store `version.json` is cleaner to fetch and reason about.

## Decision 2 — `version.json` served by existing nginx, fetched no-store

**Decision**: Serve `version.json` as a plain static file from `dist` (nginx
`location /` already covers it). The client fetches it with `fetch('/version.json',
{ cache: 'no-store' })` so it never reads a stale cached copy (FR-006). Optionally
add an nginx `location = /version.json { add_header Cache-Control "no-store"; }`
belt-and-suspenders block, but `no-store` on the request is the primary guarantee.

**Rationale**: Reuses existing static serving (Simplicity). `cache: 'no-store'` is
the correct, well-supported client-side directive to bypass the HTTP cache for a
liveness probe.

**Alternatives considered**:

- *Cache-busting query string (`?t=Date.now()`)* — rejected: works but pollutes
  logs and is redundant with `no-store`; `no-store` is the semantically correct
  tool.
- *A new API endpoint for the version* — rejected: FR-020 forbids touching the
  data-serving layer for this behaviour.

## Decision 3 — `selfHeal.ts`: no-store fetch + pure reload-once decision

**Decision**: Split the module into a pure decision function and a thin effectful
runner (SRP):

- `decideReload(runningId: string, servedId: string | null): boolean` — pure:
  returns `true` **only** when `servedId` is a non-null, non-empty string that
  differs from `runningId`; returns `false` on equal ids and on `null`/unknown.
- `checkForUpdate(deps)` — effectful: fetches `/version.json` no-store, parses
  `buildId`, calls `decideReload`, and on `true` invokes `reload()` **once** then
  latches a module-level `hasReloaded` guard so it can never fire twice within a
  page lifetime (FR-007, FR-010). Fetch/parse errors are swallowed to `null` so a
  failed check is treated as "unknown", never "changed" (FR-009). `reload` and
  `fetch` are injected so unit tests need no real network or navigation.

**Rationale**: The pure `decideReload` gives an exhaustive, trivially-100%-covered
decision table; the runner isolates the single side effect. Injecting `reload`/`fetch`
keeps tests deterministic and satisfies the injectable-boundary style already used
in the codebase (e.g. `startPollLoop` deps).

**Alternatives considered**:

- *Compare inside the poll loop directly* — rejected: mixes data-render concerns
  with version concerns, harder to test in isolation, violates SRP.
- *Reload on any fetch difference including errors* — rejected: causes reload storms
  during a flapping deploy (explicit edge case in the spec).

## Decision 4 — Poll-loop reconnect (US2) as a minimal observable state

**Decision**: `startPollLoop` already retries forever (`setInterval` is never
cleared on error; a rejected `fetchSnapshot` routes to `onError` and the next tick
still fires). Add an optional `onReconnectingChange(active: boolean)` (or equivalent
state callback) that fires `true` on the first failure and `false` on the next
success, without touching the last-rendered DOM. The subtle "reconnecting"
affordance (FR-013) consumes that state; last-known values are never blanked
(FR-014) because a failed tick calls neither `render` nor any clear.

**Rationale**: The forever-retry behaviour is already correct — the change is purely
additive observability, keeping the diff minimal and fully testable with fake timers
(the existing `main.test.ts` pattern).

**Alternatives considered**:

- *Rewrite the loop with exponential backoff* — rejected (YAGNI): a fixed cadence
  already recovers "within one poll interval of the server returning" (SC-004); no
  requirement asks for backoff.
- *Blank the panels to a spinner during an outage* — rejected: violates FR-014
  (must preserve last-known values); the spec asks for a *subtle* affordance.

## Decision 5 — Kiosk launcher curl-wait for reachability (US3)

**Decision**: Before the Chrome launch in
[deploy/kiosk/bin/kiosk-weather](../../deploy/kiosk/bin/kiosk-weather), add a bounded
retry loop: `until curl -fsS -o /dev/null --max-time N "$KIOSK_URL"; do sleep S;
done`. Only once the dashboard answers a healthy HTTP response does Chrome launch
(FR-015, FR-016). When the server is already up, the first `curl` succeeds and Chrome
launches promptly (FR-017). The existing `while true` relaunch wrapper is preserved.

**Rationale**: `curl` is already present on the kiosk; a tiny shell loop is the
simplest sufficient fix and is validated by the existing `bats` harness. Keeps the
in-page logic (US1/US2) and the launcher (US3) cleanly separated.

**Alternatives considered**:

- *Chrome flag / retry inside the browser* — rejected: if the initial navigation
  fails there is no page logic to retry (the exact gap US3 exists to close).
- *systemd unit `ExecStartPre` health gate* — viable but heavier; the launcher-local
  loop keeps the reachability concern next to the launch it guards and is testable
  with the current `bats` suite. Revisit only if provisioning already centralises
  such checks.

## Cross-cutting: no data-model / contract change

The version marker is a **build artifact**, not application data. The live-data
envelope (`/api/v1/latest`, validated by `latestSnapshotSchema`) is untouched
(FR-018). The "contract" for this feature is the shape of the static `version.json`
and the `selfHeal` reload decision table — documented in
[contracts/version-json.md](./contracts/version-json.md).
