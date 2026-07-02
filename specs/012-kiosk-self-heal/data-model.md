# Phase 1 Data Model: Kiosk Self-Heal on Deploy

> **No application data-model or API-envelope change.** This feature adds no
> persisted entity, no column, and no field to the live-data contract
> (`/api/v1/latest` / `latestSnapshotSchema` are untouched — FR-018). The entities
> below are **build/runtime artifacts and transient in-memory state**, not stored
> records. They are documented here for completeness only.

## Build/runtime artifacts

### Build Version Identifier

A short, deterministic token identifying one build of the dashboard.

| Attribute | Value |
|-----------|-------|
| Form | Short string (e.g. build timestamp `2026-07-01T14:32:10Z`-derived, or short content hash) |
| Source | Computed **once per build** inside the Vite build-id plugin |
| Baked copy | Compile-time constant `__BUILD_ID__` embedded in the bundle (FR-002) |
| Published copy | `dist/version.json` → `{ "buildId": "<id>" }` served at `/version.json` (FR-003) |
| Determinism | Identical build ⇒ identical id; any new build ⇒ new id (FR-001) |
| Invariant | Baked id == published id for a freshly loaded page (single source — FR-004) |

**Validation rules**:

- `buildId` MUST be a non-empty string.
- A missing/unparseable `version.json`, or an absent/blank `buildId`, is treated as
  **unknown** (`null`), never as a changed id (FR-009).

### Served Version Marker (`version.json`)

The runtime-retrievable publication of the currently deployed build id.

| Attribute | Value |
|-----------|-------|
| Location | `/version.json` (static, served by nginx from `dist`) |
| Shape | `{ "buildId": string }` — see [contracts/version-json.md](./contracts/version-json.md) |
| Fetch semantics | `cache: 'no-store'` so it never returns a stale cached copy (FR-006) |
| Lifecycle | Overwritten atomically per deploy when the new `dist` is served |

## Transient in-memory state

### Reconnect State (US2)

The dashboard's condition while live-data requests are failing.

| Attribute | Value |
|-----------|-------|
| Type | Boolean `reconnecting` (in memory only; not persisted) |
| Set → true | On the first failed `fetchSnapshot` tick (FR-011) |
| Set → false | On the next successful tick (FR-012, FR-013) |
| Effect | Drives an optional subtle "reconnecting" affordance; MUST NOT blank/clear last-known values (FR-014) |
| Retry policy | Indefinite — no maximum retry count (FR-011, edge case "Long outage") |

### Self-Heal Guard (US1)

| Attribute | Value |
|-----------|-------|
| Type | Boolean `hasReloaded` module-level latch (in memory only) |
| Purpose | Ensures `location.reload()` fires **at most once** per page lifetime (FR-007, FR-010) |
| Reset | Naturally reset by the page reload itself (fresh module instance) |

## State transitions

```text
Reconnect State (US2):
  live ──fetch fails──▶ reconnecting=true ──fetch succeeds──▶ reconnecting=false
       └──────────────── retries forever, values preserved ─────────────┘

Self-Heal (US1), per check tick:
  served == running ─────────────────────────▶ no reload
  served fetch failed / unknown ─────────────▶ no reload (retry next tick)
  served != running  AND  !hasReloaded ──────▶ reload() once, set hasReloaded
  served != running  AND   hasReloaded ──────▶ no reload (loop guard)
```

See the full decision table in [contracts/version-json.md](./contracts/version-json.md).
