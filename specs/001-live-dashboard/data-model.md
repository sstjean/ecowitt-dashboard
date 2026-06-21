# Phase 1 Data Model: Live Weather Dashboard

**Feature**: 001-live-dashboard · **Date**: 2026-06-21 · **Source**: [spec.md](spec.md) Key Entities + Requirements

All entities are defined once as **zod schemas** in `packages/shared` and reused by
the poller, API, and web client (`z.infer` for types). Times are **stored and
transported in UTC** (ISO 8601, `Z`); **display** formatting to `America/New_York`
happens only at the view layer (FR-054). Units are fixed (FR-037): °F, mph, in, hPa,
W/m², %, UV unitless.

---

## 1. GatewayResponse (raw, external)

The unvalidated payload pulled from the GW2000B `get_livedata_info` endpoint. Shape
is the gateway's, not ours; it is validated/sanitised and then **normalised into a
full metric map** (every reported field), from which a curated `LiveReadingSnapshot`
is projected. Detailed field mapping lives in
[contracts/gateway-livedata.md](contracts/gateway-livedata.md).

- **Validation rules (FR-047, FR-050)**:
  - Must parse as JSON and match the expected category structure; otherwise
    **rejected** (not persisted).
  - Required outdoor temperature + observation basis must be present and numeric and
    within sane physical bounds; partial/malformed payloads are rejected wholesale.
  - A rejected response leaves the existing store and latest snapshot untouched.
- **Lifecycle**: transient — never stored raw; only the validated, normalised
  metric map (and its projected snapshot) is persisted.

## 2. FullMetricMap (canonical full reading — full-fidelity capture)

> **Acknowledged YAGNI deviation** ([research D13](research.md)): we store **every
> field the gateway reports**, not just the dashboard subset, so historical data
> accrues for all metrics and any field can later surface in the UI with no
> migration.

The validated payload normalised into a flat, canonical map of all reported metrics:
`Record<string, number | string>` keyed by stable canonical names (e.g.
`outdoorTempF`, `relPressureHpa`, `lightningCountDay`, `soilMoisture1Pct`,
`pm25Ch1`, `battOutdoor`, …). Coverage is **whatever this gateway reports** —
including sensors/channels/aggregates beyond the current dashboard.

- **Normalisation**: known fields are converted to the fixed display units
  (FR-037); unit-known extras are normalised, and any field whose unit is unknown is
  **preserved as-is** rather than dropped, so an unanticipated sensor is never lost.
- **Required-field validation still applies**: the dashboard-required fields
  (below) must be present, numeric, and in-bounds or the **entire** payload is
  rejected (FR-047/FR-050). Extra fields never cause rejection.
- **Relationship to the snapshot**: `LiveReadingSnapshot` is a typed **projection**
  of this map for the dashboard; the map is the lossless superset that is stored.

## 3. LiveReadingSnapshot (curated dashboard projection)

The typed subset of the `FullMetricMap` the current dashboard renders. One per
successful poll. (Stored within the full map; surfaced via the API.)

| Field | Type | Unit | Notes |
|-------|------|------|-------|
| `observedAt` | string (ISO-8601 UTC) | — | Observation time; basis for freshness (FR-035/FR-052) and ordering. |
| `outdoorTempF` | number | °F | Headline value (FR-009). |
| `feelsLikeF` | number | °F | Heat-index/wind-chill (FR-011/FR-011b); colours to 120 °F. |
| `dewpointF` | number | °F | Supporting readout (FR-011); `common_list 0x03`. |
| `outdoorHumidityPct` | number | % | Supporting readout (FR-011); `common_list 0x07`. |
| `dayHighF` | number | °F | **Derived** by the API: max `outdoorTempF` over stored readings since local midnight — gateway does not supply (FR-010/FR-018b, §7b). |
| `dayLowF` | number | °F | **Derived** by the API: min `outdoorTempF` over stored readings since local midnight — gateway does not supply (FR-010/FR-018b, §7b). |
| `windMph` | number | mph | Current wind speed (FR-014); `common_list 0x0B`. |
| `windDirDeg` | number (0–360) | ° | Bearing (FR-015/FR-018a); `common_list 0x0A`. |
| `gustMph` | number | mph | Current gust (FR-016); `common_list 0x0C`. |
| `windAvg10mMph` | number | mph | **Derived** by the API: rolling mean of stored `windMph` over the last 10 min — gateway does not supply (FR-017/FR-018b, §7b). |
| `windAvg10mDirDeg` | number (0–360) | ° | Gateway 10-min average wind **direction**, as-is; `common_list 0x6D` (FR-017a). Paired in the UI with the derived `windAvg10mMph`. |
| `maxDailyGustMph` | number | mph | Gateway daily max gust **speed**, as-is; `common_list 0x19` (FR-018). |
| `maxDailyGustDir` | string (cardinal) | — | **Derived** by the API: wind direction at the largest gust observed since local midnight — gateway supplies the speed but not the direction (FR-018/FR-018b, §7b). |
| `solarWm2` | number | W/m² | Solar radiation (FR-019). |
| `uvIndex` | number | — | UV index (FR-020). |
| `indoorTempF` | number | °F | Indoor ring (FR-024). |
| `indoorHumidityPct` | number | % | Indoor ring (FR-025). |
| `rainEventIn` | number | in | (FR-029); `piezoRain 0x0D`. |
| `rainHourlyIn` | number | in | (FR-029); `piezoRain 0x7C`. |
| `rainDailyIn` | number | in | Droplet fill basis (FR-027/FR-028); `piezoRain 0x10`. |
| `rainWeeklyIn` | number | in | (FR-029); `piezoRain 0x11`. |
| `rainMonthlyIn` | number | in | (FR-029); `piezoRain 0x12`. |
| `rainYearlyIn` | number | in | (FR-029); `piezoRain 0x13`. |
| `rainRateInHr` | number | in/hr | Current rain rate (FR-029a); `piezoRain 0x0E`. |
| `isRaining` | boolean | — | "Raining now" flag (FR-029b); `piezoRain srain_piezo` (non-zero ⇒ true). |
| `pressureHpa` | number | hPa | Absolute/station pressure (FR-031); from `wh25.abs` (inHg→hPa). |

> **Rain is sourced from `piezoRain` (the WS90 haptic gauge), never the legacy `rain`
> tipping bucket** — device-verified: the tipping bucket reads `0.00` during real
> rain while `piezoRain` carries the true totals. See
> [contracts/gateway-livedata.md](contracts/gateway-livedata.md). The headline panel
> is still **labelled "Rain"** in the UI; only the data source changes.
>
> **Derived fields** (`dayHighF`, `dayLowF`, `windAvg10mMph`, `maxDailyGustDir`) are
> not present in any single gateway poll; the API computes them from stored history
> (§7b) and merges them into the projected snapshot.

- **Validation rules**: every numeric field finite and within physical bounds
  (e.g., humidity 0–100, windDirDeg/windAvg10mDirDeg 0–360, non-negative
  rainfall/rate/solar/uv); `isRaining` is a boolean. Out-of-bounds ⇒ the whole
  reading is rejected at ingestion.
- **State**: immutable once written. Never overwritten; newest `observedAt` wins.

## 4. StoredReading (persistence — full-fidelity)

The `FullMetricMap` persisted to SQLite — the complete reading, not just the
projected snapshot.

- **Table** `readings`: `id INTEGER PRIMARY KEY`, `observed_at TEXT NOT NULL UNIQUE`
  (ISO-8601 UTC), and `metrics_json TEXT NOT NULL` holding the entire normalised
  `FullMetricMap`. Storing the map as JSON (not a column-per-field schema) means new
  sensors/channels never force a migration (research D3/D13).
- **Hot fields as generated columns**: dashboard/query-critical metrics are exposed
  as SQLite **generated (virtual) columns** over `json_extract(metrics_json, …)`
  (e.g. `observed_at` index + `pressure_hpa`), so any stored field can be promoted
  to an indexed first-class column later **without a data migration**.
- **Index**: `CREATE INDEX idx_readings_observed_at ON readings(observed_at)` for
  efficient "latest" and future time-range queries (FR-049).
- **Write rule**: only validated readings are inserted (FR-050); inserts are the
  poller's responsibility (single writer); WAL mode allows concurrent API reads.
- **Retention**: unbounded for the MVP (history feature later); ~1M rows/yr is fine
  even with the full metric map per row.

## 5. LatestSnapshot (API resource — `/api/v1/latest`)

What the dashboard consumes. The most recent `StoredReading` **projected to the
curated snapshot** and **enriched** with derived/astronomical context, or an
explicit **no-data** result when the store is empty
(FR-051/FR-052/FR-053).

| Field | Type | Notes |
|-------|------|-------|
| `status` | `"ok" \| "no-data"` | `no-data` on empty store — never fabricated zeros (FR-053). |
| `observedAt` | ISO-8601 UTC \| null | Null when `no-data`. |
| `reading` | LiveReadingSnapshot \| null | The stored values; null when `no-data`. |
| `astro` | AstronomicalData | Sun/moon (server-computed, offline). |
| `baroTrend` | BarometricTrend | Trend over 3 h window or `unavailable`. |
| `conditionIcon` | enum \| null | NWS-sourced current condition mapped to the icon vocabulary (`clear`/`partly-cloudy`/`cloudy`/`fog`/`rainy`/`snow`/`thunderstorm`/`night`); `null` until the first successful NWS fetch (FR-033, §7a). |
| `conditionStale` | boolean | `true` when NWS is unavailable or its last good fetch is older than `NWS_STALE_AFTER_SECONDS` ⇒ client greys the icon (FR-033, §7a). |
| `serverTime` | ISO-8601 UTC | For the client to reason about age if needed. |

- **Freshness is derived by the client** from `observedAt` vs the poll cadence
  (FR-035/FR-052); the API does not embed Fresh/Stale, it provides the timestamp.

## 6. AstronomicalData (derived, server-side, offline)

- `sunriseUtc`, `sunsetUtc` (ISO-8601 UTC; formatted to Eastern by the client),
  `sunAltitudeFraction` (0–1 position along the day arc for the current time, bounded
  before sunrise / after sunset — FR-022, edge case), `moonPhase` (0–1 or named
  phase, FR-023).
- **Derivation**: SunCalc from configured household lat/long + current date; no
  network (FR-056).

## 7. BarometricTrend (derived)

- `direction`: `"rising" | "steady" | "falling" | "unavailable"`.
- `deltaHpa`: number | null — change over the **3-hour** window (FR-032).
- **Rules**: computed from stored readings spanning ~3 h. When **fewer than 3 h** of
  history exist, `direction = "unavailable"`, `deltaHpa = null` (FR-032a, edge case)
  — never a fabricated steady/zero trend. The dead-band is explicit: `direction =
  "steady"` when `|deltaHpa| <= BARO_STEADY_EPSILON_HPA`, `"rising"` when
  `deltaHpa > +epsilon`, `"falling"` when `deltaHpa < -epsilon`. The epsilon is
  configurable (§10) so the rising/steady/falling boundary is deterministic and
  testable.

## 7a. ConditionData (NWS-sourced, online enrichment — offline-first, not offline-only)

> **Optional external enrichment** (constitution v2.1.0). The sky-condition icon is
> the one value fetched from outside the LAN, because the local sensors cannot
> faithfully classify sky condition. It degrades to a greyed stale state when NWS is
> unavailable and never blocks the core slice (FR-033/FR-056).

- **Source**: NWS `api.weather.gov` — resolve the household lat/long to the nearest
  observation station and read its latest observation (textDescription / icon +
  day-night). HTTPS, no API key; a contact `User-Agent` is required by NWS policy.
- **Mapping**: a pure function `nwsObservation → conditionIcon` over the vocabulary
  `clear | partly-cloudy | cloudy | fog | rainy | snow | thunderstorm | night`,
  unit-tested in isolation.
- **Caching & freshness**: the last good fetch is cached for `NWS_CACHE_TTL_SECONDS`
  and reused; `conditionStale = true` when no fetch has ever succeeded or the last
  good fetch is older than `NWS_STALE_AFTER_SECONDS`. A per-request timeout
  (`NWS_TIMEOUT_MS`) bounds each call; on failure the cached icon is kept and marked
  stale.
- **Client behaviour**: renders `conditionIcon` normally when `conditionStale` is
  false; greys it (stale) otherwise. Independent of per-panel sensor freshness (§8)
  — a stale icon never dims the rest of the barometer panel.
- **Isolation**: behind an injectable client; tests use mocked NWS responses only
  (FR-057). The poller and store are unaffected — this is API-side enrichment.

## 7b. DailyDerived (derived, server-side, from stored history)

> The household GW2000B does **not** report day high/low temperature, a 10-minute
> average wind **speed**, or the **direction** of the max daily gust (device-verified
> — [contracts/gateway-livedata.md](contracts/gateway-livedata.md)). The API derives
> them from the application's own SQLite history and merges them into the projected
> `LiveReadingSnapshot` (FR-018b). This is the same "enrich from stored readings"
> pattern as the barometric trend (§7).

- `dayHighF` / `dayLowF`: max / min `outdoorTempF` across stored readings whose
  `observedAt` falls on/after the most recent local midnight (`America/New_York`).
- `windAvg10mMph`: arithmetic mean of stored `windMph` over the trailing 10 minutes.
- `maxDailyGustDir`: the `windDirDeg` (rendered cardinal) recorded at the reading
  with the largest `gustMph` since local midnight; paired with the gateway's reported
  max daily gust **speed** (`maxDailyGustMph`).
- **Cold-start rule**: with too little history (e.g. just after a fresh install or
  local midnight rollover), each derived value falls back to the current reading's
  instantaneous equivalent (e.g. `dayHighF = dayLowF = outdoorTempF`,
  `windAvg10mMph = windMph`, `maxDailyGustDir` = direction of the current gust) —
  never a fabricated zero. These fields are bounded and unit-tested in isolation.

## 8. DataFreshnessState (view-derived, per panel)

Not stored or transported; computed by the client per panel from `observedAt`.

- **Fresh**: latest reading is current.
- **Stale**: `observedAt` older than **3× the ingestion poll cadence** (FR-035) →
  dim panel + `STALE` tag, last value retained.
- **Missing**: value unavailable / `status = no-data` → em-dash `—` on a neutral
  gauge; **never** a fabricated `0` (FR-035/FR-053).
- Degradation is **per-panel**, never whole-screen (edge cases).

## 9. TemperatureColorScale (view-derived)

- Pure function `tempF → color` along a visible-spectrum interpolation (violet→red),
  ~10 °F to 120 °F; ≥100 °F maps to clear hot reds (FR-012/FR-013). Shared by
  outdoor, Feels Like, and indoor rings. Authoritative stops in
  `design/design-language.md §5.3` — the app implements that scale, it is not
  re-specified here.

## 10. IngestionConfiguration (env-supplied, never committed)

| Key | Default | Notes |
|-----|---------|-------|
| `GATEWAY_BASE_URL` | — (required) | GW2000B local API base (IoT VLAN). |
| `POLL_CADENCE_SECONDS` | `30` | Configurable 30–60 (FR-045). |
| `UI_REFRESH_SECONDS` | `10` | Client poll of the API (FR-034a). |
| `HOUSEHOLD_LAT`, `HOUSEHOLD_LON` | — (required) | For SunCalc (FR-021/023). |
| `RAIN_FULL_SCALE_IN` | `4.0` | Droplet cap (FR-028). |
| `BARO_TREND_WINDOW_HOURS` | `3` | Trend window (FR-032). |
| `BARO_STEADY_EPSILON_HPA` | `0.3` | Dead-band for "steady": `|deltaHpa| <= epsilon` ⇒ steady (§7). |
| `NWS_USER_AGENT` | — (required) | Contact string NWS requires for `api.weather.gov` requests (FR-033, §7a). |
| `NWS_CACHE_TTL_SECONDS` | `600` | How long a good NWS fetch is reused before refetch. |
| `NWS_STALE_AFTER_SECONDS` | `3600` | Last good fetch older than this ⇒ `conditionStale` (greyed). |
| `NWS_TIMEOUT_MS` | `5000` | Per-request NWS timeout; on failure keep last good, mark stale. |
| `SQLITE_PATH` | — (required) | DB file path (on Docker volume). |

- Supplied via environment / gitignored `.env.local`; documented in `.env.example`
  (FR-055). No value-bearing config in source control.

---

## Entity relationships

```text
GatewayResponse --(validate+normalise, FR-047/FR-050)--> FullMetricMap --(persist all fields)--> StoredReading
FullMetricMap --(project curated subset)--> LiveReadingSnapshot
StoredReading (latest) --(project + enrich: SunCalc astro + baro trend + daily-derived aggregates from history)--> LatestSnapshot --(HTTP /api/v1/latest)--> Web client
NWS api.weather.gov --(fetch+cache+map; stale on failure, online enrichment)--> ConditionData --(conditionIcon + conditionStale)--> LatestSnapshot
Web client --(observedAt vs 3x cadence)--> DataFreshnessState (per panel)
Web client --(tempF)--> TemperatureColorScale (per ring)
IngestionConfiguration --> poller (cadence, gateway, location) ; API (location, thresholds) ; web (UI refresh)
```

## Validation & state-transition summary

- A reading exists in exactly one place along: **rejected** (never stored) →
  **stored** (immutable) → **served** (as part of latest, possibly Stale by age).
- The store transitions from **empty** (`no-data`) to **populated** on first valid
  poll (US8); panels transition Missing → Fresh accordingly.
- On gateway failure/malformed payloads the store does **not** transition (last good
  reading remains latest); panels flip Fresh → Stale by age until a valid poll
  (US9).
