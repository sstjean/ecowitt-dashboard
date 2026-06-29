# Contract: `/api/v1/latest` envelope additions

**Branch**: `008-rain-fault-detection` | **Date**: 2026-06-29

**No new endpoint** (FR-008). The two fields below are added to the existing
`latestSnapshotSchema` (`packages/shared/src/schema.ts`) and populated by
`buildLatestSnapshot` in `apps/api/src/routes/v1/latest.ts`.

## New fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `rainSensorSuspect` | `boolean` | yes | `true` when the WS90 piezo gauge is likely **not measuring** during active weather (storm signature + silent gauge). `false` for genuine dry conditions, working gauge, or insufficient data. |
| `rainSensorReason` | `string \| null` | yes | Human-readable summary of the fired signals when `rainSensorSuspect` is `true`; `null` otherwise. |

### Zod

```ts
// added to the existing z.strictObject({ ... }) for latestSnapshotSchema
rainSensorSuspect: z.boolean(),
rainSensorReason: z.union([z.string(), z.null()]),
```

`strictObject` means both fields are **mandatory** on every envelope — both the `ok`
(data) branch and the `no-data` branch of `buildLatestSnapshot` must emit them.

## Population rules

| Envelope branch | `rainSensorSuspect` | `rainSensorReason` |
|-----------------|---------------------|--------------------|
| `ok` (have a reading) | result of `detectRainFault(window, now, isDay)` | result's reason |
| `no-data` (no reading) | `false` | `null` |

The route computes the window and `isDay` before calling the detector:

```ts
const window = store.getWindow(subMinutes(now, 90), now);
const isDay  = isDaytime(now, astro.sunriseUtc, astro.sunsetUtc);
const fault  = detectRainFault(window, now, isDay);
// merge fault.rainSensorSuspect / fault.rainSensorReason into the envelope
```

## Example (suspect = true)

```json
{
  "status": "ok",
  "observedAt": "2026-06-28T21:10:00.000Z",
  "reading": { "rainRate": 0.0, "rainEvent": 0.0, "...": "..." },
  "rainSensorSuspect": true,
  "rainSensorReason": "storm signature (temp -13.5°F, humidity +21%, gust 17 mph, solar -78%) with gauge at 0.00",
  "serverTime": "2026-06-28T21:10:03.000Z"
}
```

## Example (suspect = false — dry, or working gauge)

```json
{
  "status": "ok",
  "reading": { "rainRate": 0.0, "...": "..." },
  "rainSensorSuspect": false,
  "rainSensorReason": null
}
```

## Backward compatibility

Additive only. Existing consumers ignore the new fields; `apps/web` opts in by reading
`rainSensorSuspect` / `rainSensorReason` in `renderRainfall`.
