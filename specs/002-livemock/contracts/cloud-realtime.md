# Cloud Contract: Ecowitt Cloud API `device/real_time`

**Feature**: 002-livemock · **Phase 1** · Consumed by `apps/poller` only (via
`apps/poller/src/ecowittCloud.ts`). This is the **external** contract the cloud fetcher
depends on. The raw cloud payload is validated (zod `cloudRealtimeSchema`) and then
translated by the pure shared adapter (`cloudRealtimeToGateway`) into the gateway
`get_livedata_info` shape ([../data-model.md](../data-model.md) §2) so the existing mapper
consumes it unchanged. The raw cloud payload is never persisted verbatim.

> **Dev/test source only.** This contract is exercised exclusively under
> `POLLER_SOURCE=cloud`. Production stays on the LAN gateway contract
> ([../../001-live-dashboard/contracts/gateway-livedata.md](../../001-live-dashboard/contracts/gateway-livedata.md)).
> The cloud fetcher reaches the **public** Ecowitt API over HTTPS from the **main** network;
> it does **not** touch the IoT VLAN or the gateway pinhole.

## Endpoint

- `GET {ECOWITT_API_BASE_URL}/api/v3/device/real_time`
  (default base `https://api.ecowitt.net`).
- HTTPS, authenticated by API keys in the query string (no secrets in source — supplied via
  gitignored `.env`).
- The fetcher uses an `AbortController` timeout (`DEFAULT_GATEWAY_TIMEOUT_MS = 5000`) so a
  hung/slow request fails fast and the cycle retries next cadence (FR-003).

## Request parameters

| Param | Source | Value | Notes |
|-------|--------|-------|-------|
| `application_key` | `ECOWITT_APP_KEY` | secret | required |
| `api_key` | `ECOWITT_API_KEY` | secret | required |
| `mac` | `ECOWITT_MAC` | device MAC | required |
| `call_back` | constant | `outdoor,indoor,solar_and_uvi,rainfall_piezo,wind,pressure` | trimmed CSV (D9); `all` also acceptable |
| `temp_unitid` | constant | `2` | ℉ (FR-004) |
| `wind_speed_unitid` | constant | `9` | mph |
| `rainfall_unitid` | constant | `13` | in |
| `pressure_unitid` | constant | `4` | **inHg** — mapper requires inHg (FR-005) |
| `solar_irradiance_unitid` | constant | `16` | W/m² |

## Response envelope (Source of Truth: a captured live payload)

> **Canonical source**: confirm field nesting against a **live capture** during quickstart,
> not vendor docs. Where docs and the device disagree, the device payload wins. See
> research **D7** for the one nesting detail (rain weekly/monthly/yearly) that must be
> confirmed.

```jsonc
{ "code": 0, "msg": "success", "time": "<epoch-seconds>", "data": { /* groups */ } }
```

- **Success** is `code === 0`; `data` is an object of named groups, each metric an object
  `{ time?, unit?, value }` (string-valued).
- **Error** carries a non-zero `code`, a human message in `msg`, and `data: []`.

Consumed groups → see the [Cloud → Gateway field mapping](../data-model.md#3-cloud--gateway-field-mapping).
Any other group the cloud returns is ignored by the adapter (Edge Cases).

### Representative error codes

| `code` | `msg` (example) | Fetcher result |
|--------|------------------|----------------|
| `0` | `success` | `{ ok: true, data }` |
| `40010` | `Invalid application Key` | `{ ok: false, error: "Invalid application Key" }` |
| `40011` | `Invalid api Key` | `{ ok: false, error: ... }` |
| `40012` | `Invalid MAC/IMEI` | `{ ok: false, error: ... }` |
| (rate limit) | rate-limit message | `{ ok: false, error: ... }` — recoverable |

## Fetcher result contract (FR-003, FR-021)

```ts
type CloudResult =
  | { ok: true;  data: unknown }   // code === 0; raw `data` passed to the adapter
  | { ok: false; error: string };  // never throws
```

- HTTP non-2xx ⇒ `{ ok: false, error: "HTTP <status>" }` (mirrors the gateway client).
- Non-JSON / network error / timeout (abort) ⇒ `{ ok: false, error: <message> }`.
- `code !== 0` ⇒ `{ ok: false, error: <msg> }` carrying the API message (D2) — **not thrown**.
- `code === 0` ⇒ `{ ok: true, data: <data> }`; the poll cycle then runs
  `cloudRealtimeToGateway(data)` → `normalizeToFullMetricMap` → `projectLiveReading` → store.

## Honest degradation (FR-022, FR-023)

A failed cloud cycle is reported via the existing `onError` path and **skips** the cycle —
the store is untouched and the poller keeps running. On **sustained** failure the store goes
stale and the existing freshness logic degrades the UI to em-dashes — never fabricated or
zero values (same as Feature 001 US9).

## No-data window

The cloud `real_time` endpoint returns data only for roughly the past ~2 hours. A
`code:0`-but-empty/no-data response degrades like any other stale source (FR-023).

## Testing note (mock-data only, NON-NEGOTIABLE)

The fetcher is tested against an **injected `fetch`** serving canned cloud fixtures: a valid
`code:0` payload, a non-zero-`code` envelope, an HTTP error, a network error, and an abort
(timeout). No live network is used in CI (constitution Test Data Separation). A captured
live payload is used only for manual quickstart verification, never in automated tests.
