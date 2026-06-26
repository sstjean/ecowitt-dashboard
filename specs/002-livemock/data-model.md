# Phase 1 Data Model: LiveMock

**Feature**: 002-livemock · Consumed by `apps/poller` (fetcher) and `packages/shared`
(adapter). The downstream model (`FullMetricMap`, `MappedReading`, `LiveReadingSnapshot`)
is **unchanged** from Feature 001 — see [001 data-model](../001-live-dashboard/data-model.md).

This document defines (1) the **cloud `real_time` entity** the fetcher returns, (2) the
**gateway-shaped adapter output**, (3) the **full cloud → gateway field mapping**, and
(4) the **new poller config entity**.

---

## 1. Cloud `real_time` response (external entity)

The Ecowitt cloud envelope from `GET /api/v3/device/real_time`:

```jsonc
{
  "code": 0,           // 0 = success; non-zero = error (data is [])
  "msg": "success",    // human-readable status / error message
  "time": "1750531200",// epoch seconds of the reading
  "data": {            // present only on success (code:0)
    "outdoor":        { "temperature": { "time": "...", "unit": "℉",   "value": "72.3" },
                        "feels_like":  { ... }, "dew_point": { ... }, "humidity": { "unit": "%", "value": "58" } },
    "indoor":         { "temperature": { "unit": "℉", "value": "70.1" }, "humidity": { "unit": "%", "value": "47" } },
    "solar_and_uvi":  { "solar": { "unit": "W/m²", "value": "612.0" }, "uvi": { "unit": "", "value": "5" } },
    "wind":           { "wind_speed": { "unit": "mph", "value": "4.1" },
                        "wind_gust":  { "unit": "mph", "value": "9.2" },
                        "wind_direction": { "unit": "º", "value": "212" } },
    "pressure":       { "relative": { "unit": "inHg", "value": "30.01" },
                        "absolute": { "unit": "inHg", "value": "29.74" } },
    "rainfall_piezo": { "rain_rate": { "unit": "in/hr", "value": "0.00" },
                        "event": { ... }, "1_hour": { ... }, "daily": { ... },
                        "weekly": { ... }, "monthly": { ... }, "yearly": { ... },
                        "state": { ... }, "24_hours": { ... } }
  }
}
```

**Validation (new `cloudRealtimeSchema` in `packages/shared/src/schema.ts`)**:

- Envelope: `{ code: number, msg: string, time?: string, data: ... }`.
- A metric value is `{ time?: string, unit?: string, value: string }` (string-valued, as
  Ecowitt emits). A reusable `cloudMetricSchema` captures this.
- `data` (success branch): an object with the mapped groups. Each consumed field is
  **required** so a partial payload is rejected (FR-008, input-validation gate). Unmapped
  groups are tolerated (loose object) and ignored by the adapter (Edge Cases).
- The **adapter** validates `data` with this schema before translating (FR-008). The
  **fetcher** separately treats `code !== 0` as a typed failure (D2) before the adapter is
  ever called.

> The exact nesting of `data` is **verified against a captured live payload** (research **D7**,
> quickstart T014). Confirmed on a live GW2000B: `rainfall_piezo` carries `weekly`/`monthly`/`yearly`
> (D7 settled), the hourly total is keyed **`1_hour`** (not `hourly`), and the device also emits
> `state` and `24_hours`, which are tolerated (loose) and ignored.

---

## 2. Gateway-shaped adapter output (`cloudRealtimeToGateway` return)

A `get_livedata_info`-shaped object that `normalizeToFullMetricMap` accepts **unchanged**.
Shape per `gatewayResponseSchema`: `{ common_list[], wh25[1], piezoRain[≥1], rain? }`.

```jsonc
{
  "common_list": [
    { "id": "0x02", "val": "<outdoor.temperature>",   "unit": "℉" },
    { "id": "0x07", "val": "<outdoor.humidity>" },
    { "id": "3",    "val": "<outdoor.feels_like>",     "unit": "℉" },
    { "id": "0x03", "val": "<outdoor.dew_point>",      "unit": "℉" },
    { "id": "0x0B", "val": "<wind.wind_speed>",        "unit": "mph" },
    { "id": "0x0C", "val": "<wind.wind_gust>",         "unit": "mph" },
    { "id": "0x0A", "val": "<wind.wind_direction>" },
    { "id": "0x15", "val": "<solar_and_uvi.solar>" },
    { "id": "0x17", "val": "<solar_and_uvi.uvi>" },
    { "id": "0x19", "val": "<wind.wind_gust>",         "unit": "mph" },  // SYNTHESIZED maxDailyGustMph (Decision A)
    { "id": "0x6D", "val": "<wind.wind_direction>" }                      // SYNTHESIZED windAvg10mDirDeg (Decision A)
  ],
  "wh25": [
    { "intemp": "<indoor.temperature>", "inhumi": "<indoor.humidity>",
      "abs": "<pressure.absolute>",     "rel": "<pressure.relative>", "unit": "℉" }
  ],
  "piezoRain": [
    { "id": "srain_piezo", "val": "<rain_rate>0 ? 1 : 0>" },             // SYNTHESIZED isRaining source (D5)
    { "id": "0x0D", "val": "<rainfall_piezo.event>",    "unit": "in" },
    { "id": "0x0E", "val": "<rainfall_piezo.rain_rate>","unit": "in/hr" },
    { "id": "0x7C", "val": "<rainfall_piezo.1_hour>",   "unit": "in" },
    { "id": "0x10", "val": "<rainfall_piezo.daily>",    "unit": "in" },
    { "id": "0x11", "val": "<rainfall_piezo.weekly>",   "unit": "in" },  // D7 — LOCKED (verify at quickstart)
    { "id": "0x12", "val": "<rainfall_piezo.monthly>",  "unit": "in" },  // D7 — LOCKED (verify at quickstart)
    { "id": "0x13", "val": "<rainfall_piezo.yearly>",   "unit": "in" }   // D7 — LOCKED (verify at quickstart)
  ]
}
```

**Invariants**:

- Pressure (`wh25.abs`/`wh25.rel`) MUST be inHg — the mapper unconditionally applies
  `inHgToHpa` (D8).
- Units on pass-through fields are benign strings that match the requested display units, so
  the mapper's `toF`/`toMph`/`toIn` pass values through without conversion (temperature in
  ℉, wind in mph, rain in inches). Only pressure is converted by the mapper.
- The output is gateway-shaped **input** to the mapper; the adapter does NOT produce the flat
  `FullMetricMap` or set `isRaining` directly — `isRaining` is derived by the unchanged
  mapper from the synthesized `srain_piezo` (D5).

---

## 3. Cloud → Gateway field mapping (authoritative)

Reused from the spec appendix, **extended** with the three synthesized/derived rows the
strict schema requires (see research D4/D5/D7):

| Gateway target | Gateway shape key | Cloud source | Notes |
|----------------|-------------------|--------------|-------|
| `outdoorTempF` | `common_list 0x02` | `outdoor.temperature` | pass-through ℉ |
| `outdoorHumidityPct` | `common_list 0x07` | `outdoor.humidity` | |
| `feelsLikeF` | `common_list "3"` | `outdoor.feels_like` | pass-through ℉ |
| `dewpointF` | `common_list 0x03` | `outdoor.dew_point` | pass-through ℉ |
| `windMph` | `common_list 0x0B` | `wind.wind_speed` | pass-through mph |
| `gustMph` | `common_list 0x0C` | `wind.wind_gust` | pass-through mph |
| `windDirDeg` | `common_list 0x0A` | `wind.wind_direction` | |
| `solarWm2` | `common_list 0x15` | `solar_and_uvi.solar` | |
| `uvIndex` | `common_list 0x17` | `solar_and_uvi.uvi` | |
| `maxDailyGustMph` | `common_list 0x19` | **`wind.wind_gust`** | **SYNTHESIZED** (Decision A / D4) |
| `windAvg10mDirDeg` | `common_list 0x6D` | **`wind.wind_direction`** | **SYNTHESIZED** (Decision A / D4) |
| `indoorTempF` | `wh25.intemp` | `indoor.temperature` | pass-through ℉ |
| `indoorHumidityPct` | `wh25.inhumi` | `indoor.humidity` | |
| `pressureHpa` | `wh25.abs` (inHg→hPa) | `pressure.absolute` | mapper converts |
| `relPressureHpa` | `wh25.rel` (inHg→hPa) | `pressure.relative` | mapper converts |
| `rainEventIn` | `piezoRain 0x0D` | `rainfall_piezo.event` | |
| `rainRateInHr` | `piezoRain 0x0E` | `rainfall_piezo.rain_rate` | |
| `rainHourlyIn` | `piezoRain 0x7C` | `rainfall_piezo.1_hour` | |
| `rainDailyIn` | `piezoRain 0x10` | `rainfall_piezo.daily` | |
| `rainWeeklyIn` | `piezoRain 0x11` | `rainfall_piezo.weekly` | D7 — LOCKED (verify at quickstart) |
| `rainMonthlyIn` | `piezoRain 0x12` | `rainfall_piezo.monthly` | D7 — LOCKED (verify at quickstart) |
| `rainYearlyIn` | `piezoRain 0x13` | `rainfall_piezo.yearly` | D7 — LOCKED (verify at quickstart) |
| `isRaining` | `piezoRain srain_piezo` | **`rainfall_piezo.rain_rate > 0`** | **SYNTHESIZED** flag (D5) |

The tipping-bucket group (`data.rainfall.*`) is **ignored** (FR-010, D6).

---

## 4. Poller configuration entity (extended)

`PollerConfig` (in `apps/poller/src/config.ts`) gains:

| Field | Env var | Type / default | Required when |
|-------|---------|----------------|---------------|
| `source` | `POLLER_SOURCE` | `"gateway" \| "cloud"`, default `gateway` | always (defaulted) |
| `ecowittAppKey` | `ECOWITT_APP_KEY` | string | `source=cloud` |
| `ecowittApiKey` | `ECOWITT_API_KEY` | string | `source=cloud` |
| `ecowittMac` | `ECOWITT_MAC` | string | `source=cloud` |
| `ecowittApiBaseUrl` | `ECOWITT_API_BASE_URL` | string URL, default `https://api.ecowitt.net` | optional |

**Validation rules** (D10):

- `POLLER_SOURCE` parsed by `z.enum(["gateway","cloud"]).default("gateway")`.
- When `source === "cloud"`, the three `ECOWITT_*` credentials MUST be present and non-empty;
  otherwise config validation throws loudly at startup (consistent with existing config
  behaviour). When `source === "gateway"`, `GATEWAY_BASE_URL` keeps its current required role
  and the cloud fields are not required.
- `ECOWITT_API_BASE_URL` validates as a URL and defaults to `https://api.ecowitt.net`.

**State / wiring** (`index.ts`, D1): when `source === "cloud"`, `index.ts` builds a poll
callback that calls `fetchCloudRealtime` → `cloudRealtimeToGateway` and feeds the
gateway-shaped result into the existing `ingestPayload` path; when `source === "gateway"`,
behaviour is identical to today. `runPollCycle` itself is unchanged.

---

## Downstream (unchanged)

`normalizeToFullMetricMap` → `FullMetricMap` → `projectLiveReading` → `MappedReading` →
store → API derives the four daily aggregates from history → `LiveReadingSnapshot` →
web/freshness. None of these change; the adapter's only contract is "produce a payload
`normalizeToFullMetricMap` accepts" (FR-014).
