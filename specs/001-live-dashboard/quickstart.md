# Quickstart: Live Weather Dashboard

**Feature**: 001-live-dashboard · **Phase 1 validation guide**

This is a **run & validation** guide, not an implementation guide. It proves the
feature works end-to-end against the [spec](spec.md) user stories. Implementation
detail lives in [data-model.md](data-model.md), [contracts/](contracts/), and (later)
`tasks.md`. Everything below uses **mock/synthetic data** — no real gateway, no
network, per the constitution.

## Prerequisites

- Node.js 22 LTS + npm (monorepo workspaces).
- Docker + Docker Compose (for the full-stack run).
- A copy of `.env.example` → gitignored `.env.local` with values filled in
  (see [data-model.md §10](data-model.md), IngestionConfiguration). At minimum:
  `GATEWAY_BASE_URL`, `HOUSEHOLD_LAT`, `HOUSEHOLD_LON`, `SQLITE_PATH`.

## Verify the build & quality gates (no services needed)

```bash
npm ci
npm run typecheck        # tsc --noEmit across all workspaces (CI-parity)
npm run test:coverage    # Vitest + v8; MUST be 100% (CI hard gate)
```

Expected: typecheck clean, all suites green, coverage 100% statements/branches/
functions/lines. Tests use a stub gateway and a temp SQLite file only.

## Run the full stack

```bash
docker compose up --build
```

Brings up **poller + api + web** (and the backup sidecar). The poller begins pulling
the gateway on the configured cadence (default 30 s); the web client polls the API on
the UI refresh cadence (default 10 s).

- Dashboard: `http://<host>/` (kiosk-targeted).
- API base: `http://<host>:<api-port>/api/v1`.

## Validation scenarios (map to user stories)

### US7 — Live data flows end to end (P1)

1. Start the stack with the stub/real gateway producing a valid payload.
2. `curl http://<host>:<api-port>/api/v1/latest` → `status: "ok"`, a non-null
   `reading`, an `observedAt` in **UTC** (`Z` suffix), plus `astro`, `baroTrend`,
   `conditionIcon` (NWS-sourced) and `conditionStale` (`true` ⇒ greyed icon when NWS
   is unavailable). Schema: [contracts/api-v1.openapi.yaml](contracts/api-v1.openapi.yaml).
3. Load the dashboard → panels render real values within one poll + one UI refresh
   cadence (SC-003/SC-010).

### US8 — Empty store shows no-data, never fake zeros (P1)

1. Start with an empty SQLite store (no readings yet).
2. `curl …/latest` → `status: "no-data"`, `reading: null`, `observedAt: null`.
3. Dashboard shows em-dash `—` on neutral gauges — **never** fabricated `0`
   (FR-053). On the first valid poll, panels transition Missing → Fresh.

### US9 — Resilience to gateway failure / malformed payloads (P2)

1. With a good reading already stored, switch the stub gateway to return a
   timeout / malformed / partial payload.
2. The poller does **not** crash and does **not** persist; the store and latest
   snapshot are unchanged (FR-046/FR-047), last good reading remains latest.
3. As `observedAt` ages past **3× the poll cadence**, affected panels dim and show a
   `STALE` tag while retaining the last value (FR-035) — degradation is **per-panel**,
   not whole-screen.
4. On the next valid poll, panels return to Fresh.

### Full-fidelity capture (research D13) — history for all fields

1. After a few valid polls, inspect a stored row's `metrics_json`:
   ```bash
   sqlite3 "$SQLITE_PATH" "SELECT metrics_json FROM readings ORDER BY observed_at DESC LIMIT 1;"
   ```
2. Confirm it contains **more fields than the dashboard renders** — every category
   the gateway reported (e.g. relative pressure, any extra sensor channels), not just
   the ~24 dashboard metrics. This is the historical superset; the dashboard is a
   projection ([data-model.md §2–§5](data-model.md)).

### Timezone — storage UTC / display Eastern (FR-054)

1. Confirm stored `observed_at` and API `observedAt` are **UTC** (`Z`).
2. Confirm the dashboard renders all times in **America/New_York**. Verify across a
   **standard-time** date (e.g. 2026-01-15) and a **DST** date (e.g. 2026-07-15) that
   the displayed clock/sun times shift correctly — Eastern is pinned explicitly via
   `Intl` (never browser locale).

## Done criteria

- [ ] `npm run typecheck` clean; `npm run test:coverage` 100%.
- [ ] `/api/v1/latest` returns valid `ok` and `no-data` shapes per the OpenAPI contract.
- [ ] Dashboard renders live values, shows `—` (not `0`) on empty store, and degrades
      per-panel to `STALE` on gateway failure.
- [ ] `metrics_json` captures the full gateway field set (superset of the dashboard).
- [ ] All displayed times are Eastern across standard and DST dates; storage is UTC.
