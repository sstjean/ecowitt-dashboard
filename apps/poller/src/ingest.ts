import {
  normalizeToFullMetricMap,
  projectLiveReading,
  type MappedReading,
} from "@ecowitt/shared";
import type { WriteStore } from "./store.ts";

export interface IngestDeps {
  store: WriteStore;
  now: () => Date;
}

/**
 * One ingest cycle: validate + normalise the raw gateway payload to the full
 * metric map, project the curated reading (this is where missing/out-of-bounds
 * required fields reject the whole payload), persist the map, and return the
 * curated snapshot. Throws on any validation failure so the scheduler can skip
 * the write and retry next cadence — the store stays untouched.
 */
export function ingestPayload(raw: unknown, deps: IngestDeps): MappedReading {
  const observedAt = deps.now().toISOString();
  const map = normalizeToFullMetricMap(raw);
  const reading = projectLiveReading(map, observedAt);
  deps.store.insertReading(observedAt, map);
  return reading;
}
