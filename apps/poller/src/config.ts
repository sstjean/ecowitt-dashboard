import { z } from "zod";

export interface PollerConfig {
  gatewayBaseUrl: string;
  pollCadenceSeconds: number;
  sqlitePath: string;
  householdLat: number;
  householdLon: number;
}

const clampCadence = (n: number): number => Math.min(60, Math.max(30, n));

const pollerEnvSchema = z.object({
  GATEWAY_BASE_URL: z.url(),
  POLL_CADENCE_SECONDS: z.coerce.number().default(30).transform(clampCadence),
  SQLITE_PATH: z.string().min(1),
  HOUSEHOLD_LAT: z.coerce.number().min(-90).max(90),
  HOUSEHOLD_LON: z.coerce.number().min(-180).max(180),
});

/** Parse and validate the poller's environment. Throws on misconfiguration. */
export function loadPollerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PollerConfig {
  const e = pollerEnvSchema.parse(env);
  return {
    gatewayBaseUrl: e.GATEWAY_BASE_URL,
    pollCadenceSeconds: e.POLL_CADENCE_SECONDS,
    sqlitePath: e.SQLITE_PATH,
    householdLat: e.HOUSEHOLD_LAT,
    householdLon: e.HOUSEHOLD_LON,
  };
}
