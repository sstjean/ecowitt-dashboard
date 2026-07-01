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
  /**
   * Minutes until enough history exists to compute the trend. A positive integer
   * while history is still accumulating, `null` once the trend is available (or
   * when there is no data at all to estimate from).
   */
  etaMinutes: z.union([z.number().int().nonnegative(), z.null()]),
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

// ---------------------------------------------------------------------------
// Sensor battery & signal health (Feature 007). Additive contract surface: the
// per-sensor projection, the freshness-wrapped envelope object, and the tunable
// thresholds. `latestSnapshotSchema` gains the required `sensorHealth` field in
// a separate atomic step (US1a) so the additive change here stays non-breaking.
// ---------------------------------------------------------------------------

/**
 * Tunable named constants for sensor-health normalization + freshness. No magic
 * numbers: the poller (normalizer) and API (staleness) both single-source here.
 */
export const SENSOR_HEALTH_DEFAULTS = {
  /** WS90 (type 48) battery level ≤ this (of 5) ⇒ `Low`. */
  WS90_BATTERY_LOW_MAX: 1,
  /** Envelope `stale` threshold: a snapshot older than this (seconds) is stale. */
  SENSOR_HEALTH_STALE_SECONDS: 300,
} as const;

/**
 * SensorHealthEntry — the normalized per-registered-sensor health projection.
 * Strict: the poller writes exactly these fields and the web renders them
 * verbatim. `battery` is a rendered enum (never a raw "0%"); wired sensors
 * project `N/A` battery with null `signalBars`/`rssiDbm`.
 */
export const sensorHealthEntrySchema = z.strictObject({
  id: z.string().min(1),
  img: z.string().min(1),
  type: z.number().int(),
  name: z.string().min(1),
  battery: z.enum(["OK", "Low", "Unknown", "N/A"]),
  batteryRaw: z.union([finite(), z.null()]),
  signalBars: z.union([z.number().int().min(0).max(4), z.null()]),
  rssiDbm: z.union([finite(), z.null()]),
  registered: z.boolean(),
  lastSeenUtc: isoUtc(),
});
export type SensorHealthEntry = z.infer<typeof sensorHealthEntrySchema>;

/**
 * sensorHealth — the freshness-wrapped envelope object merged onto
 * `/api/v1/latest`. `available:false`/`stale:true` with an empty `sensors`
 * array is the honest-degradation state (no snapshot / cloud source / cold).
 */
export const sensorHealthSchema = z.strictObject({
  available: z.boolean(),
  stale: z.boolean(),
  capturedAtUtc: z.union([isoUtc(), z.null()]),
  sensors: z.array(sensorHealthEntrySchema),
});
export type SensorHealth = z.infer<typeof sensorHealthSchema>;

/** Radio ids the gateway reports for unpaired slots — always excluded. */
const PLACEHOLDER_IDS = new Set(["FFFFFFFF", "FFFFFFFE"]);

type Battery = SensorHealthEntry["battery"];

/** Coerce a raw string field to a finite number, or null when absent/non-numeric. */
function coerceFinite(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce a raw signal field to an integer bar count clamped 0–4, or null. */
function coerceBars(v: unknown): number | null {
  const n = coerceFinite(v);
  if (n === null) return null;
  return Math.max(0, Math.min(4, Math.trunc(n)));
}

/**
 * Per-sensor-type battery rules (keyed by numeric `type`). SRP: one rule per
 * known type; the safe fallback (`Unknown`) means an unrecognized sensor never
 * fabricates a level. WS90's `Low` threshold single-sources from
 * `SENSOR_HEALTH_DEFAULTS` (no magic number).
 */
const SENSOR_BATTERY_RULES: Record<number, (raw: number | null) => Battery> = {
  48: (raw) =>
    raw === null
      ? "Unknown"
      : raw <= SENSOR_HEALTH_DEFAULTS.WS90_BATTERY_LOW_MAX
        ? "Low"
        : "OK",
  7: (raw) => (raw === 1 ? "Low" : raw === 0 ? "OK" : "Unknown"),
  4: () => "N/A",
};

function batteryStatus(type: number, raw: number | null): Battery {
  const rule = SENSOR_BATTERY_RULES[type];
  return rule ? rule(raw) : "Unknown";
}

/**
 * A raw `get_sensors_info` payload is a **bare array** of flat sensor entries
 * (one per page, merged upstream). There is no `{ command:[{ sensor }] }`
 * wrapper — the device never emits one.
 */
export type RawSensorsInfo = unknown[];

/** Consume the merged bare array directly; a non-array payload yields `null`. */
function extractSensorArray(raw: unknown): unknown[] | null {
  return Array.isArray(raw) ? raw : null;
}

/** Project one raw entry to a health record, or `null` to exclude/skip it. */
function projectEntry(raw: unknown, capturedAtUtc: string): SensorHealthEntry | null {
  const entry = raw as Record<string, unknown>;
  const id = typeof entry.id === "string" ? entry.id : "";
  if (id === "" || PLACEHOLDER_IDS.has(id)) return null; // placeholder / missing id (FR-003)
  if (entry.idst !== "1") return null; // unregistered (FR-003)
  const type = coerceFinite(entry.type);
  if (type === null) return null; // per-entry salvage: skip malformed (FR-012)
  const typeInt = Math.trunc(type);
  const batteryRaw = coerceFinite(entry.batt);
  return {
    id,
    img: entry.img as string,
    type: typeInt,
    name: entry.name as string,
    battery: batteryStatus(typeInt, batteryRaw),
    batteryRaw,
    signalBars: coerceBars(entry.signal),
    rssiDbm: coerceFinite(entry.rssi),
    registered: true,
    lastSeenUtc: capturedAtUtc,
  };
}

/**
 * normalizeSensorHealth — pure projection of a raw (merged) `get_sensors_info`
 * payload into the served `SensorHealthEntry[]`. No I/O, no clock: `capturedAtUtc`
 * is passed in and becomes each entry's `lastSeenUtc`. A non-array payload yields
 * `[]` (whole-payload guard); placeholders and unregistered slots are excluded; a
 * single malformed entry is skipped without discarding siblings.
 */
export function normalizeSensorHealth(
  raw: unknown,
  capturedAtUtc: string,
): SensorHealthEntry[] {
  const sensors = extractSensorArray(raw);
  if (sensors === null) return [];
  const out: SensorHealthEntry[] = [];
  for (const entry of sensors) {
    const projected = projectEntry(entry, capturedAtUtc);
    if (projected !== null) out.push(projected);
  }
  return out;
}

/** LatestSnapshot — the `/api/v1/latest` envelope. */
export const latestSnapshotSchema = z.strictObject({
  status: z.enum(["ok", "no-data"]),
  observedAt: z.union([isoUtc(), z.null()]),
  reading: z.union([liveReadingSnapshotSchema, z.null()]),
  astro: astronomicalDataSchema,
  baroTrend: barometricTrendSchema,
  conditionIcon: z.union([conditionIconSchema, z.null()]),
  conditionStale: z.boolean(),
  /** The verbatim NWS sky-condition label (e.g. "Partly Sunny"); null until first fetch. */
  conditionText: z.union([z.string(), z.null()]),
  /** Rain-gauge fault heuristic (Feature 008): true ⇒ storm signature with a dead piezo. */
  rainSensorSuspect: z.boolean(),
  /** Human-readable summary of the fired proxies when suspect; null otherwise. */
  rainSensorReason: z.union([z.string(), z.null()]),
  /** Per-sensor battery & signal health (Feature 007), freshness-wrapped. */
  sensorHealth: sensorHealthSchema,
  serverTime: isoUtc(),
});
export type LatestSnapshot = z.infer<typeof latestSnapshotSchema>;

/**
 * RainFaultState — the rain-fault detector's transient result (Feature 008),
 * merged onto the `/api/v1/latest` envelope. Single source of this type: the
 * detector (`apps/api/src/rainFault.ts`) imports it from here and never
 * re-declares it.
 */
export type RainFaultState = {
  rainSensorSuspect: boolean;
  rainSensorReason: string | null;
};

/** Health — liveness/readiness probe. */
export const healthSchema = z.strictObject({
  status: z.enum(["ok", "degraded"]),
  storeReachable: z.boolean(),
  serverTime: isoUtc(),
});
export type Health = z.infer<typeof healthSchema>;

// ---------------------------------------------------------------------------
// Cloud `real_time` source (Feature 002 / LiveMock). Validates the inner
// `data` object the fetcher hands the adapter (`cloudRealtimeToGateway`);
// the envelope `code`/`msg` are handled by the fetcher (research D2).
// ---------------------------------------------------------------------------

/** One cloud metric as Ecowitt emits it: string-valued `{ time?, unit?, value }`. */
export const cloudMetricSchema = z.object({
  time: z.string().optional(),
  unit: z.string().optional(),
  value: z.string(),
});
export type CloudMetric = z.infer<typeof cloudMetricSchema>;

/** A named cloud group of metrics, e.g. `outdoor` or `wind`; loose so extra
 * metrics are tolerated and ignored. */
const cloudGroup = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

/**
 * The cloud `real_time` `data` object: only the groups the adapter consumes are
 * required (a partial payload is rejected, FR-008). Unmapped groups (and the
 * tipping-bucket `rainfall` group, D6) are tolerated and ignored.
 */
export const cloudRealtimeSchema = z.looseObject({
  outdoor: cloudGroup({
    temperature: cloudMetricSchema,
    feels_like: cloudMetricSchema,
    dew_point: cloudMetricSchema,
    humidity: cloudMetricSchema,
  }),
  indoor: cloudGroup({
    temperature: cloudMetricSchema,
    humidity: cloudMetricSchema,
  }),
  solar_and_uvi: cloudGroup({
    solar: cloudMetricSchema,
    uvi: cloudMetricSchema,
  }),
  wind: cloudGroup({
    wind_speed: cloudMetricSchema,
    wind_gust: cloudMetricSchema,
    wind_direction: cloudMetricSchema,
  }),
  pressure: cloudGroup({
    relative: cloudMetricSchema,
    absolute: cloudMetricSchema,
  }),
  rainfall_piezo: cloudGroup({
    rain_rate: cloudMetricSchema,
    event: cloudMetricSchema,
    "1_hour": cloudMetricSchema,
    daily: cloudMetricSchema,
    weekly: cloudMetricSchema,
    monthly: cloudMetricSchema,
    yearly: cloudMetricSchema,
  }),
});
export type CloudRealtimeData = z.infer<typeof cloudRealtimeSchema>;
