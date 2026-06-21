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
| `dewpointF` | number | °F | Supporting readout (FR-011). |
| `outdoorHumidityPct` | number | % | Supporting readout (FR-011). |
| `dayHighF` | number | °F | Gateway daily max, as-is (FR-010/FR-018b). |
| `dayLowF` | number | °F | Gateway daily min, as-is (FR-010/FR-018b). |
| `windMph` | number | mph | Current wind speed (FR-014). |
| `windDirDeg` | number (0–360) | ° | Bearing (FR-015/FR-018a). |
| `gustMph` | number | mph | Current gust (FR-016). |
| `windAvg10mMph` | number | mph | Gateway 10-min avg, as-is (FR-017/FR-018b). |
| `maxDailyGustMph` | number | mph | Gateway daily max gust, as-is (FR-018/FR-018b). |
| `maxDailyGustDir` | string (cardinal) | — | Direction of max daily gust (FR-018). |
| `solarWm2` | number | W/m² | Solar radiation (FR-019); also feeds condition icon. |
| `uvIndex` | number | — | UV index (FR-020). |
| `indoorTempF` | number | °F | Indoor ring (FR-024). |
| `indoorHumidityPct` | number | % | Indoor ring (FR-025). |
| `rainEventIn` | number | in | (FR-029). |
| `rainHourlyIn` | number | in | Drives "raining" condition rule (FR-033). |
| `rainDailyIn` | number | in | Droplet fill basis (FR-027/FR-028). |
| `rainWeeklyIn` | number | in | (FR-029). |
| `rainMonthlyIn` | number | in | (FR-029). |
| `rainYearlyIn` | number | in | (FR-029). |
| `pressureHpa` | number | hPa | Absolute/station pressure (FR-031). |

- **Validation rules**: every numeric field finite and within physical bounds
  (e.g., humidity 0–100, windDirDeg 0–360, non-negative rainfall/solar/uv). Out-of-
  bounds ⇒ the whole reading is rejected at ingestion.
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
| `conditionIcon` | `"clear" \| "cloudy" \| "rainy" \| "night"` | Deterministic (FR-033). |
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
  — never a fabricated steady/zero trend. "Steady" when |delta| is within a small
  configured epsilon.

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
| `CLEAR_SKY_WM2` | `500` | Condition-icon threshold (FR-033). |
| `BARO_TREND_WINDOW_HOURS` | `3` | Trend window (FR-032). |
| `SQLITE_PATH` | — (required) | DB file path (on Docker volume). |

- Supplied via environment / gitignored `.env.local`; documented in `.env.example`
  (FR-055). No value-bearing config in source control.

---

## Entity relationships

```text
GatewayResponse --(validate+normalise, FR-047/FR-050)--> FullMetricMap --(persist all fields)--> StoredReading
FullMetricMap --(project curated subset)--> LiveReadingSnapshot
StoredReading (latest) --(project + enrich: SunCalc + trend + icon)--> LatestSnapshot --(HTTP /api/v1/latest)--> Web client
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
