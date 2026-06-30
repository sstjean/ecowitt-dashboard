# Contract: Poller ↔ Gateway `get_sensors_info` Fetch

**Branch**: `007-sensor-health` | **Consumer**: `apps/poller` (sole cross-VLAN consumer)

## Scope

Adds `fetchSensorsInfo` to `apps/poller/src/gatewayClient.ts`, mirroring the existing
`fetchLivedata` contract: same `AbortController` fail-fast timeout, same typed `GatewayResult`
discriminated union, **never throws**. This is the **only** new gateway call; per the
Constitution's Single Cross-VLAN Consumer rule, no other component may make it.

## Signature

```ts
function fetchSensorsInfo(
  baseUrl: string,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,   // 5000, reused
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayResult<RawSensorsInfo>>;

type GatewayResult<T> = { ok: true; data: T } | { ok: false; error: string };
```

## Behavior

1. **Two pages**: issue `GET {baseUrl}/get_sensors_info?page=1` and `?page=2`, each under its
   own abort timeout. Page 2 is best-effort: if page 1 succeeds and page 2 fails, return page 1's
   sensors (a partial set is better than none); if page 1 fails, the call fails.
2. **Merge + dedup**: concatenate the `sensor` arrays from both pages and **dedup by `id`**
   (a sensor appearing on both pages is kept once). Placeholder ids are **not** filtered here —
   exclusion is the normalizer's job (separation of concerns).
3. **Honest fail**: any network error, timeout (`AbortError`), non-2xx status, or non-JSON body
   → `{ ok: false, error }`. The function **never throws** and never blocks the readings path.
4. **Shape**: return the raw merged payload (`RawSensorsInfo`) untouched — parsing/validation/
   projection happens in `normalizeSensorHealth` (shared), not here.

## Raw payload shape (informative)

```jsonc
// GET http://<gateway>/get_sensors_info?page=1
{
  "command": [
    { "sensor": [
      { "img": "wh90",  "type": "48", "name": "WS90", "id": "12FAD",
        "batt": "5", "rssi": "-74", "signal": "4", "idst": "1" },
      { "img": "wh31",  "type": "7",  "name": "CH2",  "id": "A0",
        "batt": "0", "rssi": "-96", "signal": "4", "idst": "1" },
      { "img": "wh57",  "type": "...","name": "...",  "id": "FFFFFFFE",
        "batt": "0", "rssi": "0",   "signal": "0", "idst": "0" }   // placeholder → dropped later
    ] }
  ]
}
```

All values are JSON **strings** (Ecowitt convention); coercion to numbers is the normalizer's
job.

## Contract tests (`apps/poller/tests/sensorsInfo.test.ts`)

| Case | Expectation |
|------|-------------|
| Both pages OK | merged, deduped raw set returned (`ok: true`) |
| Page 1 OK, page 2 network error | page-1 sensors returned (`ok: true`, best-effort) |
| Page 1 timeout (`AbortError`) | `{ ok: false, error }`, no throw |
| Non-2xx status | `{ ok: false, error }` |
| Non-JSON body | `{ ok: false, error }` |
| Duplicate id across pages | appears once in the merged set |

All cases use **injected `fetchImpl`** (static fixtures) — never the live gateway.
