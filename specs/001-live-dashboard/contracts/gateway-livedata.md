# Gateway Contract: Ecowitt GW2000B `get_livedata_info`

**Feature**: 001-live-dashboard · **Phase 1** · Consumed by `apps/poller` only.

This is the **external** contract the ingestion poller depends on. The gateway lives
on the isolated IoT VLAN; the poller is the only component permitted to call it
(single firewall pinhole, FR-044). The raw payload is **validated and sanitised**
(zod) and then **normalised into a full metric map** capturing **every field the
gateway reports** ([data-model.md](../data-model.md) §2). The dashboard
`LiveReadingSnapshot` is a curated projection of that map; the full map is what is
persisted (acknowledged YAGNI deviation, [research D13](../research.md)). The raw
payload itself is never persisted verbatim (FR-047).

## Endpoint

- `GET http://<GATEWAY_BASE_URL>/get_livedata_info`
- Pull-only over the LAN→IoT pinhole. Request uses an `AbortController` timeout so a
  hung/unreachable gateway fails fast and retries next cadence (FR-046).
- No authentication on the local API (LAN-trust model).

## Payload shape (DEVICE-VERIFIED — Source of Truth)

> **Canonical source:** this section is grounded in a **live capture** from the
> household GW2000B (`GET http://192.168.30.109/get_livedata_info`, HTTP 200,
> 2026-06-21), **not** vendor documentation. Where Ecowitt's published docs and the
> real device disagree, **the device payload wins** — the docs are a proxy, the wire
> format is canonical. Field ids below are the ones this gateway actually emits.

The response is a JSON object of **category arrays**; each item is an
`{ id, val, unit? }` record (some categories use named keys, e.g. `wh25`). The mapper
reads by id within its category and tolerates absent optional sensors but **rejects**
the whole payload if a required field is missing or non-numeric.

> **Full-fidelity capture (D13):** the poller normalises and stores **all** reported
> categories/fields, not just the rows that feed the current dashboard. The table
> below shows the dashboard-relevant fields explicitly; **any additional categories**
> the gateway emits — e.g. `debug` (heap/runtime), lightning (WH57), soil moisture
> (WH51), multi-channel temp/humidity (WH31), PM2.5 / CO₂ air quality (WH41/WH45),
> leaf wetness, leak sensors (WH55), and per-sensor battery / signal status — are
> captured into the `FullMetricMap` as well. Unknown-unit fields are preserved as-is
> rather than dropped.

Categories observed on this device and how they map to the snapshot:

| Category | Observed fields (id → meaning) | Maps to snapshot |
|----------|-------------------------------|------------------|
| `common_list` | `0x02` outdoor temp °F · `0x07` outdoor RH % · `"3"` feels-like/apparent temp °F¹ · `0x03` dewpoint °F · `0x0B` wind mph · `0x0C` gust mph · `0x19` max **daily** gust mph · `0x0A` wind dir ° · `0x15` solar W/m² · `0x17` UVI · `"5"` VPD kPa (extra) · `0x6D` 10-min avg wind dir °¹ | `outdoorTempF`, `outdoorHumidityPct`, `feelsLikeF`, `dewpointF`, `windMph`, `gustMph`, `maxDailyGustMph`, `windDirDeg`, `solarWm2`, `uvIndex`, `windAvg10mDirDeg` |
| `wh25` (indoor + barometer) | `intemp` indoor temp °F · `inhumi` indoor RH % · `abs` absolute pressure (inHg) · `rel` relative pressure (inHg) | `indoorTempF`, `indoorHumidityPct`, `pressureHpa` (from `abs`, inHg→hPa) |
| `piezoRain` (WS90 haptic gauge) — **the real rain source** | `srain_piezo` flag · `0x0D` event · `0x0E` rate · `0x7C` hourly · `0x10` daily · `0x11` weekly · `0x12` monthly · `0x13` yearly (+ ws90 battery/cap/firmware) | `rainEventIn`, `rainHourlyIn`, `rainDailyIn`, `rainWeeklyIn`, `rainMonthlyIn`, `rainYearlyIn`, `rainRateInHr`, `isRaining` |
| `rain` (legacy tipping bucket) | same id set as `piezoRain` | **NOT used** (see below) |
| `debug` | heap, runtime, usr_interval, is_cnip | captured into `FullMetricMap` only |

¹ Observed but not vendor-documented; `common_list` `"3"` and `0x6D` are mapped on
best-evidence and **confirmed at implementation** against a fresh capture.

> **⚠ Rain comes from `piezoRain`, NEVER the `rain` tipping bucket — this is the
> reason the project exists.** In the device-verified capture taken *during an active
> rainstorm*, every `rain` (tipping-bucket) total read `0.00 in` while `piezoRain`
> (the WS90 haptic gauge) reported the true accumulation (e.g. `0.67 in` daily). The
> stock Ecowitt app/console surface the dead `rain` value by default and bury
> `piezoRain` behind scrolling. This dashboard **maps all six rain totals from
> `piezoRain`** so a real storm is never shown as zero. The `rain` category is still
> captured into the `FullMetricMap` (D13) but is not projected to the snapshot.

> **Barometric pressure lives in `wh25`, not `common_list`.** The device exposes
> absolute (`abs`) and relative (`rel`) pressure under `wh25` in **inHg**; the mapper
> converts `abs` → hPa for `pressureHpa` (FR-031).

> **Wind lives inside `common_list`, not a separate "wind block".** Speed, gust, max
> daily gust, and direction are all `common_list` ids.

> **Derived daily/rolling aggregates — NOT supplied by this gateway.** The live
> payload does **not** contain day high/low outdoor temperature, a 10-minute average
> wind **speed**, or the **direction** of the max daily gust. These are **computed by
> the API from the application's own stored history** (FR-018b):
> - `dayHighF` / `dayLowF` — max/min `outdoorTempF` over stored readings since local
>   midnight (`America/New_York`).
> - `windAvg10mMph` — rolling mean of stored `windMph` over the last 10 minutes.
> - `maxDailyGustDir` — wind direction recorded at the largest gust observed since
>   local midnight (the gateway supplies the max daily gust **speed** via `0x19`, but
>   not its direction).
>
> Only the max daily gust **speed** (`maxDailyGustMph`, `common_list 0x19`) is taken
> from the gateway as-is. The 10-minute average wind **direction**
> (`windAvg10mDirDeg`, `common_list 0x6D`), the rain **rate** (`rainRateInHr`,
> `piezoRain 0x0E`), and the **raining-now** flag (`isRaining`, `piezoRain
> srain_piezo`) are likewise gateway-supplied and projected as-is — not derived.

## Unit normalisation

The gateway may report units per its configuration. The poller normalises to the
fixed display units (FR-037): °F, mph, in, hPa, W/m², %. If the gateway is configured
for other units (°C, m/s, mm, inHg), the mapper converts during mapping; the
canonical snapshot is always in the fixed units. Conversions are pure functions with
their own unit tests.

## Validation / rejection rules (FR-047, FR-050)

- Non-JSON, HTTP error, or timeout ⇒ poll fails, nothing written, retry next cadence.
- Missing/non-numeric **required** field (e.g., outdoor temperature, observation
  basis) ⇒ entire payload **rejected**, store untouched, last good reading remains
  latest (US9).
- Values outside physical bounds (humidity ∉ [0,100], windDirDeg ∉ [0,360], negative
  rainfall/solar/uv) ⇒ rejected.
- **Extra/unknown fields never cause rejection** — they are captured into the
  `FullMetricMap` (D13). Only the dashboard-**required** fields gate persistence.
- A reading is persisted **only** after passing all validation.

## Observation time

The poller stamps `observedAt` as the UTC time the reading was acquired (the gateway
local API returns "now" values). Stored in UTC; the freshness state and barometric
trend derive from it.

## Testing note (mock-data only, NON-NEGOTIABLE)

The poller is tested against an in-process stub HTTP server (or injected `fetch`)
serving canned fixtures: a valid payload, a malformed payload, a partial payload, and
a timeout. No test depends on a real gateway or the network.
