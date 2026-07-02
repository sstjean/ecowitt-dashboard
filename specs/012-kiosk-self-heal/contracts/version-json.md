# Contract: `version.json` shape + self-heal reload decision

This feature exposes no versioned API endpoint. Its "contract" is (1) the shape of
the static `version.json` build marker and (2) the deterministic reload decision the
running dashboard makes from it. Both are covered by strict unit + e2e tests.

## 1. `version.json` (static build marker)

**Location**: `/version.json` — a static file emitted into `dist` by the Vite
build-id plugin and served by the existing nginx (`location /`).

**Fetch**: `fetch('/version.json', { cache: 'no-store' })` — MUST bypass the HTTP
cache (FR-006).

**Schema**:

```json
{
  "buildId": "2026-07-01T14:32:10Z-a1b2c3d"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `buildId` | `string` | Non-empty. Deterministic per build (identical build ⇒ identical value; new build ⇒ new value). Equals the baked `__BUILD_ID__` of the build that produced this `dist`. |

**Robustness (client side)** — any of the following resolves to `null` ("unknown"),
never to a "changed" verdict:

- HTTP error status / network failure on the fetch.
- Non-JSON or unparseable body.
- Missing `buildId`, or `buildId` that is not a non-empty string.

## 2. Baked constant

- `__BUILD_ID__` — a compile-time string constant injected via Vite `define`,
  readable synchronously by the running page with no network request (FR-002).
- Declared in `apps/web/src/build-id.d.ts` as `declare const __BUILD_ID__: string;`
  so `tsc --noEmit` (the `typecheck` gate) is satisfied.
- Baked id and served id derive from the **same** in-build value (FR-004).

## 3. Reload decision table (`decideReload` + guard)

`runningId = __BUILD_ID__`. `servedId` = parsed `buildId` from `version.json`, or
`null` if unknown. `hasReloaded` = module latch (starts `false`).

| # | `servedId` | vs `runningId` | `hasReloaded` | Action | FR |
|---|-----------|----------------|---------------|--------|----|
| 1 | `null` (fetch/parse failed, or blank) | — | — | **No reload**, retry next tick | FR-009 |
| 2 | equal | `servedId == runningId` | any | **No reload** | FR-008 |
| 3 | different | `servedId != runningId` | `false` | **`reload()` once**, set `hasReloaded=true` | FR-007 |
| 4 | different | `servedId != runningId` | `true` | **No reload** (loop guard) | FR-010 |

- `decideReload(runningId, servedId)` is **pure** and returns `true` only for row 3's
  precondition (`servedId` non-null, non-empty, `!= runningId`). The `hasReloaded`
  latch is enforced by the effectful runner, not the pure function.
- After a genuine reload, the freshly loaded build's `__BUILD_ID__` now equals the
  served id, so the next check lands on row 2 — no loop (FR-010).

## 4. Reconnect state contract (US2)

| Signal | When | Guarantee |
|--------|------|-----------|
| `reconnecting → true` | First failed `fetchSnapshot` tick | Loop keeps retrying forever; no give-up (FR-011) |
| `reconnecting → false` | Next successful tick | Affordance clears automatically (FR-013) |
| Last-known values | During failure | Never blanked/cleared/corrupted (FR-014) |

## 5. Launcher reachability contract (US3)

| Condition | Launcher behaviour | FR |
|-----------|--------------------|----|
| `KIOSK_URL` not reachable at start | Wait & re-check (curl loop), do NOT launch Chrome onto a dead error page | FR-015, FR-016 |
| `KIOSK_URL` reachable | Launch Chrome promptly (first curl succeeds) | FR-017 |
| Persistent unhealthy response | Treated as not-ready; keep waiting | Edge case "server reachable but errors at boot" |

"Reachable" = a successful HTTP response to `curl -fsS` against `KIOSK_URL`.
