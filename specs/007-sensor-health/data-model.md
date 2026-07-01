# Phase 1 Data Model: Sensor Battery & Signal Health (007)

**Branch**: `007-sensor-health` | **Date**: 2026-06-30

Defines the normalized per-sensor health projection, the per-type battery-rule registry, the
single-row snapshot table, and the `sensorHealth` envelope object. All schemas live in
`packages/shared/src/schema.ts` (single source of truth; types derived via `z.infer`).

## Entity: `SensorHealthEntry` (normalized projection)

One per **registered** sensor (placeholders excluded). Produced by `normalizeSensorHealth`
from a raw `get_sensors_info` entry; persisted by the poller; served verbatim by the API;
rendered by the web.

| Field | Type | Source / Derivation | Notes |
|-------|------|---------------------|-------|
| `id` | `string` | raw `id` (hex, e.g. `"12FAD"`) | radio id; stable per sensor |
| `img` | `string` | raw `img` (e.g. `"wh90"`) | model icon/key |
| `type` | `number` (int) | `Number(raw.type)` | drives the battery rule (D2) |
| `name` | `string` | raw `name` | human label (e.g. `"WS90"`, `"CH2"`) |
| `battery` | `"OK" \| "Low" \| "Unknown" \| "N/A"` | per-type rule on `batteryRaw` (D2) | rendered value; never "0%" |
| `batteryRaw` | `number \| null` | `Number(raw.batt)` or `null` | debug/derivation only; not rendered |
| `signalBars` | `0\|1\|2\|3\|4 \| null` | `Number(raw.signal)` clamped 0–4; `null` if wired/absent | 4-bar RF strength |
| `rssiDbm` | `number \| null` | `Number(raw.rssi)` or `null` | supplementary; `null` if wired/absent |
| `registered` | `boolean` | `raw.idst === "1"` (or id ≠ placeholder) | always `true` in the served set |
| `lastSeenUtc` | `isoUtc` | the snapshot `captured_at` (UTC) | rendered in `America/New_York` (FR-014) |

**Validation rules** (`sensorHealthEntrySchema = z.strictObject({...})`):
- `id`, `img`, `name` non-empty strings; `type` finite int.
- `battery` ∈ the 4-value enum.
- `batteryRaw`: `z.union([finite(), z.null()])`.
- `signalBars`: `z.union([z.number().int().min(0).max(4), z.null()])`.
- `rssiDbm`: `z.union([finite(), z.null()])`.
- `registered`: `z.boolean()`.
- `lastSeenUtc`: `isoUtc()`.

## Per-type battery rule registry

```text
SENSOR_HEALTH_DEFAULTS = {
  WS90_BATTERY_LOW_MAX: 1,          // WS90 level ≤ 1 of 5 ⇒ Low
  SENSOR_HEALTH_STALE_SECONDS: 300, // envelope stale threshold (D3)
}

SENSOR_BATTERY_RULES: Record<type, (raw: number | null) => Battery>
  48 (WS90/wh90):  raw == null ? Unknown : raw <= WS90_BATTERY_LOW_MAX ? Low : OK
   7 (wh31):       raw === 1 ? Low : raw === 0 ? OK : Unknown
   4 (wh25 wired): N/A            // no battery, ignores raw
  fallback (unknown type): Unknown   // never fabricate a level
```

The fallback also applies whenever battery is structurally unobtainable (wired sensor with a
stray numeric, or health snapshot stale/absent → the whole entry's battery is `Unknown` via the
envelope `stale` flag, see D3).

## Entity: snapshot table `sensor_health`

Single-row current-state cache (NOT history — FR-016). Bootstrapped idempotently by poller +
API.

```sql
CREATE TABLE IF NOT EXISTS sensor_health (
  id          INTEGER PRIMARY KEY CHECK (id = 1),  -- single row
  captured_at TEXT NOT NULL,                        -- ISO-8601 UTC of the successful fetch
  sensors_json TEXT NOT NULL                        -- JSON array of SensorHealthEntry
);
```

- **Writer** (poller): `upsertSensorHealth(capturedAtUtc, sensors)` →
  `INSERT INTO sensor_health(id, captured_at, sensors_json) VALUES (1, ?, ?)
   ON CONFLICT(id) DO UPDATE SET captured_at = excluded.captured_at,
   sensors_json = excluded.sensors_json`.
- **Reader** (API): `getSensorHealth(): { capturedAt: string; sensors: SensorHealthEntry[] } | null`
  → `SELECT captured_at, sensors_json FROM sensor_health WHERE id = 1` (parse JSON; `null` if no
  row).
- **Failure isolation**: if a poll cycle's `get_sensors_info` fetch fails, the poller **does
  not** call `upsertSensorHealth` — the prior row stays, ages, and the API marks it `stale`.

## Entity: `sensorHealth` envelope object (on `/api/v1/latest`)

```text
sensorHealthSchema = z.strictObject({
  available:      z.boolean(),                       // false when no snapshot exists (cold/cloud)
  stale:          z.boolean(),                        // captured_at older than stale threshold
  capturedAtUtc:  z.union([isoUtc(), z.null()]),      // UTC of the snapshot; null when unavailable
  sensors:        z.array(sensorHealthEntrySchema),   // [] when unavailable
})

latestSnapshotSchema = z.strictObject({
  ...existing fields (status, observedAt, reading, astro, baroTrend, conditionIcon,
     conditionStale, conditionText, rainSensorSuspect, rainSensorReason, serverTime)...,
  sensorHealth: sensorHealthSchema,   // ← NEW required field (breaking change — see plan ripple)
})
```

Computed by `buildSensorHealthEnvelope(row, now, staleSeconds)` (in `apps/api/src/sensorHealth.ts`):

| `getSensorHealth()` | `available` | `stale` | `capturedAtUtc` | `sensors` |
|---------------------|:-----------:|:-------:|-----------------|-----------|
| `null` (no row) | `false` | `true` | `null` | `[]` |
| row, `now − captured_at ≤ staleSeconds` | `true` | `false` | row's UTC | parsed entries |
| row, `now − captured_at > staleSeconds` | `true` | `true` | row's UTC | parsed entries (last-known) |

Both the `ok` and `no-data` branches of `buildLatestSnapshot` include `sensorHealth`. The
`no-data` branch (no readings yet) still surfaces whatever health snapshot exists — readings
and health are independent; if neither exists the envelope carries the empty `sensorHealth`
above.

## Normalization: validation & graceful degradation (FR-012)

`normalizeSensorHealth(raw: unknown, capturedAtUtc: string): SensorHealthEntry[]`:

1. **Whole-payload guard** — if `raw` is not a parseable `{ command:[{ sensor:[...] }] }` shape,
   return `[]` (the poller then skips the upsert; nothing is corrupted).
2. **Per-entry salvage** — iterate the sensor array; for each entry:
   - **Exclude** placeholder ids `FFFFFFFF` / `FFFFFFFE` and any entry with `idst !== "1"`
     (unpaired — FR-003).
   - **Skip** (do not throw) any entry missing a usable `id`/`type` (partial garbage); keep the
     valid siblings.
   - Project the remaining fields; apply the per-type battery rule; clamp `signalBars` to 0–4;
     coerce wired sensors (no `signal`/`rssi`) to `null` bars/rssi and `N/A` battery.
3. Return the surviving normalized entries (possibly fewer than the raw count).

**Invariant**: a malformed `get_sensors_info` response can only ever reduce the served set or
produce `available:false`/`stale` — it can **never** corrupt the `readings` table, crash the
poll cycle, or surface a fabricated value.

## State transitions (envelope freshness)

```text
        first successful fetch
 (cold) ───────────────────────────▶ (fresh: available=true, stale=false)
 available=false                          │
 stale=true                               │ captured_at ages past staleSeconds
 sensors=[]                               ▼
                                     (stale: available=true, stale=true, last-known sensors)
                                          │  next successful fetch
                                          └───────────────▶ (fresh) again
```

Cloud source (`POLLER_SOURCE=cloud`) never leaves the `cold/available=false` state because the
gateway-only endpoint is structurally unavailable (D6).

## Relationships

```text
get_sensors_info (gateway, pages 1+2)
        │  fetchSensorsInfo()  [poller only — Single Cross-VLAN]
        ▼
   raw entries ── normalizeSensorHealth() (shared) ──▶ SensorHealthEntry[]
        │  upsertSensorHealth()  [poller]
        ▼
   sensor_health (1 row)  ── getSensorHealth() [api] ──▶ buildSensorHealthEnvelope()
        │                                                       │
        │                                                       ▼
        └────────────────────────────────────────▶  sensorHealth on /api/v1/latest
                                                                │
                                          renderSnapshot() [web, presenter]
                                          ├─ sensorIndicator → cards (US2, via sensorCardMap)
                                          └─ sensorHealthPage → overlay (US3)
```
