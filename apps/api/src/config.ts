import { z } from "zod";

export interface ApiConfig {
  sqlitePath: string;
  householdLat: number;
  householdLon: number;
  nwsUserAgent: string;
  baroTrendWindowHours: number;
  baroSteadyEpsilonHpa: number;
  rainFullScaleIn: number;
  nwsCacheTtlSeconds: number;
  nwsStaleAfterSeconds: number;
  nwsTimeoutMs: number;
}

const apiEnvSchema = z.object({
  SQLITE_PATH: z.string().min(1),
  HOUSEHOLD_LAT: z.coerce.number().min(-90).max(90),
  HOUSEHOLD_LON: z.coerce.number().min(-180).max(180),
  NWS_USER_AGENT: z.string().min(1),
  BARO_TREND_WINDOW_HOURS: z.coerce.number().positive().default(3),
  BARO_STEADY_EPSILON_HPA: z.coerce.number().nonnegative().default(0.3),
  RAIN_FULL_SCALE_IN: z.coerce.number().positive().default(4.0),
  NWS_CACHE_TTL_SECONDS: z.coerce.number().nonnegative().default(600),
  NWS_STALE_AFTER_SECONDS: z.coerce.number().nonnegative().default(3600),
  NWS_TIMEOUT_MS: z.coerce.number().positive().default(5000),
});

/** Parse and validate the API's environment. Throws on misconfiguration. */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const e = apiEnvSchema.parse(env);
  return {
    sqlitePath: e.SQLITE_PATH,
    householdLat: e.HOUSEHOLD_LAT,
    householdLon: e.HOUSEHOLD_LON,
    nwsUserAgent: e.NWS_USER_AGENT,
    baroTrendWindowHours: e.BARO_TREND_WINDOW_HOURS,
    baroSteadyEpsilonHpa: e.BARO_STEADY_EPSILON_HPA,
    rainFullScaleIn: e.RAIN_FULL_SCALE_IN,
    nwsCacheTtlSeconds: e.NWS_CACHE_TTL_SECONDS,
    nwsStaleAfterSeconds: e.NWS_STALE_AFTER_SECONDS,
    nwsTimeoutMs: e.NWS_TIMEOUT_MS,
  };
}
