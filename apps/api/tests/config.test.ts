import { describe, it, expect } from "vitest";
import { loadApiConfig } from "../src/config.ts";

function baseEnv(): Record<string, string> {
  return {
    SQLITE_PATH: "/data/readings.db",
    HOUSEHOLD_LAT: "40.0150",
    HOUSEHOLD_LON: "-105.2705",
    NWS_USER_AGENT: "ecowitt-dashboard (contact@example.com)",
  };
}

describe("loadApiConfig", () => {
  it("applies documented defaults when optional keys are absent", () => {
    const cfg = loadApiConfig(baseEnv());
    expect(cfg).toEqual({
      sqlitePath: "/data/readings.db",
      householdLat: 40.015,
      householdLon: -105.2705,
      nwsUserAgent: "ecowitt-dashboard (contact@example.com)",
      baroTrendWindowHours: 3,
      baroSteadyEpsilonHpa: 0.3,
      rainFullScaleIn: 4.0,
      nwsCacheTtlSeconds: 600,
      nwsStaleAfterSeconds: 3600,
      nwsTimeoutMs: 5000,
    });
  });

  it("parses overridden numeric values", () => {
    const cfg = loadApiConfig({
      ...baseEnv(),
      BARO_TREND_WINDOW_HOURS: "6",
      BARO_STEADY_EPSILON_HPA: "0.5",
      RAIN_FULL_SCALE_IN: "5",
      NWS_CACHE_TTL_SECONDS: "300",
      NWS_STALE_AFTER_SECONDS: "1800",
      NWS_TIMEOUT_MS: "2500",
    });
    expect(cfg.baroTrendWindowHours).toBe(6);
    expect(cfg.baroSteadyEpsilonHpa).toBe(0.5);
    expect(cfg.rainFullScaleIn).toBe(5);
    expect(cfg.nwsCacheTtlSeconds).toBe(300);
    expect(cfg.nwsStaleAfterSeconds).toBe(1800);
    expect(cfg.nwsTimeoutMs).toBe(2500);
  });

  it("rejects a missing SQLITE_PATH", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).SQLITE_PATH;
    expect(() => loadApiConfig(env)).toThrow();
  });

  it("rejects a missing NWS_USER_AGENT", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).NWS_USER_AGENT;
    expect(() => loadApiConfig(env)).toThrow();
  });

  it("rejects a missing HOUSEHOLD_LAT", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).HOUSEHOLD_LAT;
    expect(() => loadApiConfig(env)).toThrow();
  });

  it("rejects a non-numeric BARO_STEADY_EPSILON_HPA", () => {
    expect(() =>
      loadApiConfig({ ...baseEnv(), BARO_STEADY_EPSILON_HPA: "wide" }),
    ).toThrow();
  });
});
