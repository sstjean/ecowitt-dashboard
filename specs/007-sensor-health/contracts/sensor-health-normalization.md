# Contract: Sensor Health Normalization

**Branch**: `007-sensor-health` | **Home**: `packages/shared/src/schema.ts`

Pure function that projects a raw `get_sensors_info` payload into the served
`SensorHealthEntry[]`. Single-sourced in `@ecowitt/shared` so the poller (writer) and tests
agree on the exact projection. No I/O, no clock — the capture time is passed in.

## Signature

```ts
function normalizeSensorHealth(
  raw: unknown,                 // the merged RawSensorsInfo (or anything — guarded)
  capturedAtUtc: string,        // ISO-8601 UTC; becomes each entry's lastSeenUtc
): SensorHealthEntry[];
```

## Rules

### 1. Whole-payload guard
If `raw` does not parse to `{ command: [{ sensor: SensorEntry[] }] }`, return `[]`. (The poller
then skips `upsertSensorHealth`; nothing is written or corrupted.)

### 2. Exclusion (FR-003)
Drop an entry when **any** of:
- `id` ∈ `{ "FFFFFFFF", "FFFFFFFE" }` (unpaired placeholder), or
- `idst !== "1"` (not registered), or
- `id` missing/empty.

### 3. Per-entry salvage (FR-012)
For surviving entries, **skip** (do not throw) any entry whose `type` does not coerce to a
finite int. Keep valid siblings. A single malformed entry never discards the whole set.

### 4. Field projection

| Output | From | Coercion |
|--------|------|----------|
| `id` | `raw.id` | string, uppercased hex as-is |
| `img` | `raw.img` | string |
| `type` | `raw.type` | `Number(...)` → int |
| `name` | `raw.name` | string |
| `batteryRaw` | `raw.batt` | `Number(...)`; `null` if absent/NaN |
| `battery` | rule(`type`, `batteryRaw`) | see per-type table |
| `signalBars` | `raw.signal` | `Number(...)` clamped 0–4; `null` if absent/NaN |
| `rssiDbm` | `raw.rssi` | `Number(...)`; `null` if absent/NaN |
| `registered` | `raw.idst === "1"` | boolean (always `true` post-exclusion) |
| `lastSeenUtc` | `capturedAtUtc` | passthrough |

### 5. Per-type battery rule (D2)

```text
type 48 (WS90): batteryRaw == null ? Unknown : batteryRaw <= WS90_BATTERY_LOW_MAX(=1) ? Low : OK
type  7 (wh31): batteryRaw === 1 ? Low : batteryRaw === 0 ? OK : Unknown
type  4 (wh25): N/A                          // wired — also forces signalBars/rssiDbm = null
fallback:       Unknown                       // unknown type — never fabricate a level
```

### 6. Wired-sensor coercion (FR-009)
A wh25 (type 4) or any entry with no `signal`/`rssi` projects `signalBars = null`,
`rssiDbm = null`, `battery = N/A`. The UI renders "no radio / N/A", never empty bars implying
"signal lost".

## Contract tests (`packages/shared/tests/sensorHealth.test.ts`)

| Case | Expectation |
|------|-------------|
| Live WS90 (`type 48, batt 5, signal 4`) | `battery: OK`, `signalBars: 4`, `rssiDbm: -74` |
| WS90 `batt 1` / `batt 2` | `Low` / `OK` (boundary) |
| wh31 `batt 0` / `batt 1` | `OK` / `Low` (flag polarity) |
| wh25 wired (no signal/rssi) | `battery: N/A`, `signalBars: null`, `rssiDbm: null` |
| Placeholder id `FFFFFFFE` | excluded |
| `idst: "0"` | excluded |
| Unknown type with `batt 3` | `battery: Unknown` (no fabricated level) |
| One malformed entry among valid ones | malformed skipped, valid kept |
| Non-`{command:[{sensor}]}` payload | `[]` |
| `signal: "9"` (out of range) | clamped to `4` |
| Missing `batt` | `batteryRaw: null`, `battery` per rule (`Unknown` for level types) |

Every branch (each per-type rule, each exclusion path, the clamp, the salvage) is covered to
satisfy the 100% gate.
