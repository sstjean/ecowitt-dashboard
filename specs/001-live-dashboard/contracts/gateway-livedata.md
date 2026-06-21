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

## Payload shape (observed Ecowitt local-API format)

The response is a JSON object of category arrays; each item is an
`{ id|channel, val, unit? }` record. Exact ids vary by firmware/sensor set, so the
mapper reads by id and tolerates absent optional sensors but **rejects** the whole
payload if a required field is missing or non-numeric.

> **Full-fidelity capture (D13):** the poller normalises and stores **all** reported
> categories/fields, not just the rows that feed the current dashboard. The table
> below shows the dashboard-relevant fields explicitly; **any additional categories**
> the gateway emits — e.g. relative pressure, heat index / wind chill, lightning
> (WH57), soil moisture (WH51), multi-channel temp/humidity (WH31), PM2.5 / CO₂ air
> quality (WH41/WH45), leaf wetness, leak sensors (WH55), and per-sensor battery /
> signal status — are captured into the `FullMetricMap` as well. Unknown-unit fields
> are preserved as-is rather than dropped.

Representative categories the poller reads:

| Category | Representative fields | Maps to snapshot |
|----------|----------------------|------------------|
| `common_list` | outdoor temp, feels like, dewpoint, solar (W/m²), UV, abs pressure | `outdoorTempF`, `feelsLikeF`, `dewpointF`, `solarWm2`, `uvIndex`, `pressureHpa` |
| outdoor humidity (`common_list` / `ch_aisle`) | outdoor RH % | `outdoorHumidityPct` |
| `wh25` (indoor T/H/baro) | indoor temp, indoor RH | `indoorTempF`, `indoorHumidityPct` |
| wind block | speed, dir (deg), gust, 10-min avg, max daily gust (+dir) | `windMph`, `windDirDeg`, `gustMph`, `windAvg10mMph`, `maxDailyGustMph`, `maxDailyGustDir` |
| daily extremes | day high/low outdoor temp | `dayHighF`, `dayLowF` |
| `rain` / `rain_list` | event, hourly, daily, weekly, monthly, yearly | `rainEventIn`, `rainHourlyIn`, `rainDailyIn`, `rainWeeklyIn`, `rainMonthlyIn`, `rainYearlyIn` |

> **Daily aggregates** (day high/low, 10-min avg wind, max daily gust) are taken
> from the gateway's own fields **as-is** — the application does not recompute them
> (FR-018b). The gateway resets these at local midnight.

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
