# Implementation Plan: Live Weather Dashboard

**Branch**: `001-live-dashboard` | **Date**: 2026-06-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-live-dashboard/spec.md`

**Note**: This plan was produced by `/speckit.plan`. Phase 0 decisions live in
[research.md](research.md); Phase 1 design lives in [data-model.md](data-model.md),
[contracts/](contracts/), and [quickstart.md](quickstart.md).

## Summary

Deliver the application's foundational MVP as **one end-to-end vertical slice**:
pull live readings from the Ecowitt GW2000B local API, validate and store them in
SQLite (UTC), serve the latest snapshot through a versioned HTTP API, and display it
on a single glanceable "now" dashboard modeled on the owner's Ambient Weather
console. The whole slice is built in **TypeScript on Node.js 22** as an
npm-workspaces monorepo (shared schema + poller + Fastify API + Vite/vanilla web),
runs self-hosted as Docker containers with no cloud or internet dependency, and is
developed test-first to 100% coverage with mock data only. Pull is the only data
path across the one-way main→IoT VLAN boundary, and the poller is the sole
component permitted to cross it.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS (all tiers); ES modules.

**Primary Dependencies**: Fastify 5 (versioned API), better-sqlite3 (SQLite, WAL),
zod (shared runtime validation + types), SunCalc (offline sunrise/sunset/moon),
Vite (web build), undici/global `fetch` (gateway polling). Vitest + v8 coverage;
`tsc` for typecheck parity.

**Storage**: SQLite (single file on a Docker volume, WAL mode), readings stored in
UTC with an indexed observation time; the application is the system of record. Each
row captures the **full normalised gateway metric map** (`metrics_json`), not just
the dashboard subset, so history accrues for every reported field and any metric can
be surfaced later with no migration (research D13).

**Testing**: Vitest (unit + integration) across all workspaces, v8 coverage enforced
at 100%; `tsc --noEmit` per workspace as the CI-parity typecheck. All tests use mock
or synthetic data only — no gateway, network, or external service reachability.

**Target Platform**: Self-hosted Docker on the household mini-PC (Linux). Clients:
always-on kitchen kiosk (2014-era Surface Pro 3, the slowest target), household
iPhone 16 Pro Max phones (18 Pro Max forward-looking), and a 13" iPad Air M2 — all
over the LAN. Plain HTTP on the LAN is acceptable.

**Project Type**: Web application — multi-service monorepo (shared lib + ingestion
poller + API backend + static web client).

**Performance Goals**: Latest-snapshot API response < 200 ms on the mini-PC; first
legible/interactive dashboard paint < 2 s on the Surface Pro 3 (SC-004); UI reflects
a new reading within one poll cadence (30 s default) + one UI refresh cadence (10 s
default) (SC-003/SC-010); UI updates within 500 ms while polling.

**Constraints**: Fully offline-capable (no internet for normal operation, FR-056);
pull-only ingestion across a one-way firewall pinhole, poller is the single
cross-VLAN consumer (FR-043/FR-044); storage UTC / display `America/New_York`
everywhere (FR-054); no value-bearing config in source control (FR-055); resilient
to gateway timeouts and malformed payloads without crashing or persisting bad data
(FR-046/FR-047).

**Scale/Scope**: Single household. ~1 reading / 30 s ≈ 2,880/day ≈ ~1.05M/year
(trivial for time-indexed SQLite). One screen, five panels / 9 user stories; three
runtime services + one shared package.

## Constitution Check

*GATE: must pass before Phase 0 (passed) and re-checked after Phase 1 (passed — see
end of this section).*

| Constitution principle / section | How this plan complies |
|----------------------------------|------------------------|
| I. Simplicity | One language across all tiers; vanilla web (no UI framework); synchronous SQLite driver; no ORM; smallest sufficient dependency set, each with a present-day need. |
| II. YAGNI | No MQTT, no history/charts, no plugin/abstraction layers built now (deferred features, Decision 12); navigation menu items are placeholders only. **One deliberate, user-approved exception**: the poller captures & stores the *full* gateway field set (not just the dashboard subset) for historical completeness and easy future expansion — recorded in Complexity Tracking (research D13). |
| III. Single Responsibility | Separate workspaces/services: poller (acquire+validate+store), API (serve+enrich), web (render); within each, "fetch" is split from "decide/transform" for testability. |
| IV. TDD / 100% coverage / AAA / mock-data / 5-min debug | Vitest with v8 coverage hard-gated at 100%; Red-Green-Refactor; AAA-structured adversarial tests; mock/synthetic data only at every seam (stub gateway, temp SQLite, mocked fetch). |
| Dev Workflow — branch / merge-commit / typecheck parity / Eastern display | Work on `001-live-dashboard`; PR merged with `--merge`; `tsc --noEmit` per workspace mirrors CI; all date/time pinned to `America/New_York`. |
| Performance — poll cadence / kiosk responsiveness | Configurable poll cadence default 30 s (30–60 s); UI refresh 10 s; <500 ms UI updates; <2 s first paint target on Surface Pro 3. |
| Platform — self-hosted Docker / no cloud / SQLite / pull-only / single cross-VLAN consumer / versioned API | 3 Dockerfiles + one Compose, offline-capable; SQLite store; pull-only poller is the only IoT-VLAN consumer; client speaks only to `/api/v1`. |
| Security — LAN-trust / boundary integrity / secrets / input validation | No heavyweight identity (LAN trust); one-way pinhole preserved (only poller reaches gateway); secrets via `.env.local` + `.env.example`; zod validation/sanitisation before persistence. |
| Interoperability (Home Assistant / MQTT) | Acknowledged constitution obligation; **deferred** to a separate future feature (spec Out of Scope). Persistence path kept decoupled so an MQTT publisher can be added later without coupling. |
| DevOps — reproducible Compose / CI 100% gate / pinned tags / restart policy / **data backup** / dependency hygiene / GitHub Issue Discipline | Single `docker compose up`; CI runs all suites + 100% coverage gate + zero-warning; images pinned (no `latest`); `restart: unless-stopped`; **scripted off-host SQLite backup + documented restore (Decision 11 / finding C1)**; Dependabot triaged; Feature + User Story issues with sub-issue linkage, tasks as issue checklist items. |

**Initial gate result**: PASS — no violations; no entries required in Complexity
Tracking.

**Post-Phase-1 re-evaluation**: PASS — the data model, the `/api/v1` contract, and
the quickstart introduce no new abstractions or cross-VLAN consumers and preserve
UTC-store/Eastern-display, mock-data testing, and the single-pinhole boundary. The
one recorded deviation (full-fidelity capture, research D13) is a storage-fidelity
choice, not a new abstraction or boundary; it is tracked in Complexity Tracking
below.

## Project Structure

### Documentation (this feature)

```text
specs/001-live-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1: entities, schema, validation, state
├── quickstart.md        # Phase 1: run & validation guide
├── contracts/           # Phase 1: versioned API contract + gateway payload notes
│   ├── api-v1.openapi.yaml
│   └── gateway-livedata.md
├── checklists/
│   └── requirements.md  # spec quality checklist (existing)
└── tasks.md             # Phase 2 (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
package.json                 # npm workspaces root (scripts: typecheck, test, coverage)
tsconfig.base.json
docker-compose.yml           # poller + api + web (+ backup sidecar); pinned tags, restart: unless-stopped
.env.example                 # documents all required env values (no secrets committed)

packages/
└── shared/                  # shared workspace: canonical schema + types + mapping
    ├── src/
    │   ├── schema.ts        # zod schemas: FullMetricMap, LiveReadingSnapshot, GatewayResponse, ApiLatest
    │   ├── mapping.ts       # gateway payload -> full normalised metric map (+ curated projection)
    │   ├── freshness.ts     # Fresh/Stale/Missing derivation from observation time
    │   └── index.ts
    └── tests/

apps/
├── poller/                  # ingestion service (the ONLY cross-VLAN consumer)
│   ├── src/
│   │   ├── gatewayClient.ts # fetch + AbortController timeout (acquire)
│   │   ├── ingest.ts        # validate -> map -> persist (decide/transform)
│   │   ├── store.ts         # better-sqlite3 writes (UTC; full metrics_json per row)
│   │   ├── scheduler.ts     # cadence timer, retry-next-cycle, no-crash
│   │   └── config.ts        # env parsing (gateway, cadence, location)
│   ├── Dockerfile
│   └── tests/               # stub gateway: good / malformed / timeout
├── api/                     # Fastify versioned API
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/v1/latest.ts   # GET /api/v1/latest (+ no-data path)
│   │   ├── routes/v1/health.ts   # GET /api/v1/health
│   │   ├── store.ts              # better-sqlite3 reads (WAL)
│   │   └── enrich.ts             # SunCalc astro + barometer trend + condition icon
│   ├── Dockerfile
│   └── tests/               # fastify.inject against temp SQLite fixtures
└── web/                     # Vite + TypeScript, vanilla DOM/SVG (port of prototype)
    ├── src/
    │   ├── main.ts          # poll loop (UI refresh cadence) -> render
    │   ├── render/          # gauges, rings, wind compass, rainfall, baro, solar, header
    │   ├── format/eastern.ts# Intl America/New_York formatters
    │   └── api.ts           # typed fetch of /api/v1/latest
    ├── index.html
    ├── Dockerfile           # build -> nginx static serve
    └── tests/               # mocked fetch; Fresh/Stale/Missing; DST + standard date

scripts/
└── backup-sqlite.sh         # online .backup to off-host target (+ restore docs)

.github/workflows/
└── ci.yml                   # typecheck + test + 100% coverage gate, all workspaces
```

**Structure Decision**: A single **npm-workspaces monorepo** with one shared schema
package (`packages/shared`) and three runtime apps (`apps/poller`, `apps/api`,
`apps/web`). This mirrors the three deployable Docker services while letting the
reading model be defined once and reused across tiers (DRY), and keeps each service
single-responsibility (SRP). The poller is the only app with network reach to the
IoT-VLAN gateway; the web app talks only to the API.

## Complexity Tracking

> One deliberate deviation from YAGNI (Principle II), explicitly approved by the
> product owner.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Full-fidelity capture** — store every field the gateway reports (`metrics_json` full metric map), beyond the ~24 metrics the current dashboard renders (research D13). | Historical data for un-surfaced metrics cannot be back-filled; capturing all fields now means complete history accrues immediately and any field can later appear in the UI / a History or MQTT feature with **no migration and no data loss**. User explicitly accepted this YAGNI break. | *Store only the dashboard subset* (strict YAGNI) — permanently loses history for every un-surfaced sensor, the exact outcome the user wants to avoid. *Wide column-per-sensor schema* — can't anticipate every GW2000B sensor/channel and forces a migration per new sensor. Bounded cost (a wider JSON blob per row) for an irreversible benefit. |
