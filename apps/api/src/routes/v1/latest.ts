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
import { resolveConditionIcon, type ConditionState, type NwsClient } from "../../nws.ts";

const TIME_ZONE = "America/New_York";

const UNAVAILABLE_CONDITION: ConditionState = {
  conditionText: null,
  conditionStale: true,
  hasObservation: false,
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
  // Resolve the condition icon at READ time from the household astro window so it
  // tracks the local clock between NWS refreshes (FR-007). Cold start (no good
  // fetch yet) stays "unavailable"; an empty-text fetch still resolves the icon
  // from astro but omits the label and is not forced stale (FR-005/FR-006).
  const conditionIcon = condition.hasObservation
    ? resolveConditionIcon(
        condition.conditionText ?? "",
        now,
        astro.sunriseUtc,
        astro.sunsetUtc,
      )
    : null;
  const conditionText =
    condition.conditionText !== null && condition.conditionText.trim() !== ""
      ? condition.conditionText
      : null;
  const conditionStale = condition.conditionStale;
  // Fetch a window wider than the trend window so a reading at/just beyond the
  // `now - windowHours` boundary exists; deriveBaroTrend anchors on it. Querying
  // exactly `now - windowHours` can never yield a full-window span (the oldest
  // row is always slightly newer than the bound), which would strand the trend.
  const baroSince = new Date(
    now.getTime() - 2 * config.baroTrendWindowHours * 60 * 60 * 1000,
  ).toISOString();
  const baroTrend = deriveBaroTrend(
    store.getWindow(baroSince),
    config.baroTrendWindowHours,
    config.baroSteadyEpsilonHpa,
    now,
  );

  const latest = store.getLatest();
  if (latest === null) {
    return latestSnapshotSchema.parse({
      status: "no-data",
      observedAt: null,
      reading: null,
      astro,
      baroTrend,
      conditionIcon,
      conditionStale,
      conditionText,
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
    conditionIcon,
    conditionStale,
    conditionText,
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
