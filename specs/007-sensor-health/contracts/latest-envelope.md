# Contract: `sensorHealth` on `/api/v1/latest`

**Branch**: `007-sensor-health` | **Endpoint**: `GET /api/v1/latest` (existing — extended)

Feature 007 adds **one required object**, `sensorHealth`, to the latest-snapshot envelope. No
new endpoint. The web reads the health set off the same `/latest` payload it already polls
(FR-006), exactly as Feature 008 added `rainSensorSuspect`/`rainSensorReason`.

## ⚠️ Breaking change

`latestSnapshotSchema` is a Zod **`strictObject`**. `sensorHealth` is **required**. Every
producer of a full envelope (API routes, all unit fixtures, both e2e mocks in
`apps/web/e2e/fixtures.ts`) must include it or `.parse()` throws. See plan → "Known Ripple".

## Schema (added to `packages/shared/src/schema.ts`)

```ts
const sensorHealthEntrySchema = z.strictObject({
  id:          z.string().min(1),
  img:         z.string().min(1),
  type:        z.number().int(),
  name:        z.string().min(1),
  battery:     z.enum(["OK", "Low", "Unknown", "N/A"]),
  batteryRaw:  z.union([finite(), z.null()]),
  signalBars:  z.union([z.number().int().min(0).max(4), z.null()]),
  rssiDbm:     z.union([finite(), z.null()]),
  registered:  z.boolean(),
  lastSeenUtc: isoUtc(),
});

const sensorHealthSchema = z.strictObject({
  available:     z.boolean(),
  stale:         z.boolean(),
  capturedAtUtc: z.union([isoUtc(), z.null()]),
  sensors:       z.array(sensorHealthEntrySchema),
});

// latestSnapshotSchema gains:  sensorHealth: sensorHealthSchema,
```

## Population rules (both branches of `buildLatestSnapshot`)

`buildSensorHealthEnvelope(store.getSensorHealth(), now, SENSOR_HEALTH_STALE_SECONDS)` is called
in **both** the `ok` branch and the `no-data` branch; readings presence and health presence are
independent.

| `getSensorHealth()` | `available` | `stale` | `capturedAtUtc` | `sensors` |
|---------------------|:-----------:|:-------:|-----------------|-----------|
| `null` | `false` | `true` | `null` | `[]` |
| fresh row | `true` | `false` | row UTC | entries |
| aged row | `true` | `true` | row UTC | entries (last-known) |

## Example — healthy (`ok` branch)

```jsonc
{
  "status": "ok",
  "observedAt": "2026-06-30T14:05:00.000Z",
  "reading": { /* ... */ },
  "conditionStale": false,
  "rainSensorSuspect": false,
  "rainSensorReason": null,
  "sensorHealth": {
    "available": true,
    "stale": false,
    "capturedAtUtc": "2026-06-30T14:05:00.000Z",
    "sensors": [
      { "id": "12FAD", "img": "wh90", "type": 48, "name": "WS90",
        "battery": "OK", "batteryRaw": 5, "signalBars": 4, "rssiDbm": -74,
        "registered": true, "lastSeenUtc": "2026-06-30T14:05:00.000Z" },
      { "id": "A0", "img": "wh31", "type": 7, "name": "CH2",
        "battery": "OK", "batteryRaw": 0, "signalBars": 4, "rssiDbm": -96,
        "registered": true, "lastSeenUtc": "2026-06-30T14:05:00.000Z" }
    ]
  },
  "serverTime": "2026-06-30T14:05:03.000Z"
}
```

## Example — unavailable (cold start / cloud source / `no-data` branch)

```jsonc
{
  "status": "no-data",
  "observedAt": null,
  "reading": null,
  "rainSensorSuspect": false,
  "rainSensorReason": null,
  "sensorHealth": { "available": false, "stale": true, "capturedAtUtc": null, "sensors": [] },
  "serverTime": "2026-06-30T14:05:03.000Z"
}
```

## Contract tests (`apps/api/tests/sensorHealth.test.ts`)

| Case | Expectation |
|------|-------------|
| Fresh snapshot | `available:true, stale:false`, sensors passthrough |
| Aged snapshot (> `staleSeconds`) | `available:true, stale:true`, last-known sensors |
| No snapshot row | `available:false, stale:true, capturedAtUtc:null, sensors:[]` |
| Boundary: `now − captured_at == staleSeconds` | not stale (`≤` is fresh) |
| `no-data` envelope branch | includes a well-formed `sensorHealth` |
| Full envelope round-trips `latestSnapshotSchema.parse` | passes with `sensorHealth` present |

## Backward compatibility

Adding a required field is breaking **for fixtures/tests**, not for the live web client (which
is shipped together). The web presenter must tolerate `available:false`/`stale:true` (Unknown
render) so an older/cold deployment degrades cleanly (US4).
