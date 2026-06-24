import { describe, it, expect } from "vitest";
import { loadPollerConfig } from "../src/config.ts";

function baseEnv(): Record<string, string> {
  return {
    GATEWAY_BASE_URL: "http://192.168.20.50",
    SQLITE_PATH: "/data/readings.db",
    HOUSEHOLD_LAT: "40.0150",
    HOUSEHOLD_LON: "-105.2705",
  };
}

describe("loadPollerConfig", () => {
  it("parses a complete environment with typed values", () => {
    const cfg = loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "45" });
    expect(cfg).toEqual({
      gatewayBaseUrl: "http://192.168.20.50",
      sqlitePath: "/data/readings.db",
      householdLat: 40.015,
      householdLon: -105.2705,
      pollCadenceSeconds: 45,
    });
  });

  it("defaults POLL_CADENCE_SECONDS to 30 when absent", () => {
    expect(loadPollerConfig(baseEnv()).pollCadenceSeconds).toBe(30);
  });

  it("clamps a below-range cadence up to 30", () => {
    expect(
      loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "5" }).pollCadenceSeconds,
    ).toBe(30);
  });

  it("clamps an above-range cadence down to 60", () => {
    expect(
      loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "120" }).pollCadenceSeconds,
    ).toBe(60);
  });

  it("rejects a non-numeric cadence", () => {
    expect(() =>
      loadPollerConfig({ ...baseEnv(), POLL_CADENCE_SECONDS: "soon" }),
    ).toThrow();
  });

  it("rejects a missing GATEWAY_BASE_URL", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).GATEWAY_BASE_URL;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects a malformed GATEWAY_BASE_URL", () => {
    expect(() => loadPollerConfig({ ...baseEnv(), GATEWAY_BASE_URL: "not a url" })).toThrow();
  });

  it("rejects a missing SQLITE_PATH", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).SQLITE_PATH;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects a missing HOUSEHOLD_LAT", () => {
    const env = baseEnv();
    delete (env as Record<string, string>).HOUSEHOLD_LAT;
    expect(() => loadPollerConfig(env)).toThrow();
  });

  it("rejects an out-of-range HOUSEHOLD_LON", () => {
    expect(() => loadPollerConfig({ ...baseEnv(), HOUSEHOLD_LON: "200" })).toThrow();
  });
});
