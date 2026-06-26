# Phase 0 Research: LiveMock

**Feature**: 002-livemock · **Source of truth**: Issues #11/#14–#17 + spec Locked Decisions.

All architectural choices are **locked** by Issue #11 and the spec; this document records
the rationale and resolves the one open mapping gap (D7). Format per decision: Decision /
Rationale / Alternatives rejected.

## D1 — Cloud fetcher mirrors the gateway client contract

- **Decision**: `apps/poller/src/ecowittCloud.ts` exposes
  `fetchCloudRealtime(...)` returning `{ ok: true; data } | { ok: false; error }`, using
  an injected `fetchImpl` and an `AbortController` timeout (reusing the
  `DEFAULT_GATEWAY_TIMEOUT_MS = 5000` pattern). It never throws.
- **Rationale**: `runPollCycle` already consumes exactly this shape from `fetchLivedata`
  (see `apps/poller/src/poll.ts`). Matching it keeps the poll cycle **source-agnostic** —
  the only change at the call site is which fetcher is wired in `index.ts`. Injecting
  `fetchImpl` keeps the module pure-at-the-edge and 100%-testable without live network.
- **Alternatives rejected**: A shared "data source" interface/abstraction (violates YAGNI
  — only two sources, switched once at startup); throwing on failure (breaks the existing
  honest-degradation error path).

## D2 — Non-zero cloud `code` is a typed failure, not an exception

- **Decision**: The Ecowitt cloud envelope is `{ code, msg, time, data }`; success is
  `code === 0`. A non-zero `code` (e.g. `40010 "Invalid application Key"`) is surfaced as
  `{ ok: false, error: <msg> }` carrying the API message.
- **Rationale**: FR-021. Mirrors gateway HTTP-error handling (`HTTP <status>` →
  `{ ok:false }`). The poll cycle's existing `onError` logs and skips the cycle; the store
  goes stale and the UI degrades to em-dashes (FR-023, Feature 001 US9).
- **Alternatives rejected**: Throwing (would need try/catch at the call site and risks
  crashing the loop); silently treating non-zero as empty data (hides misconfiguration).

## D3 — Pure adapter in `packages/shared`, fetcher in `apps/poller`

- **Decision**: The cloud→gateway translation lives in `packages/shared/src/cloudMapping.ts`
  as a pure function `cloudRealtimeToGateway(data)`. The side-effecting fetch stays in
  `apps/poller`.
- **Rationale**: Preserves the **import-boundary guard** — `apps/poller` remains the only
  cross-tier fetcher consumer. A pure adapter has no I/O, so it reaches 100% branch
  coverage in isolation. `normalizeToFullMetricMap` already lives in `packages/shared`, so
  the adapter sits next to its consumer.
- **Alternatives rejected**: Adapter in `apps/poller` (couples a pure transform to the
  fetch tier and complicates isolated testing); adapter performing its own fetch (breaks
  purity and the single-consumer boundary).

## D4 — Keep the strict schema; synthesize the two cloud-absent fields (Decision A)

- **Decision**: The cloud `real_time` endpoint does not provide `maxDailyGustMph`
  (`common_list 0x19`) or `windAvg10mDirDeg` (`common_list 0x6D`), both required by
  `projectLiveReading`. The adapter **synthesizes** them: `0x19` ← current `wind.wind_gust`;
  `0x6D` ← current `wind.wind_direction`. The strict `mappedReadingSchema` is **unchanged**.
- **Rationale**: FR-012. The values self-correct as the app's own derived history accrues
  (the API derives `windAvg10mMph`, `maxDailyGustDir`, day high/low from stored history;
  only these two are hard ingest requirements). Keeping the schema strict avoids a
  second cloud call and preserves a single validation source of truth.
- **Alternatives rejected**: Relaxing the schema (explicitly out of scope; weakens
  validation for the production gateway path too); a second cloud `history` call (added
  latency, rate-limit pressure, and complexity for two self-correcting fields).

## D5 — Synthesize `srain_piezo` so the unchanged mapper derives `isRaining`

- **Decision**: The cloud payload has no `srain` flag. The adapter emits a synthesized
  `piezoRain` item `{ id: "srain_piezo", val: rain_rate > 0 ? "1" : "0" }` derived from
  `rainfall_piezo.rain_rate`.
- **Rationale**: `normalizeToFullMetricMap` sets `isRaining` from a `srain_piezo` item
  (`parseNum(val) === 0 ? 0 : 1`); if the item is absent, `isRaining` stays `0`. Emitting
  the synthesized flag lets the **unchanged** mapper produce the correct `isRaining`
  (FR-011) without touching `mapping.ts`. This is the only mapper-compatible way to honor
  "`isRaining` ← `rain_rate > 0`".
- **Alternatives rejected**: Setting `isRaining` directly in the adapter output (the
  adapter emits gateway-shaped input, not the flat map — it cannot set `isRaining`);
  modifying `mapping.ts` (would change the production gateway path; out of scope).

## D6 — Rain from the piezo group only; ignore the tipping bucket

- **Decision**: The adapter maps all rain totals from cloud `rainfall_piezo.*` and ignores
  any `data.rainfall.*` (tipping-bucket) group.
- **Rationale**: FR-010. Mirrors Feature 001's device-verified finding that the tipping
  bucket reads zero during real storms while the WS90 piezo gauge reports true
  accumulation. The gateway contract maps the same way (`piezoRain`, not `rain`).
- **Alternatives rejected**: Using `data.rainfall` (would surface dead zeros during rain —
  the exact bug the project exists to avoid).

## D7 — Rain weekly/monthly/yearly mapping (LOCKED 2026-06-24)

- **Gap**: The spec's Field Mapping appendix lists only event / rain_rate / hourly / daily
  for `piezoRain` (`0x0D`, `0x0E`, `0x7C`, `0x10`). But the strict `mappedReadingSchema`
  **also requires** `rainWeeklyIn`, `rainMonthlyIn`, `rainYearlyIn` — projected from
  `piezoRain 0x11`, `0x12`, `0x13`. With the strict schema kept (D4), an adapter that omits
  these three fields makes `projectLiveReading` **throw**, so no reading would ever store.
- **Decision (recommended)**: The Ecowitt cloud `rainfall_piezo` group also reports
  `weekly`, `monthly`, and `yearly`. The adapter maps them: `0x11` ← `rainfall_piezo.weekly`,
  `0x12` ← `rainfall_piezo.monthly`, `0x13` ← `rainfall_piezo.yearly` — the natural,
  faithful completion that satisfies the strict schema with real values.
- **Rationale**: Keeping the strict schema (a Locked Decision) makes these three fields
  load-bearing; the cloud provides them in the same group, so mapping them is faithful and
  requires no schema change and no synthesis.
- **RULING (Steve, 2026-06-24)**: Map `0x11/0x12/0x13` from
  `rainfall_piezo.weekly/monthly/yearly` (option 1). No synthesis, no schema relaxation.
  **Verify presence with a live `real_time` capture during quickstart**; if the device turns
  out not to emit them, re-open this decision then. Until then this mapping is authoritative.

## D8 — Request units default to display units; pressure in inHg

- **Decision**: The cloud request sets `temp_unitid=2` (℉), `wind_speed_unitid=9` (mph),
  `rainfall_unitid=13` (in), `pressure_unitid=4` (inHg), `solar_irradiance_unitid=16`
  (W/m²). The adapter passes values through with benign unit strings; pressure is emitted in
  inHg because `normalizeToFullMetricMap` always treats `wh25.abs`/`wh25.rel` as inHg →
  `inHgToHpa`.
- **Rationale**: FR-004/FR-005/FR-013. Requesting display units minimizes adapter
  conversion and keeps the mapper's existing conversion logic the single source of truth.
  Pressure is the one field the mapper unconditionally converts, so it MUST arrive in inHg.
- **Alternatives rejected**: Requesting metric and converting in the adapter (duplicates
  conversion logic that already lives in `mapping.ts`); requesting inHg for everything
  (only pressure needs it; others pass through).

## D9 — `call_back` requests the six mapped groups

- **Decision**: `call_back=outdoor,indoor,solar_and_uvi,rainfall_piezo,wind,pressure`
  (trimmed CSV). `call_back=all` is also acceptable since the adapter ignores unmapped
  groups.
- **Rationale**: Assumptions in spec; minimizes payload while covering every mapped target.
- **Alternatives rejected**: `call_back=all` as default (larger payload for no benefit;
  still fine functionally).

## D10 — Config source switch with zod, default `gateway`

- **Decision**: Add `POLLER_SOURCE` (`z.enum(["gateway","cloud"]).default("gateway")`) plus
  `ECOWITT_APP_KEY`, `ECOWITT_API_KEY`, `ECOWITT_MAC`, and optional `ECOWITT_API_BASE_URL`
  (default `https://api.ecowitt.net`). When `source=cloud`, the cloud credentials MUST be
  present or config validation fails loudly at startup.
- **Rationale**: FR-001/FR-006/FR-016. Mirrors the existing zod env pattern in `config.ts`.
  Default `gateway` guarantees zero production behaviour change. Conditional requirement of
  the cloud creds (only when `source=cloud`) matches the existing config-validation
  behaviour for misconfiguration.
- **Alternatives rejected**: Making cloud creds always required (breaks the gateway default
  path); a separate config file (the env+zod pattern already exists and is sufficient).

## D11 — Compose override mirrors the mock override

- **Decision**: `docker-compose.livemock.yml` sets `POLLER_SOURCE=cloud` and passes the
  `ECOWITT_*` env from the gitignored `.env`; it adds **no** mock-gateway service.
  Run: `docker compose -f docker-compose.yml -f docker-compose.livemock.yml up`.
- **Rationale**: FR-015. Symmetric with `docker-compose.mock.yml` (which adds a mock
  gateway); LiveMock instead points the existing poller at the cloud. `.env.example` gets
  placeholders; real secrets only in `.env` (FR-017/FR-055).
- **Alternatives rejected**: A new service container for the cloud (unnecessary — the
  existing poller fetches the cloud directly); committing example creds (prohibited).

## D12 — Effective refresh bounded by device upload interval; duplicates benign

- **Decision**: Document that the device's cloud upload interval (often ~1 min) bounds the
  effective refresh rate regardless of `POLL_CADENCE_SECONDS` (clamped ≥ 30 s). Identical
  `time` across polls is ignored by the existing store.
- **Rationale**: FR-019/FR-020 + Edge Cases. No new dedup logic needed — the store already
  rejects duplicate observations.
- **Alternatives rejected**: Adding cloud-specific dedup (redundant with existing store
  behaviour).

## Resolved unknowns

| Unknown | Resolution |
|---------|------------|
| Result contract shape | D1 — mirror `GatewayResult` |
| Non-zero `code` handling | D2 — typed failure carrying `msg` |
| Where the adapter lives | D3 — `packages/shared`, pure |
| Two missing required fields | D4 — synthesize `0x19`/`0x6D` (Decision A) |
| `isRaining` with no `srain` flag | D5 — synthesize `srain_piezo` from `rain_rate` |
| Rain group source | D6 — piezo only |
| weekly/monthly/yearly rain | D7 — map from `rainfall_piezo.weekly/monthly/yearly` (LOCKED; verify at quickstart) |
| Unit ids / pressure | D8 — display units; pressure inHg |
| `call_back` scope | D9 — six mapped groups |
| Config switch + creds | D10 — zod, default `gateway`, conditional cloud creds |
| Compose override | D11 — mirror mock override, no mock service |
| Refresh cadence / dupes | D12 — bounded by upload interval; store dedups |
