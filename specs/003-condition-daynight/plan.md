# Implementation Plan: Sky-condition day/night decoupled from the deprecated NWS icon

**Branch**: `003-condition-daynight` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-condition-daynight/spec.md`

**Source of truth**: GitHub Feature [#19](https://github.com/sstjean/ecowitt-dashboard/issues/19)
and User Story [#20](https://github.com/sstjean/ecowitt-dashboard/issues/20) (repo
`sstjean/ecowitt-dashboard`). If this plan and an Issue disagree, the Issue wins.

## Summary

Today the sky-condition icon decides day vs night from the **deprecated** NWS observation
`icon` URL (`(latest.properties.icon ?? "").includes("/day/")`). That field returns `null`
intermittently, and when it did on 2026-06-26 a clear midday sky rendered as a **moon**
(`night`) with a blank label, and it did not self-correct. This feature severs all
dependence on the NWS `icon` field and derives day/night from the household's **own**
astro sunrise/sunset (the same `sunriseUtc`/`sunsetUtc` already computed for the solar
panel), compared against the read-time clock.

Technical approach (locked):

1. **Drop the deprecated field at the boundary.** Remove `isDaytime` from `NwsObservation`
   (→ `{ textDescription: string }`), drop `icon` from `LatestObservationResponse`, and
   stop reading `latest.properties.icon` in `createHttpObservationFetcher`. The NWS `icon`
   URL is never consumed again (FR-002, FR-003).
2. **Two new pure functions in `nws.ts`** (exported, no network, FR-010):
   - `isDaytime(now, sunriseUtc, sunsetUtc): boolean` — `t >= Date.parse(sunriseUtc) &&
     t < Date.parse(sunsetUtc)`. Boundary rule (documented): **sunrise inclusive = day,
     sunset inclusive = night**, applied consistently (FR-001, Edge Case "exactly at
     sunrise/sunset").
   - `resolveConditionIcon(textDescription, now, sunriseUtc, sunsetUtc): ConditionIcon` —
     identical keyword/cloud precedence to today's `conditionIcon` (thunderstorm → snow →
     rainy → fog → cloud/overcast → partly-cloudy/cloudy), else
     `isDaytime(...) ? "clear" : "night"`. This **replaces** the old `conditionIcon`
     (which took `observation.isDaytime`).
3. **Cache raw text only.** `NwsClient.lastGood` becomes `{ text: string; atMs: number }`.
   `current(now)` returns a redefined `ConditionState = { conditionText: string | null;
   conditionStale: boolean; hasObservation: boolean }` (**no icon**). `hasObservation =
   lastGood !== null` separates cold-start (no fetch) from an empty-text fetch.
4. **Resolve the icon at READ time** in `buildLatestSnapshot`, which already has `astro`
   and `now`:
   - `!condition.hasObservation` → `conditionIcon: null, conditionText: null,
     conditionStale: true` (cold-start unchanged, FR-011).
   - else → `conditionIcon = resolveConditionIcon(condition.conditionText ?? "", now,
     astro.sunriseUtc, astro.sunsetUtc)`; `conditionText = trimmed-nonempty ? text : null`
     (empty text omits the label, FR-006); `conditionStale` **passes through** (NOT forced
     stale because text was empty, FR-006).
   Because the icon is re-resolved on every read against `now`, FR-007 is automatic:
   `clear ↔ night` flips at sunset/sunrise with no refetch.
5. `UNAVAILABLE_CONDITION` and the `ConditionState` shape update accordingly.

The **external** `/api/v1/latest` contract is **preserved**: the envelope still emits
`conditionIcon | conditionStale | conditionText` with identical types and the same
`ConditionIcon` vocabulary. Only the **internal source** of day/night changes (NWS `icon`
URL → household astro). No web/UI change, no schema change, no vocabulary change.

## Technical Context

**Language/Version**: TypeScript on Node 22 (run via `node --experimental-strip-types`;
no separate build step for runtime). npm workspaces.

**Primary Dependencies**: `@ecowitt/shared` (`ConditionIcon`, schemas), `suncalc` (already
used by `computeAstro`), `vitest` (tests/coverage). No new runtime dependency.

**Storage**: SQLite — **unchanged**. This feature touches only condition resolution in
`apps/api`; it neither reads nor writes the store differently.

**Testing**: `vitest` at **100% coverage** (constitution Principle IV + CI gate). New/changed
units live in `apps/api/tests`: pure `isDaytime` (daytime, after-sunset, before-sunrise,
exact sunrise boundary, exact sunset boundary), pure `resolveConditionIcon` (each keyword,
cloud/partly precedence, clear-day, clear-night, empty-text day, empty-text night,
icon-field-independence), `createNwsClient` (cold-start `hasObservation:false`, text cache
+ TTL, stale-by-age, failure keeps last-good text), and `buildLatestSnapshot` (cold-start
passthrough, empty-text label omission without forced stale, boundary flip with one cached
observation). All inputs injected; **no live network** (FR-010, Test Data Separation).

**Target Platform**: Self-hosted Docker on the household mini-PC (host `192.168.10.5`).
The `api` image is rebuilt amd64 and redeployed via ship-images after implementation.

**Project Type**: Monorepo (npm workspaces) — `apps/api`, `apps/poller`, `apps/web`,
`packages/shared`. **This feature touches only `apps/api`** (`src/nws.ts`,
`src/routes/v1/latest.ts`, and their tests). `packages/shared` is unchanged (the
`ConditionIcon` enum and `latestSnapshotSchema` already match the preserved contract).

**Performance Goals**: No new I/O. Icon resolution is two `Date.parse` calls + string
includes per read — negligible. Read-time re-resolution removes a whole class of staleness
bug (the icon can no longer lag the clock between fetches).

**Constraints**: External `/api/v1/latest` contract **preserved** (same fields, types,
vocabulary). Day/night reckoning uses the same `America/New_York` astro basis as the solar
panel; storage UTC / display Eastern unchanged (FR-009). No change to the keyword/cloud
precedence or the icon vocabulary — only the day/night **source** changes (FR-008).

**Scale/Scope**: One household. Net change is ~2 small source files in `apps/api` plus
their tests; a net code reduction (one deprecated field and its derivation removed).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | Removes a remote dependency (NWS `icon` URL) and replaces a stored boolean with a read-time computation from data we already have (`astro`). Fewer moving parts, no new abstraction. |
| II. YAGNI | ✅ PASS | Only the day/night source changes. No new config, no new vocabulary, no UI work (all out of scope). Net deletion of code. |
| III. SRP | ✅ PASS | `isDaytime` = "decide day vs night" only; `resolveConditionIcon` = "map text+astro → icon" only; `NwsClient` = "fetch & cache raw text" only; `buildLatestSnapshot` = "assemble envelope" (now owns icon resolution because it owns `astro` + `now`). The untestable HTTP fetcher is isolated and carries no day/night logic. |
| IV. TDD / 100% coverage | ✅ PASS (planned) | Red-Green-Refactor per unit; every branch covered (boundary inclusivity both sides, each keyword, empty-text day vs night, cold-start vs empty-fetch, stale-by-age, icon-field independence). AAA pattern; injected inputs; no live network in CI. |
| Display Timezone | ✅ PASS | Day/night uses the same astro (`sunriseUtc`/`sunsetUtc`) the Eastern solar panel uses; storage UTC / display Eastern unchanged (FR-009). No new user-facing date/time rendering. |
| Local Type-Checking Parity | ✅ PASS | Changed modules typecheck via the existing `npm run typecheck` (`tsc`) in `apps/api`. The `ConditionState` reshape forces `tsc` to flag every consumer site. |
| Platform — Offline-First / Optional Enrichment | ✅ PASS | Reduces reliance on the optional NWS overlay (one fewer field consumed). Core ingestion/serving still needs no internet; condition still degrades gracefully (cold-start unavailable, stale-by-age) and never blocks serving. |
| Platform — Single Cross-VLAN Consumer | ✅ PASS | No network-boundary change. `apps/api` still calls only the public NWS API (text now, not icon); the IoT VLAN pinhole is untouched. |
| Security — Input Validation | ✅ PASS | The fetcher coerces `textDescription ?? ""` at the upstream boundary and `buildLatestSnapshot` re-coerces with `?? ""` on read, so `resolveConditionIcon` always receives a string and tolerates empty/missing text without crashing or fabricating a false `night`; `isDaytime` is a total function over the injected instants. |
| Security — Outbound Enrichment | ✅ PASS | NWS call still HTTPS, contact `User-Agent`, time-out, fail-safe to stale/neutral. We now consume strictly less of the upstream response. |
| DevOps — Reproducible Stack / Immutable Tags | ✅ PASS | Redeploy is a rebuilt `api` image (amd64) shipped to `192.168.10.5` under an explicit tag; rollback to the prior image remains possible. |

**Gate result**: PASS — no violations. Complexity Tracking table intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-condition-daynight/
├── spec.md                        # Feature spec (derived from Issues #19/#20)
├── plan.md                        # This file
├── research.md                    # Phase 0 — decisions & rationale
├── data-model.md                  # Phase 1 — reshaped entities (NwsObservation, ConditionState)
├── quickstart.md                  # Phase 1 — run/verify the day/night fix
├── contracts/
│   └── condition-envelope.md      # Phase 1 — preserved /api/v1/latest condition contract
├── checklists/                    # (existing)
└── tasks.md                       # Phase 2 — created by /speckit.tasks (NOT this command)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── nws.ts                     # CHANGED: NwsObservation→{textDescription}; remove
│   │                              #          conditionIcon(obs); add pure isDaytime() +
│   │                              #          resolveConditionIcon(); ConditionState→
│   │                              #          {conditionText,conditionStale,hasObservation};
│   │                              #          lastGood caches text only; drop icon from
│   │                              #          LatestObservationResponse + the fetcher.
│   └── routes/v1/
│       └── latest.ts              # CHANGED: UNAVAILABLE_CONDITION reshape; resolve icon at
│                                  #          read time in buildLatestSnapshot using astro+now;
│                                  #          empty-text → conditionText null (FR-006);
│                                  #          conditionStale passthrough (no forced stale).
└── tests/
    ├── nws.map.test.ts            # CHANGED: replace conditionIcon(obs) suite with new pure
    │                              #          isDaytime/resolveConditionIcon suites (incl.
    │                              #          icon-field-independence).
    ├── nws.test.ts                # CHANGED: drop isDaytime fixtures; client caches text only
    │                              #          (new ConditionState; cold-start vs empty-fetch).
    ├── nws.http.test.ts           # CHANGED: fetcher no longer returns/needs `icon`.
    └── latest.test.ts             # CHANGED: read-time icon resolution, boundary flip,
                                   #          empty-text omission, cold-start passthrough.

packages/shared/                   # UNCHANGED — ConditionIcon enum & latestSnapshotSchema
                                   # already match the preserved external contract.
apps/web/                          # UNCHANGED — consumes the same envelope fields.
```

**Structure Decision**: Monorepo, single-tier change. All edits are confined to
`apps/api` (`src/nws.ts`, `src/routes/v1/latest.ts`) and their three test files. The shared
package and the web tier are deliberately untouched because the external envelope contract
is preserved; only the internal day/night source moves from the NWS `icon` URL to the
household astro context.

## Complexity Tracking

> No constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
