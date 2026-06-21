# Phase 0 Research: Live Weather Dashboard

**Feature**: 001-live-dashboard · **Date**: 2026-06-21 · **Spec**: [spec.md](spec.md)

This document resolves the open technical unknowns for the end-to-end MVP vertical
slice (ingest → store → serve → display). Every decision is constrained by the
project constitution (v2.0.0): self-hosted local-first Docker, SQLite, pull-only
poller across the one-way main→IoT VLAN boundary, a versioned API, UTC storage /
Eastern display, TDD to 100% coverage with mock data only, and local type-check
parity. Pixel-level visual behaviour is owned by the design artifacts and is not
re-decided here.

## Decision 1 — Single language & runtime across all tiers: TypeScript on Node.js 22 LTS

- **Decision**: Implement the ingestion poller, the API, and the web client all in
  **TypeScript** targeting **Node.js 22 LTS**, organised as an **npm-workspaces
  monorepo** with a shared types/schema package.
- **Rationale**:
  - *Simplicity (Principle I)*: one language, one package manager, one test runner,
    one type checker across every tier. A reading's shape is defined once and reused
    by poller, API, and UI (DRY), eliminating cross-language drift.
  - The locked design prototype (`design/prototype.html`) is already vanilla
    JS/SVG/CSS; porting it to TypeScript is a direct, low-risk path with no
    framework rewrite.
  - `tsc --noEmit` gives the constitution-mandated **local type-check parity**
    (NON-NEGOTIABLE) for free, identical to what CI runs.
  - Node ships a stable global `fetch` (undici) and a built-in `node:test`-class
    ecosystem; the runtime is small and containerises cleanly on the mini-PC.
- **Alternatives considered**:
  - *Python (FastAPI + httpx) backend + TS frontend*: two toolchains, two coverage
    systems, duplicated reading models — rejected on Simplicity/DRY.
  - *C#/.NET*: heavier images and toolchain for a personal LAN dashboard; no
    benefit here — rejected on Simplicity.
  - *Go backend*: fast and small, but a second language alongside the TS frontend
    and no compelling need — rejected on Simplicity.

## Decision 2 — API framework: Fastify (v5)

- **Decision**: Serve the versioned API with **Fastify 5** under an `/api/v1`
  prefix.
- **Rationale**: First-class TypeScript types, built-in JSON schema validation and
  serialization (fast, and doubles as part of the API contract), tiny footprint,
  trivial to unit/integration test via `fastify.inject()` with no network. Native
  support for versioned route prefixes satisfies the constitution's versioned
  client–server contract.
- **Alternatives considered**: *Express* (no built-in schema/types, needs more
  middleware) — rejected; *raw `node:http`* (would reinvent routing/validation) —
  rejected on Simplicity-vs-effort; *Hono* (fine, but Fastify's schema+inject
  testing story is stronger for our 100% coverage gate).

## Decision 3 — SQLite driver: better-sqlite3

- **Decision**: Use **better-sqlite3** with the database in **WAL** mode, a single
  on-disk file under a Docker volume.
- **Rationale**: Synchronous API is the *simplest* correct model for an embedded,
  single-writer (poller) / few-readers (API) workload — no async pool, no race
  ceremony. Extremely fast, prepared statements, easy to point at a temp file for
  integration tests. The constitution fixes SQLite as the store; this is the
  lowest-friction driver. WAL lets the API read concurrently with poller writes.
- **Storage layout (full-fidelity capture)**: `readings(id, observed_at TEXT
  NOT NULL UNIQUE, metrics_json TEXT NOT NULL)`, indexed on `observed_at`. The
  poller stores the **complete normalized metric map** — every field the gateway
  reports — as `metrics_json`, not just the dashboard subset (see Decision 13). Hot
  dashboard metrics are exposed as SQLite **generated (virtual) columns** over
  `json_extract(metrics_json, …)`, so any captured field can be promoted to an
  indexed first-class column later with **no data migration** (the data is already
  stored).
- **Volume/sizing**: ~1 reading / 30 s ≈ 2,880/day ≈ ~1.05M/year — negligible for
  SQLite even with the full metric map per row (tens of fields of JSON).
- **Alternatives considered**: *node:sqlite* (built-in, still experimental in 22) —
  revisit later; *sql.js / wasm* (in-memory, persistence friction) — rejected;
  *Prisma/Drizzle ORM* (speculative abstraction over one tiny schema) — rejected on
  YAGNI.

## Decision 4 — Gateway acquisition: poll `get_livedata_info` over HTTP with undici fetch

- **Decision**: The poller issues an HTTP GET to the gateway's local API
  (`http://<gateway>/get_livedata_info`) on a timer (default **30 s**, configurable
  30–60 s), using Node's global `fetch` with an **AbortController timeout**.
- **Rationale**: Pull-only is mandated by the one-way firewall (push is
  architecturally impossible). A per-request timeout + try/catch makes a missed or
  malformed poll a no-op that retries next cadence (FR-046), never crashing the
  service. The poller is the **only** component that crosses main→IoT.
- **Validation**: Each response is parsed and validated with **zod** before
  persistence; malformed/partial payloads are rejected and nothing is written
  (FR-047/FR-050). The Ecowitt payload is a set of category arrays
  (`common_list`, `piezoRain`/`rain`, `wh25`, `debug`, etc.) of
  `{id, val, unit?}`; a mapping layer normalises the validated payload into a
  canonical **full metric map** (all reported fields, normalised units), from which
  the dashboard's curated `LiveReadingSnapshot` is a projection (Decision 13). The
  exact id→field mapping is **device-verified** (Decision 15), not inferred from docs.
- **Alternatives considered**: *MQTT/native push from gateway* — blocked by VLAN,
  prohibited by constitution; *axios/got* — unnecessary dependency over built-in
  fetch — rejected on Simplicity.

## Decision 5 — Runtime validation & shared schema: zod

- **Decision**: Define the canonical reading schema and the gateway-payload schema
  with **zod** in the shared workspace package; derive TypeScript types from the
  schemas (`z.infer`).
- **Rationale**: One source of truth for shape + validation across poller (validate
  gateway), API (validate/serialize responses), and frontend (parse API responses).
  Directly implements FR-047 sanitisation and keeps tiers from drifting.
- **Alternatives considered**: hand-written type guards (more code, lower coverage
  confidence) — rejected; *valibot* (smaller, but zod is the better-known default
  and adequate) — acceptable but not chosen.

## Decision 6 — Sunrise / sunset / moon phase: SunCalc, computed locally & offline

- **Decision**: Compute sunrise, sunset, the sun's current arc position, and the
  moon phase with **SunCalc** from a configured household latitude/longitude and the
  current date — entirely offline.
- **Rationale**: FR-021/FR-022/FR-023 require astronomical values; the **core slice
  must run with no internet dependency** (FR-056) — the one sanctioned exception is
  the optional NWS sky-condition enrichment (D14/constitution v2.1.0), which astro is
  not. SunCalc is a tiny, pure, dependency-free library that
  needs only lat/long + time, so it runs fully offline on the mini-PC. Avoids
  hand-rolling astronomical algorithms.
- **Where it runs**: server-side (API enriches the snapshot) so the UI stays a thin
  renderer and the location secret is not shipped to clients beyond derived times.
- **Alternatives considered**: an online astronomy API — violates offline mandate;
  bespoke NOAA solar-position math — unnecessary effort/risk vs. SunCalc.

## Decision 7 — Frontend: Vite + TypeScript, vanilla (no UI framework)

- **Decision**: Build the web client with **Vite + TypeScript**, vanilla DOM/SVG —
  port the prototype's gauge/render functions to typed modules and add an API
  polling loop.
- **Rationale**: The prototype is already vanilla and complete as a visual
  reference; a React/Vue layer would be speculative weight (YAGNI). Vite gives fast
  dev, a static production build served by nginx, and `tsc` typecheck parity. The
  client polls `/api/v1/latest` on the **UI refresh cadence** (default 10 s,
  FR-034a), independent of the ingestion poll cadence.
- **Timezone**: all date/time/sunrise/sunset rendering pins
  `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', … })` — never a
  browser-locale default (FR-007/FR-054, constitution NON-NEGOTIABLE).
- **Alternatives considered**: *React + Vite* (component model unneeded for one
  screen) — rejected on YAGNI; *server-side rendering* (adds a server round-trip per
  refresh and templating) — rejected; the static-SPA-polling-a-JSON-API split is the
  simplest sufficient design.

## Decision 8 — Testing: Vitest + v8 coverage at 100%, mock data only

- **Decision**: **Vitest** for unit and integration tests across all workspaces,
  with **v8 coverage enforced at 100%** as a hard CI gate; `tsc --noEmit` runs as a
  separate typecheck step in every workspace.
- **Test seams (mock/synthetic data only — NON-NEGOTIABLE)**:
  - *Poller*: drive against a stubbed in-process HTTP server (or injected fetch) that
    serves canned good / malformed / timeout payloads — no real gateway, no network.
  - *API*: `fastify.inject()` against a temp-file SQLite seeded with fixtures —
    no network, covers empty-store/no-data and freshness derivation.
  - *Frontend*: mock `fetch`; render gauges against fixture snapshots; assert
    Fresh/Stale/Missing states and Eastern formatting across a standard-time and a
    DST date.
- **Rationale**: Vitest shares Vite's config/transform, runs fast, and its v8
  coverage integrates with the CI gate the constitution mandates. AAA structure and
  adversarial edge-case tests are required per Principle IV.
- **Alternatives considered**: *Jest* (separate transform config, slower with TS) —
  rejected; *node:test* (viable, but Vitest's coverage + watch + Vite reuse is
  smoother for the frontend) — rejected for cohesion.

## Decision 9 — Containerisation & deployment: Docker Compose, three services + volume

- **Decision**: Three Dockerfiles — **poller**, **api**, **web** (nginx serving the
  Vite build) — orchestrated by one `docker-compose.yml`. The SQLite file lives on a
  named volume shared (read-write to poller+api). Every long-running service sets
  `restart: unless-stopped`; images are referenced by explicit pinned tags (no
  `latest`).
- **Network boundary**: only the **poller** container is granted reach to the IoT
  VLAN gateway address; the api and web never touch the gateway (single auditable
  pinhole). The web client reaches only the api.
- **Rationale**: Mirrors the constitution's reproducible single-host Compose stack
  and resilience (restart policy) requirements. Three small images keep concerns
  isolated (SRP) while staying a single `docker compose up`.
- **Alternatives considered**: *single all-in-one container* (couples poller+api+web,
  harder to reason about the VLAN pinhole) — rejected; *Kubernetes* — absurd
  overkill for one household — rejected on Simplicity.

## Decision 10 — Configuration & secrets

- **Decision**: All environment-specific values come from environment variables /
  a gitignored `.env.local`, documented by a committed **`.env.example`**. Keys:
  gateway base URL/IP, ingestion poll cadence (default 30 s), UI refresh cadence
  (default 10 s), household latitude/longitude, rainfall full-droplet cap (4.0 in),
  barometer trend window (3 h) + steady epsilon (0.3 hPa), and the NWS enrichment
  settings — `NWS_USER_AGENT` (required contact string), `NWS_CACHE_TTL_SECONDS`
  (600), `NWS_STALE_AFTER_SECONDS` (3600), `NWS_TIMEOUT_MS` (5000) (D14).
- **Rationale**: FR-055 and the constitution's Secrets Management — nothing
  value-bearing in source control; one template documents required inputs.

## Decision 11 — SQLite backup (constitution NON-NEGOTIABLE, analysis finding C1)

- **Decision**: Provide a **scripted, scheduled backup** of the SQLite file to an
  off-host location (NAS/cloud drive) using SQLite's online backup (`.backup` /
  `sqlite3_backup`) so copies are consistent under WAL, plus a documented restore
  procedure. The schedule runs as a small container/cron sidecar or a host cron
  invoking a committed script.
- **Rationale**: The store is the system of record; the constitution mandates
  off-host backup + verified restore. Captured here so it lands as an explicit task
  rather than being lost (the prior analysis flagged the spec was silent on it).
- **Scope note**: backup automation is operational; the slice's *functional* MVP is
  ingest→store→serve→display. Backup is included in this plan's tasks as a DevOps
  concern, not gated behind the UI.

## Decision 12 — Out-of-scope confirmations (deferred, not designed here)

- **MQTT fan-out to Home Assistant**: constitution-mandated for the *application*
  but explicitly a **separate future feature** (spec Out of Scope). Not designed in
  this plan; the poller's persistence path is built so an independent MQTT publisher
  can be added later without coupling (decoupling principle) — but no MQTT code,
  topics, or broker are introduced now (YAGNI).
- **Historical charting / trends**: the store is built to support time-range queries
  (indexed observation time) so a future History feature can read it, but no chart
  endpoints or UI exist in this slice.

## Decision 13 — Full-fidelity gateway capture (acknowledged YAGNI deviation)

- **Decision**: The poller **captures and stores every field the gateway reports**,
  not just the ~24 metrics the current dashboard renders. The validated payload is
  normalised into a canonical **full metric map** and persisted in full
  (`readings.metrics_json`, Decision 3). The dashboard `LiveReadingSnapshot` is a
  **projection** of that map; the stored data is the lossless superset.
- **Rationale (explicit deviation from YAGNI)**: The user has explicitly chosen to
  break YAGNI here. Capturing the full sensor set from day one means historical data
  for every metric accrues immediately and irreversibly cannot be back-filled, while
  any field can later be surfaced in the UI (or a History/MQTT feature) with **no
  schema migration and no data loss**. The cost is bounded and small: a wider JSON
  blob per row and a normalisation map that covers all reported categories. This is
  the one place we deliberately store more than the current view needs.
- **Mechanism**: Required dashboard fields are still strictly validated (a missing
  required field rejects the whole payload, FR-047/FR-050). Additional reported
  fields (extra sensors, channels, aggregates) are normalised where the unit is
  known and **preserved as-is** otherwise, so an unanticipated sensor is never
  silently dropped. Promotion of a stored field to an indexed first-class column is
  a generated-column addition, not a migration (Decision 3).
- **Alternatives considered**: *Store only the dashboard subset* (strict YAGNI) —
  rejected by explicit user direction; history for un-surfaced metrics would be
  permanently lost. *Wide fixed column-per-sensor schema* — rejected: can't
  anticipate every sensor/channel a GW2000B may report, and each new sensor forces a
  migration. *Separate EAV `reading_metrics` table* — deferred: more join ceremony
  than needed now; the JSON map + generated columns gives the same forward-compat
  with less surface, and an EAV/history table can be derived later from the captured
  data if a History feature needs per-metric indexing.

## Decision 14 — Sky-condition icon source: NWS current conditions (online enrichment)

- **Decision**: The barometer's sky-condition icon is sourced from the **National
  Weather Service** current-conditions API (`api.weather.gov`) for the household
  location, **not** computed locally. The API service resolves the configured
  lat/long → nearest observation station → latest observation, then maps the NWS
  textDescription/icon (incl. day/night) to the app's icon vocabulary
  (`clear | partly-cloudy | cloudy | fog | rainy | snow | thunderstorm | night`)
  via a pure, unit-tested function. The last good fetch is cached
  (`NWS_CACHE_TTL_SECONDS`); each call has a timeout (`NWS_TIMEOUT_MS`).
- **Offline-first, not offline-only**: this is the system's single outbound
  enrichment, sanctioned by constitution **v2.1.0** (Optional External Enrichment).
  When NWS is unreachable/times out, or its last good fetch is older than
  `NWS_STALE_AFTER_SECONDS`, the client renders the icon **greyed (stale)** over the
  last-known value (or neutral if none). It never blocks ingestion/serving and never
  fabricates a condition.
- **Rationale**: sky condition is a complex classification the household's simplistic
  sensors (solar W/m², rain rate) cannot reproduce faithfully — a local threshold
  rule mislabels bright overcast, partly cloudy, fog, and snow. NWS gives an
  authoritative value; `api.weather.gov` needs no API key, only a contact
  `User-Agent`.
- **Testability**: the NWS client is injectable; all tests use mocked responses
  (FR-057) — no live network in CI. Covers success→map, cache reuse within TTL,
  timeout→stale, and stale-after→stale.
- **Alternatives considered**: *deterministic local rule* (Night→Rainy→Clear on
  solar ≥ 500 W/m²→Cloudy) — rejected: confidently wrong on common skies the sensors
  can't distinguish; *omit the icon* — rejected: loses a wanted at-a-glance signal.
  The icon is non-headline, so a greyed stale worst case is acceptable.

## Decision 15 — Device-verified gateway payload (Source of Truth over docs)

- **Decision**: The gateway contract is grounded in a **live capture** from the
  household GW2000B (`GET http://192.168.30.109/get_livedata_info`, HTTP 200,
  2026-06-21), taken during an active rainstorm. Where Ecowitt's published docs and
  the real device disagree, **the device payload is canonical**; docs are a proxy.
  Concrete corrections this drove:
  - **Rain → `piezoRain`, not `rain`.** The legacy tipping-bucket (`rain`) read
    `0.00 in` across all totals *during real rain* while the WS90 haptic gauge
    (`piezoRain`) reported the true accumulation. All six rain totals are mapped from
    `piezoRain`; `rain` is still captured into the `FullMetricMap` (D13) but never
    projected. **This dead-tipping-bucket failure is the reason the project exists.**
    The UI panel remains **labelled "Rain".**
  - **Pressure → `wh25`.** Absolute/relative pressure live under `wh25` (in inHg),
    not `common_list`; the mapper converts `abs` → hPa for `pressureHpa`.
  - **Wind → `common_list`.** Speed, gust, max-daily-gust speed, and direction are
    `common_list` ids — there is no separate "wind block".
  - **Derived daily/rolling aggregates.** The device does **not** report day high/low
    temperature, a 10-minute average wind **speed**, or the **direction** of the max
    daily gust. The API derives these from the application's own stored history
    (FR-018b) — the same enrich-from-history pattern as the baro trend. Only the max
    daily gust **speed** (`common_list 0x19`) is taken from the gateway as-is.
- **Decision (derivation choice)**: Day high/low, 10-min average wind, and max-gust
  direction are **derived from stored history** rather than dropped — the user
  explicitly chose history-derivation over omission so the panels stay complete.
  Cold-start (insufficient history) falls back to the current reading's instantaneous
  equivalent, never a fabricated zero.
- **Rationale**: A spec built on inferred field ids would have shipped a dashboard
  that shows zero rain during a storm — the exact failure the product is meant to
  fix. Empirical capture is the only trustworthy contract.
- **Open confirmations (low risk)**: `common_list "3"` (taken as feels-like/apparent
  temp) and `0x6D` (suspected 10-min average wind direction) are mapped on
  best-evidence and re-checked against a fresh capture at implementation; they are
  non-blocking extras captured regardless (D13).
- **Testability**: the mapping/derivation are pure functions unit-tested against
  canned fixtures derived from the live capture; no test reaches the real device.

## Resolved unknowns summary

| Unknown (from Technical Context) | Resolution |
|----------------------------------|-----------|
| Language/runtime for poller, API, UI | TypeScript on Node.js 22 LTS, npm-workspaces monorepo (D1) |
| API framework & versioning | Fastify 5, `/api/v1` prefix (D2) |
| SQLite access | better-sqlite3, WAL, time-indexed (D3) |
| Gateway acquisition & validation | undici fetch + AbortController timeout; zod validation (D4, D5) |
| Astronomical data, offline | SunCalc server-side from configured lat/long (D6) |
| Frontend stack | Vite + TS, vanilla DOM/SVG; 10 s poll; Eastern via Intl (D7) |
| Testing & coverage | Vitest + v8 100% gate; `tsc --noEmit` parity; mock data only (D8) |
| Deployment | 3 Dockerfiles + one Compose, restart policy, pinned tags, single VLAN pinhole (D9) |
| Config/secrets | env / `.env.local` + `.env.example` template (D10) |
| SQLite backup (C1) | scripted off-host backup + documented restore (D11) |
| MQTT / history | deferred to separate features; persistence kept decoupled & query-friendly (D12) |
| Capture scope (dashboard subset vs. all fields) | **Store all gateway fields** as a full metric map; dashboard is a projection — acknowledged YAGNI deviation (D13) |
| Sky-condition icon source | **NWS current conditions** (`api.weather.gov`), cached + mapped; greyed stale fallback — offline-first not offline-only, Optional External Enrichment (D14) |
| Gateway field mapping (rain/pressure/wind/daily) | **Device-verified capture is canonical**: rain from `piezoRain` (not `rain`), pressure from `wh25`, wind in `common_list`; day high/low, 10-min avg wind, max-gust direction **derived from stored history** (D15) |

All NEEDS CLARIFICATION items are resolved. Proceed to Phase 1 design.
