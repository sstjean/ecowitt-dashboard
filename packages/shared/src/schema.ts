import { z } from "zod";

/** A finite number (rejects NaN/Infinity). */
const finite = () => z.number().finite();

/** ISO-8601 UTC instant, e.g. "2026-06-21T18:05:00Z". */
const isoUtc = () => z.iso.datetime();

/**
 * LiveReadingSnapshot — the curated 27-field dashboard projection.
 * Strict: unknown keys are rejected (mirrors OpenAPI additionalProperties:false).
 */
export const liveReadingSnapshotSchema = z.strictObject({
  observedAt: isoUtc(),
  outdoorTempF: finite(),
  feelsLikeF: finite(),
  dewpointF: finite(),
  outdoorHumidityPct: finite().min(0).max(100),
  dayHighF: finite(),
  dayLowF: finite(),
  windMph: finite().min(0),
  windDirDeg: finite().min(0).max(360),
  gustMph: finite().min(0),
  windAvg10mMph: finite().min(0),
  windAvg10mDirDeg: finite().min(0).max(360),
  maxDailyGustMph: finite().min(0),
  maxDailyGustDir: z.string(),
  solarWm2: finite().min(0),
  uvIndex: finite().min(0),
  indoorTempF: finite(),
  indoorHumidityPct: finite().min(0).max(100),
  rainEventIn: finite().min(0),
  rainHourlyIn: finite().min(0),
  rainDailyIn: finite().min(0),
  rainWeeklyIn: finite().min(0),
  rainMonthlyIn: finite().min(0),
  rainYearlyIn: finite().min(0),
  rainRateInHr: finite().min(0),
  isRaining: z.boolean(),
  pressureHpa: finite().min(0),
});
export type LiveReadingSnapshot = z.infer<typeof liveReadingSnapshotSchema>;

/**
 * The instantaneous fields the gateway mapper can fill directly.
 * Excludes the four aggregates the API derives from stored history
 * (dayHighF, dayLowF, windAvg10mMph, maxDailyGustDir).
 */
export const mappedReadingSchema = liveReadingSnapshotSchema.omit({
  dayHighF: true,
  dayLowF: true,
  windAvg10mMph: true,
  maxDailyGustDir: true,
});
export type MappedReading = z.infer<typeof mappedReadingSchema>;

/** The four aggregates derived API-side from stored history (§7b). */
export const dailyDerivedSchema = z.strictObject({
  dayHighF: finite(),
  dayLowF: finite(),
  windAvg10mMph: finite().min(0),
  maxDailyGustDir: z.string(),
});
export type DailyDerived = z.infer<typeof dailyDerivedSchema>;

/** FullMetricMap — the lossless flat capture of every reported field. */
export const fullMetricMapSchema = z.record(
  z.string(),
  z.union([z.number(), z.string()]),
);
export type FullMetricMap = z.infer<typeof fullMetricMapSchema>;

/** A single category item from the gateway, e.g. { id: "0x02", val: "72.0" }. */
export const gatewayItemSchema = z.object({
  id: z.string(),
  val: z.string(),
  unit: z.string().optional(),
});
export type GatewayItem = z.infer<typeof gatewayItemSchema>;

/** The built-in indoor sensor block; loose so extra keys are preserved. */
export const wh25ItemSchema = z.looseObject({
  intemp: z.string(),
  inhumi: z.string(),
  abs: z.string(),
  rel: z.string(),
  unit: z.string().optional(),
});
export type Wh25Item = z.infer<typeof wh25ItemSchema>;

/**
 * GatewayResponse — the raw external payload. Loose: unknown categories flow
 * through so the mapper can capture them full-fidelity. The indoor block (wh25)
 * and piezo rain block are always present on a GW2000B.
 */
export const gatewayResponseSchema = z.looseObject({
  common_list: z.array(gatewayItemSchema),
  wh25: z.array(wh25ItemSchema).min(1),
  piezoRain: z.array(gatewayItemSchema).min(1),
  rain: z.array(gatewayItemSchema).optional(),
});
export type GatewayResponse = z.infer<typeof gatewayResponseSchema>;

/** AstronomicalData — SunCalc-derived sun/moon context. */
export const astronomicalDataSchema = z.strictObject({
  sunriseUtc: isoUtc(),
  sunsetUtc: isoUtc(),
  sunAltitudeFraction: finite().min(0).max(1),
  moonPhase: finite().min(0).max(1),
});
export type AstronomicalData = z.infer<typeof astronomicalDataSchema>;

/** BarometricTrend — 3h window trend (or unavailable). */
export const barometricTrendSchema = z.strictObject({
  direction: z.enum(["rising", "steady", "falling", "unavailable"]),
  deltaHpa: z.union([z.number(), z.null()]),
});
export type BarometricTrend = z.infer<typeof barometricTrendSchema>;

/** The NWS-mapped sky-condition icon vocabulary. */
export const conditionIconSchema = z.enum([
  "clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "rainy",
  "snow",
  "thunderstorm",
  "night",
]);
export type ConditionIcon = z.infer<typeof conditionIconSchema>;

/** LatestSnapshot — the `/api/v1/latest` envelope. */
export const latestSnapshotSchema = z.strictObject({
  status: z.enum(["ok", "no-data"]),
  observedAt: z.union([isoUtc(), z.null()]),
  reading: z.union([liveReadingSnapshotSchema, z.null()]),
  astro: astronomicalDataSchema,
  baroTrend: barometricTrendSchema,
  conditionIcon: z.union([conditionIconSchema, z.null()]),
  conditionStale: z.boolean(),
  serverTime: isoUtc(),
});
export type LatestSnapshot = z.infer<typeof latestSnapshotSchema>;

/** Health — liveness/readiness probe. */
export const healthSchema = z.strictObject({
  status: z.enum(["ok", "degraded"]),
  storeReachable: z.boolean(),
  serverTime: isoUtc(),
});
export type Health = z.infer<typeof healthSchema>;
