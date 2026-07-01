import type { SensorHealth } from "@ecowitt/shared";
import type { StoredSensorHealth } from "./store.ts";

/**
 * Compute the `sensorHealth` envelope object for `/api/v1/latest` from the
 * current single-row snapshot. SRP: the freshness decision (`available`/`stale`)
 * lives here, not in the route. A missing snapshot is the honest-degradation
 * state (`available:false`/`stale:true`, empty `sensors`); an aged snapshot is
 * still served as last-known but flagged `stale`. The boundary is inclusive:
 * an age exactly equal to `staleSeconds` is still fresh (`≤`).
 */
export function buildSensorHealthEnvelope(
  row: StoredSensorHealth | null,
  now: Date,
  staleSeconds: number,
): SensorHealth {
  if (row === null) {
    return { available: false, stale: true, capturedAtUtc: null, sensors: [] };
  }
  const ageSeconds = (now.getTime() - Date.parse(row.capturedAt)) / 1000;
  return {
    available: true,
    stale: ageSeconds > staleSeconds,
    capturedAtUtc: row.capturedAt,
    sensors: row.sensors,
  };
}
