# Implementation Plan: LiveMock — Real-Data Dev Source via the Ecowitt Cloud API

**Branch**: `002-livemock` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-livemock/spec.md`

**Source of truth**: GitHub Feature [#11](https://github.com/sstjean/ecowitt-dashboard/issues/11)
and user stories [#14](https://github.com/sstjean/ecowitt-dashboard/issues/14) (US1),
[#15](https://github.com/sstjean/ecowitt-dashboard/issues/15) (US2),
[#16](https://github.com/sstjean/ecowitt-dashboard/issues/16) (US3),
[#17](https://github.com/sstjean/ecowitt-dashboard/issues/17) (US4). If this plan and
an Issue disagree, the Issue wins.

## Summary

LiveMock adds a **development/testing-only** upstream data source that pulls live
readings from the **Ecowitt cloud API** (`GET /api/v3/device/real_time`) and feeds them
through the **existing** ingest → store → API → web pipeline **unchanged**, so the app
can be exercised against real, current household data while the operator is off the IoT
LAN and cannot reach the GW2000B gateway.

Technical approach (locked):

1. **Cloud fetcher** `apps/poller/src/ecowittCloud.ts` — mirrors the gateway client's
   typed `{ ok, data } | { ok, error }` contract, uses an `AbortController` timeout (the
   `DEFAULT_GATEWAY_TIMEOUT_MS` pattern), and maps a non-zero cloud `code` to a typed
   failure (never throws).
2. **Pure translation adapter** `packages/shared/src/cloudMapping.ts` —
   `cloudRealtimeToGateway(data)` converts the validated cloud `real_time` payload into a
   `get_livedata_info`-shaped object that the **existing** `normalizeToFullMetricMap`
   accepts unchanged. A new zod schema for the cloud response is added to
   `packages/shared/src/schema.ts`.
3. **Source switch** `POLLER_SOURCE=gateway|cloud` (default `gateway`) in
   `apps/poller/src/config.ts`; `apps/poller/src/index.ts` wires the cloud fetcher +
   shared adapter when `source=cloud`, else the gateway client as today.
   `runPollCycle` (`poll.ts`) stays source-agnostic.
4. **Compose override** `docker-compose.livemock.yml` — mirrors `docker-compose.mock.yml`,
   sets `POLLER_SOURCE=cloud` + the cloud env from a gitignored `.env`, and includes **no**
   mock-gateway service. Placeholders are added to `.env.example`.

The downstream pipeline (`normalizeToFullMetricMap`, `projectLiveReading`, validation,
store, API, web, freshness/staleness) is **reused unchanged**. This feature is purely a
swap of the upstream data source plus one pure adapter.

## Technical Context

**Language/Version**: TypeScript on Node 22 (run via `node --experimental-strip-types`
in containers; no separate build step for runtime). npm ≥ 11 enforced (`engines` +
`engine-strict`).

**Primary Dependencies**: `zod` (env + payload validation), `vitest` (tests/coverage),
npm workspaces. No new runtime dependency is introduced (`fetch` is the platform global).

**Storage**: Existing SQLite store — **unchanged**. LiveMock writes through the existing
`ingestPayload` → `WriteStore` path; duplicate observations (identical `time`) are
ignored by the store as today.

**Testing**: `vitest` at **100% coverage** (constitution Principle IV + CI gate). New
units: fetcher (success / timeout / network-error / non-zero-code), adapter (every mapped
field + both synthesized fallbacks + rain-on/off + pass-through units), config (env
parsing incl. default and source switch + missing-credential failure).

**Target Platform**: Self-hosted Docker on the household mini-PC; LiveMock is operator-run
off-LAN via the compose override.

**Project Type**: Monorepo (npm workspaces) — `apps/poller`, `apps/api`, `apps/web`,
`packages/shared`. This feature touches only `apps/poller` and `packages/shared`.

**Performance Goals**: Effective refresh is bounded by the device's cloud upload interval
(often ~1 min), not `POLL_CADENCE_SECONDS`. Poll cadence stays clamped ≥ 30 s to respect
Ecowitt API rate limits (existing clamp suffices).

**Constraints**: Production default stays `gateway` (zero production behaviour change).
Strict shared schema is **kept** (Decision A synthesizes the two cloud-absent fields).
Secrets only in gitignored `.env`. Import-boundary guard holds: `apps/poller` remains the
only cross-tier fetcher consumer; the adapter in `packages/shared` is pure (no I/O).

**Scale/Scope**: One household device, one poll loop. New code is ~3 small modules plus a
compose override and `.env.example` placeholders.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | One fetcher + one pure adapter + one env switch. No provider abstraction, no plugin system, no second cloud call. Downstream reused verbatim. |
| II. YAGNI | ✅ PASS | Only the cloud `real_time` happy path + honest degradation are built. No history/backfill endpoint, no UI changes (explicitly out of scope). |
| III. SRP | ✅ PASS | Fetcher = "get the cloud data" only; adapter = "translate shape" only (pure); config = "parse env" only. `runPollCycle` stays source-agnostic. Untestable I/O is isolated from the pure adapter so the adapter is 100%-coverable in isolation. |
| IV. TDD / 100% coverage | ✅ PASS (planned) | Red-Green-Refactor per module; every branch (fetcher error paths, adapter fallbacks, rain on/off, config default + source switch) covered. Tests use mock/synthetic cloud fixtures only — no live network in CI (Test Data Separation). |
| Display Timezone | ✅ N/A | LiveMock does not add or change any user-facing date/time rendering; storage stays UTC, display stays Eastern via the unchanged web tier. |
| Local Type-Checking Parity | ✅ PASS | New modules typecheck via the existing `npm run typecheck` (`tsc`) per workspace. |
| Platform — Single Cross-VLAN Consumer | ✅ PASS | The cloud fetcher reaches the **public** Ecowitt API over HTTPS from the main network, not the IoT VLAN. It does **not** breach the main→IoT boundary; the gateway pinhole is untouched. `apps/poller` remains the only cross-tier fetcher. |
| Platform — Offline-First, Not Offline-Only | ✅ PASS | LiveMock is an explicit opt-in dev source (`POLLER_SOURCE=cloud`); the production default `gateway` keeps the local-first core fully offline-capable. LiveMock is never a core dependency. |
| Security — Secrets Management | ✅ PASS | `application_key`, `api_key`, MAC live only in gitignored `.env`; `.env.example` carries placeholders. No secrets committed (FR-017/FR-055). Outbound HTTPS sends only the API credentials to the documented Ecowitt endpoint, times out, and fails safe. |
| Security — Input Validation | ✅ PASS | The cloud payload is zod-validated before translation; malformed/partial/non-zero-code responses are rejected without corrupting the store or crashing the poller. |
| DevOps — Reproducible Stack | ✅ PASS | `docker compose -f docker-compose.yml -f docker-compose.livemock.yml up` is fully reproducible; the only operator input is `.env` values. |

**Gate result**: PASS — no violations. Complexity Tracking table intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-livemock/
├── spec.md              # Feature spec (derived from Issues #11/#14–#17)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — cloud entity, adapter output shape, field mapping
├── quickstart.md        # Phase 1 — run/verify LiveMock off-LAN
├── contracts/
│   └── cloud-realtime.md # Phase 1 — external Ecowitt cloud real_time contract
├── checklists/          # (existing)
└── tasks.md             # Phase 2 — created by /speckit.tasks (NOT this command)
```

### Source Code (repository root)

```text
apps/poller/
├── src/
│   ├── config.ts         # MODIFIED — add POLLER_SOURCE + ECOWITT_* env (zod)
│   ├── ecowittCloud.ts   # NEW — cloud real_time fetcher (mirrors gatewayClient.ts)
│   ├── index.ts          # MODIFIED — wire cloud fetcher + adapter when source=cloud
│   ├── poll.ts           # UNCHANGED — runPollCycle stays source-agnostic
│   ├── gatewayClient.ts  # UNCHANGED
│   ├── ingest.ts         # UNCHANGED
│   ├── scheduler.ts      # UNCHANGED
│   └── store.ts          # UNCHANGED
└── tests/
    ├── config.test.ts        # MODIFIED — source switch + ECOWITT_* parsing
    ├── ecowittCloud.test.ts  # NEW — success / timeout / network-error / non-zero code
    └── (existing tests unchanged)

packages/shared/
├── src/
│   ├── schema.ts        # MODIFIED — add cloudRealtimeSchema (zod)
│   ├── cloudMapping.ts  # NEW — cloudRealtimeToGateway(data) pure adapter
│   ├── mapping.ts       # UNCHANGED — normalizeToFullMetricMap consumes adapter output
│   ├── index.ts         # MODIFIED — re-export cloudMapping
│   └── freshness.ts     # UNCHANGED
└── tests/
    └── cloudMapping.test.ts  # NEW — every field + synthesized fallbacks + rain on/off

# Repo root
docker-compose.livemock.yml  # NEW — POLLER_SOURCE=cloud override (no mock-gateway)
.env.example                 # MODIFIED — POLLER_SOURCE + ECOWITT_* placeholders
```

**Structure Decision**: Existing monorepo layout is reused. The cloud **fetcher**
(side-effecting I/O) lives in `apps/poller` to preserve the single-cross-tier-consumer
boundary; the **adapter** (pure translation) lives in `packages/shared` so it is
unit-testable in isolation at 100% coverage and importable by the poller without widening
the fetch boundary. No new package or app is introduced.

## Phase 0 — Research

See [research.md](./research.md). All decisions are locked by Issue #11 / the spec's
Locked Decisions; research records rationale and the one resolved gap (rain
weekly/monthly/yearly mapping, D7) plus the open question surfaced to the operator.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — cloud `real_time` entity, the gateway-shaped adapter
  output, the full cloud→gateway field mapping (incl. synthesized `srain_piezo`,
  `0x19`, `0x6D`), and the new config entity.
- [contracts/cloud-realtime.md](./contracts/cloud-realtime.md) — the external Ecowitt
  cloud `real_time` contract the fetcher depends on, consumed by `apps/poller` only.
- [quickstart.md](./quickstart.md) — run LiveMock off-LAN and verify live values; plus the
  unit-test verification commands.

**Agent context**: `.github/copilot-instructions.md` SPECKIT block updated to point at
this plan.

## Complexity Tracking

*No constitution violations — table intentionally empty.*
