import type { FastifyInstance } from "fastify";
import {
  latestSnapshotSchema,
  liveReadingSnapshotSchema,
  projectLiveReading,
  type LatestSnapshot,
} from "@ecowitt/shared";
import type { ReadStore } from "../../store.ts";
import type { ApiConfig } from "../../config.ts";
import { deriveDaily, computeAstro, localDayStartIso } from "../../enrich.ts";

const TIME_ZONE = "America/New_York";

/**
 * Assemble the `/api/v1/latest` envelope: the curated reading projected from the
 * latest stored metrics, merged with the API-derived daily aggregates, plus the
 * SunCalc astro context. Barometric trend and the NWS condition icon start as
 * their honest "unavailable" defaults and are filled in by later stories.
 */
export function buildLatestSnapshot(
  store: ReadStore,
  config: ApiConfig,
  now: Date,
): LatestSnapshot {
  const serverTime = now.toISOString();
  const astro = computeAstro(config.householdLat, config.householdLon, now);
  const baroTrend = { direction: "unavailable" as const, deltaHpa: null };

  const latest = store.getLatest();
  if (latest === null) {
    return latestSnapshotSchema.parse({
      status: "no-data",
      observedAt: null,
      reading: null,
      astro,
      baroTrend,
      conditionIcon: null,
      conditionStale: true,
      serverTime,
    });
  }

  const mapped = projectLiveReading(latest.metrics, latest.observedAt);
  const history = store.getWindow(localDayStartIso(now, TIME_ZONE));
  const daily = deriveDaily(mapped, history, now);
  const reading = liveReadingSnapshotSchema.parse({ ...mapped, ...daily });

  return latestSnapshotSchema.parse({
    status: "ok",
    observedAt: latest.observedAt,
    reading,
    astro,
    baroTrend,
    conditionIcon: null,
    conditionStale: true,
    serverTime,
  });
}

/** Register `GET /latest` on the `/api/v1` plugin. */
export function registerLatestRoute(
  app: FastifyInstance,
  store: ReadStore,
  config: ApiConfig,
): void {
  app.get("/latest", () => buildLatestSnapshot(store, config, new Date()));
}
