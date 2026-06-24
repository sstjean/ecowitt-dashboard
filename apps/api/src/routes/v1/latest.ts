import type { FastifyInstance } from "fastify";
import {
  latestSnapshotSchema,
  liveReadingSnapshotSchema,
  projectLiveReading,
  type LatestSnapshot,
} from "@ecowitt/shared";
import type { ReadStore } from "../../store.ts";
import type { ApiConfig } from "../../config.ts";
import { deriveDaily, deriveBaroTrend, computeAstro, localDayStartIso } from "../../enrich.ts";
import type { ConditionState, NwsClient } from "../../nws.ts";

const TIME_ZONE = "America/New_York";

const UNAVAILABLE_CONDITION: ConditionState = {
  conditionIcon: null,
  conditionStale: true,
};

/**
 * Assemble the `/api/v1/latest` envelope: the curated reading projected from the
 * latest stored metrics, merged with the API-derived daily aggregates, plus the
 * SunCalc astro context, the barometric trend over the configured window, and
 * the (possibly stale) NWS condition icon.
 */
export function buildLatestSnapshot(
  store: ReadStore,
  config: ApiConfig,
  now: Date,
  condition: ConditionState,
): LatestSnapshot {
  const serverTime = now.toISOString();
  const astro = computeAstro(config.householdLat, config.householdLon, now);
  const baroSince = new Date(
    now.getTime() - config.baroTrendWindowHours * 60 * 60 * 1000,
  ).toISOString();
  const baroTrend = deriveBaroTrend(
    store.getWindow(baroSince),
    config.baroTrendWindowHours,
    config.baroSteadyEpsilonHpa,
  );

  const latest = store.getLatest();
  if (latest === null) {
    return latestSnapshotSchema.parse({
      status: "no-data",
      observedAt: null,
      reading: null,
      astro,
      baroTrend,
      conditionIcon: condition.conditionIcon,
      conditionStale: condition.conditionStale,
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
    conditionIcon: condition.conditionIcon,
    conditionStale: condition.conditionStale,
    serverTime,
  });
}

/** Register `GET /latest` on the `/api/v1` plugin. */
export function registerLatestRoute(
  app: FastifyInstance,
  store: ReadStore,
  config: ApiConfig,
  nws?: NwsClient,
): void {
  app.get("/latest", async () => {
    const now = new Date();
    let condition = UNAVAILABLE_CONDITION;
    if (nws !== undefined) {
      await nws.refresh(now);
      condition = nws.current(now);
    }
    return buildLatestSnapshot(store, config, now, condition);
  });
}
