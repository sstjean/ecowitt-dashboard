# Contract: Corrected `get_sensors_info` **Input** Parsing (bare-array)

**Branch**: `011-fix-sensors-info-contract` | **Supersedes**: Feature 007's
[sensors-info-fetch.md](../../007-sensor-health/contracts/sensors-info-fetch.md) raw-shape
assumption. | **Consumers**: `apps/poller/src/gatewayClient.ts` (fetch) →
`packages/shared/src/schema.ts` `normalizeSensorHealth` (projection).

> This contract corrects **only the input** side. The served
> `/api/v1/latest` `sensorHealth` envelope and `SensorHealthEntry` output contract are
> **unchanged** (see 007's `latest-envelope.md` / `sensor-health-normalization.md`).

## 1. Wire shape — bare JSON array per page (CANONICAL)

Each page is a **bare JSON array**; there is **no** `command`/`sensor` wrapper.

```jsonc
// GET http://<gateway>/get_sensors_info?page=1   → 16-element array (real capture, de-identified)
[
  {"img":"wh85","type":"49","name":"Wind & Rain","id":"FFFFFFFF","batt":"9","rssi":"--","signal":"--","idst":"1"},
  {"img":"wh90","type":"48","name":"Temp & Humidity & Solar & Wind & Rain","version":"160","id":"1242D","batt":"5","rssi":"-76","signal":"4","idst":"1"},
  // … 14 more placeholder rows (FFFFFFFF/FFFFFFFE, rssi/signal "--") …
]
```

```jsonc
// GET http://<gateway>/get_sensors_info?page=2   → 16-element array
[
  {"img":"wh31","type":"7","name":"Temp & Humidity CH2","id":"A0","batt":"0","rssi":"-94","signal":"4","idst":"1"},
  // … 15 placeholder rows (FFFFFFFF, rssi/signal "--") …
]
```

All values are JSON **strings**. `id ∈ {FFFFFFFF, FFFFFFFE}` marks an unpaired placeholder slot.

## 2. Fetch signature (unchanged) & behavior (corrected)

```ts
type RawSensorsInfo = unknown[]; // bare array of raw sensor entries (was { command:[{ sensor }] })

function fetchSensorsInfo(
  baseUrl: string,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,   // 5000, reused
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayResult<RawSensorsInfo>>;   // GatewayResult unchanged
```

1. **Two pages**, each under its own `AbortController` timeout — unchanged.
2. **Per-page parse (CORRECTED)**: read the body and treat it as a bare array. A body that is
   **not an array** (empty, missing, non-JSON, or garbage object) contributes **zero** sensors
   and is **skipped** — never throws (FR-002).
3. **Merge + dedup by `id`** across pages (first occurrence wins) — unchanged.
4. **Best-effort page 2**: page 1 failure fails the call; page 2 failure returns page 1's
   sensors — unchanged.
5. **Never throws**, never blocks the readings path (007 US4) — unchanged.
6. Return the merged **array** as `RawSensorsInfo` (no wrapper).

## 3. Normalizer behavior (corrected)

```ts
function normalizeSensorHealth(raw: unknown, capturedAtUtc: string): SensorHealthEntry[];
```

1. **Whole-payload guard (CORRECTED)**: if `raw` is not an array ⇒ return `[]` (was: walk
   `command[0].sensor`).
2. **Per-entry projection** (unchanged fields), with two corrected rules:
   - **Registered (CORRECTED)**: keep the entry iff `id` is a non-empty string **not** in
     `{FFFFFFFF, FFFFFFFE}`. **Do NOT gate on `idst`.**
   - **Coercion (guard exercised)**: `rssi`/`signal` of `"--"` (or any non-numeric string) ⇒
     `null` (never `NaN`, never `0`).
3. **Per-entry salvage** (unchanged): a single entry with a non-numeric `type` is skipped
   without discarding its siblings.
4. **Battery rules** (unchanged): type 48 `≤1 ⇒ Low` else `OK` (null ⇒ `Unknown`); type 7
   `0 ⇒ OK` / `1 ⇒ Low` (else `Unknown`); unknown type ⇒ `Unknown`.

## 4. Expected projection from the canonical captures

| Sensor | `id` | `type` | `battery` | `signalBars` | `rssiDbm` | `registered` |
|--------|------|--------|-----------|--------------|-----------|--------------|
| WS90 | `1242D` | 48 | `OK` | 4 | −76 | true |
| wh31 CH2 | `A0` | 7 | `OK` | 4 | −94 | true |

Served `sensorHealth.sensors` = exactly these two; zero placeholder ids.

## 5. Contract tests (all use injected fixtures — never the live gateway)

### Poller `fetchSensorsInfo`

| Case | Expectation |
|------|-------------|
| Both real pages (bare arrays) | merged, deduped array returned (`ok: true`) |
| Page 1 OK, page 2 network error | page-1 sensors returned (`ok: true`, best-effort) |
| Page 2 body is a **non-array** (garbage/empty) | page skipped; page-1 sensors returned; no throw |
| Page 1 timeout (`AbortError`) | `{ ok: false, error }`, no throw |
| Non-2xx status | `{ ok: false, error }` |
| Non-JSON body | `{ ok: false, error }` |
| Duplicate `id` across pages | appears once in the merged array |

### Shared `normalizeSensorHealth`

| Case | Expectation |
|------|-------------|
| Real merged array | projection = `{WS90 1242D, wh31 A0}` exactly; zero placeholders |
| Placeholder `id:"FFFFFFFF", idst:"1"` | excluded (registered keyed on `id`, not `idst`) |
| WS90 row (`batt 5, signal 4, rssi −76`) | `battery OK`, `signalBars 4`, `rssiDbm −76` |
| wh31 row (`batt 0`) | `battery OK` (flag 0), never "0% empty" |
| Row with `rssi:"--"`/`signal:"--"` | coerces to `null`, never `NaN`/`0` |
| Non-array payload (`garbage.json`) | returns `[]` |
| Entry with non-numeric `type` | that entry skipped; siblings kept |

## 6. Out of scope for this contract

- The served envelope / `SensorHealthEntry` schema (unchanged).
- Indoor/baro battery from `get_livedata_info` `wh25[]` (future enhancement).
- Any firmware variant re-adding a `command` wrapper (device emits a bare array today).
