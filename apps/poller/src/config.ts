import { z } from "zod";

export interface PollerConfig {
  source: "gateway" | "cloud";
  gatewayBaseUrl?: string;
  pollCadenceSeconds: number;
  sqlitePath: string;
  householdLat: number;
  householdLon: number;
  ecowittAppKey?: string;
  ecowittApiKey?: string;
  ecowittMac?: string;
  ecowittApiBaseUrl?: string;
}

const clampCadence = (n: number): number => Math.min(60, Math.max(30, n));

/** Treat an empty env var (e.g. an unset `${VAR}` in compose) as absent. */
const emptyToUndefined = (v: unknown): unknown => (v === "" ? undefined : v);

const pollerEnvSchema = z
  .object({
    POLLER_SOURCE: z.enum(["gateway", "cloud"]).default("gateway"),
    GATEWAY_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    POLL_CADENCE_SECONDS: z.coerce.number().default(30).transform(clampCadence),
    SQLITE_PATH: z.string().min(1),
    HOUSEHOLD_LAT: z.coerce.number().min(-90).max(90),
    HOUSEHOLD_LON: z.coerce.number().min(-180).max(180),
    ECOWITT_APP_KEY: z.string().optional(),
    ECOWITT_API_KEY: z.string().optional(),
    ECOWITT_MAC: z.string().optional(),
    ECOWITT_API_BASE_URL: z.url().default("https://api.ecowitt.net"),
  })
  .superRefine((e, ctx) => {
    if (e.POLLER_SOURCE === "gateway" && !e.GATEWAY_BASE_URL) {
      ctx.addIssue({
        code: "custom",
        message: "GATEWAY_BASE_URL is required when POLLER_SOURCE=gateway",
        path: ["GATEWAY_BASE_URL"],
      });
    }
    if (e.POLLER_SOURCE === "cloud") {
      for (const key of ["ECOWITT_APP_KEY", "ECOWITT_API_KEY", "ECOWITT_MAC"] as const) {
        if (!e[key]) {
          ctx.addIssue({
            code: "custom",
            message: `${key} is required when POLLER_SOURCE=cloud`,
            path: [key],
          });
        }
      }
    }
  });

/** Parse and validate the poller's environment. Throws on misconfiguration. */
export function loadPollerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PollerConfig {
  const e = pollerEnvSchema.parse(env);
  const base = {
    pollCadenceSeconds: e.POLL_CADENCE_SECONDS,
    sqlitePath: e.SQLITE_PATH,
    householdLat: e.HOUSEHOLD_LAT,
    householdLon: e.HOUSEHOLD_LON,
  };
  if (e.POLLER_SOURCE === "cloud") {
    return {
      source: "cloud",
      ...base,
      ecowittAppKey: e.ECOWITT_APP_KEY!,
      ecowittApiKey: e.ECOWITT_API_KEY!,
      ecowittMac: e.ECOWITT_MAC!,
      ecowittApiBaseUrl: e.ECOWITT_API_BASE_URL,
    };
  }
  return { source: "gateway", ...base, gatewayBaseUrl: e.GATEWAY_BASE_URL! };
}
